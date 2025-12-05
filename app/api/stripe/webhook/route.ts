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

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey)
  : null;


const supabase =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey)
    : null;

// Helper: upgrade / attach subscription to a user after successful checkout
async function upgradeCustomerFromCheckout(session: Stripe.Checkout.Session) {
  if (!supabase) {
    console.error("Supabase client not available in upgradeCustomerFromCheckout.");
    return;
  }

  const metadata = session.metadata || {};
  const userId = (metadata.user_id as string | undefined) || null;
  const planName =
    ((metadata.plan_name as string | undefined) || "pro") as "free" | "pro" | "studio_max";

  const customerId = (session.customer as string | null) || null;
  const subscriptionId = (session.subscription as string | null) || null;

  if (!userId) {
    console.error("checkout.session.completed: missing user_id in metadata");
    return;
  }

  console.log("Upgrading user from checkout", {
    userId,
    planName,
    customerId,
    subscriptionId,
  });

  const { error } = await supabase
    .from("profiles")
    .update({
      plan: planName,
      billing_plan: planName,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    console.error("Error upgrading profile from checkout:", error);
  } else {
    console.log(`Successfully upgraded user ${userId} to plan ${planName}.`);
  }
}

// Helper: downgrade a Stripe customer to free plan in profiles
async function downgradeCustomerToFree(stripeCustomerId: string, statusNote: string) {
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

  console.log("Received Stripe event:", event.type);

  try {
    switch (event.type) {
      // UPGRADE / ATTACH PLAN
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await upgradeCustomerFromCheckout(session);
        break;
      }

      // DOWNGRADE / CANCEL CASES
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
        console.log("Unhandled Stripe event type:", event.type);
      }
    }
  } catch (err: any) {
    console.error("Error handling Stripe webhook event:", err);
    // Still return 200 so Stripe does not retry forever
    return new NextResponse("Webhook handler error", { status: 200 });
  }

  return new NextResponse("OK", { status: 200 });
}
