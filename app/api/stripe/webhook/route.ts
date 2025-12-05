import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!stripeSecretKey) {
  console.warn("STRIPE_SECRET_KEY is not set. Stripe webhooks will not work.");
}

if (!webhookSecret) {
  console.warn("STRIPE_WEBHOOK_SECRET is not set. Stripe webhooks will not verify.");
}

if (!supabaseUrl || !serviceRoleKey) {
  console.warn("Supabase admin env vars missing for webhook handler.");
}

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const supabase =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey)
    : null;

// Helper: downgrade a Stripe customer to free plan in profiles
async function downgradeCustomerToFree(
  stripeCustomerId: string,
  statusNote: string
) {
  if (!supabase) {
    console.error("Supabase client not available in downgradeCustomerToFree.");
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, plan, billing_plan, stripe_subscription_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (profileError) {
    console.error("Error fetching profile for downgrade:", profileError);
    return;
  }

  if (!profile) {
    console.warn("No profile found for Stripe customer", stripeCustomerId);
    return;
  }

  const { id: userId } = profile;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      plan: "free",
      billing_plan: "free",
      subscription_status: statusNote,
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updateError) {
    console.error("Error downgrading profile to free:", updateError);
  } else {
    console.log(
      `Downgraded user ${userId} (customer ${stripeCustomerId}) to free plan due to ${statusNote}.`
    );
  }
}

// Helper: upgrade / attach profile on checkout.session.completed
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (!supabase) {
    console.error("Supabase client not available in handleCheckoutCompleted.");
    return;
  }

  const customerId = session.customer as string | null;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  // Plan from metadata; default to pro if missing
  const metaPlan = session.metadata?.plan;
  const plan: "pro" | "studio_max" =
    metaPlan === "studio_max" ? "studio_max" : "pro";

  const email =
    session.customer_details?.email || session.customer_email || null;

  if (!email) {
    console.warn(
      "checkout.session.completed has no email; cannot map to profile. customer:",
      customerId
    );
    return;
  }

  // Look up profile by email
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  if (profileError) {
    console.error("Error fetching profile for checkout completion:", profileError);
    return;
  }

  if (!profile) {
    console.warn(
      "No profile found for checkout email; user may not have logged into studio yet:",
      email
    );
    return;
  }

  const { id: userId } = profile;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      plan,
      billing_plan: plan,
      subscription_status: "active",
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updateError) {
    console.error("Error upgrading profile from checkout completion:", updateError);
  } else {
    console.log(
      `Upgraded user ${userId} (${email}) to plan ${plan}. customer=${customerId}, subscription=${subscriptionId}`
    );
  }
}

export async function POST(req: Request) {
  if (!stripe || !webhookSecret) {
    console.error("Stripe or webhook secret not configured.");
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    console.error("Missing Stripe signature header.");
    return new NextResponse("Missing signature", { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(
          "checkout.session.completed",
          session.id,
          "customer",
          session.customer
        );
        await handleCheckoutCompleted(session);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string | null;

        if (customerId) {
          console.log(
            "invoice.payment_failed for customer",
            customerId,
            "subscription",
            (invoice as any)["subscription"] ?? null
          );

          await downgradeCustomerToFree(customerId, "payment_failed");
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string | null;
        const status = subscription.status;

        if (!customerId) break;

        console.log("subscription.updated", customerId, "status", status);

        // If subscription is no longer active or trialing, downgrade
        if (
          status === "canceled" ||
          status === "unpaid" ||
          status === "past_due"
        ) {
          await downgradeCustomerToFree(customerId, `subscription_${status}`);
        }

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string | null;

        if (customerId) {
          console.log("subscription.deleted for customer", customerId);
          await downgradeCustomerToFree(customerId, "subscription_deleted");
        }
        break;
      }

      default: {
        // For now we ignore other events
        console.log("Unhandled Stripe event type:", event.type);
      }
    }
  } catch (err: any) {
    console.error("Error handling Stripe webhook event:", err);
    // Return 200 so Stripe does not retry forever, but log for investigation
    return new NextResponse("Webhook handler error", { status: 200 });
  }

  return new NextResponse("OK", { status: 200 });
}
