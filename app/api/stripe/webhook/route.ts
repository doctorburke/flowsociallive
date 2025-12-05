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

// helper to decide which plan string to use in Supabase
function normalizePlan(planFromMetadata: string | null | undefined): "pro" | "studio_max" {
  if (planFromMetadata === "studio_max") return "studio_max";
  return "pro";
}

// upgrade or sync a customer in profiles on successful checkout
async function upgradeCustomerFromCheckout(params: {
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  email: string | null;
  planFromMetadata: string | null | undefined;
}) {
  if (!supabase) {
    console.error("Supabase client not available in upgradeCustomerFromCheckout.");
    return;
  }

  const { stripeCustomerId, stripeSubscriptionId, email, planFromMetadata } = params;
  const plan = normalizePlan(planFromMetadata ?? null);

  // try find profile by email first, then by stripe_customer_id
  let profileResult = await supabase
    .from("profiles")
    .select("id, email, plan, stripe_customer_id")
    .eq("email", email ?? "")
    .maybeSingle();

  if (profileResult.error || !profileResult.data) {
    profileResult = await supabase
      .from("profiles")
      .select("id, email, plan, stripe_customer_id")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();
  }

  if (profileResult.error) {
    console.error("Error fetching profile for upgrade:", profileResult.error);
    return;
  }

  if (!profileResult.data) {
    console.warn(
      "No profile found to upgrade for customer",
      stripeCustomerId,
      "email",
      email
    );
    return;
  }

  const userId = profileResult.data.id;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      plan,
      billing_plan: plan,
      subscription_status: "active",
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updateError) {
    console.error("Error upgrading profile plan:", updateError);
  } else {
    console.log(
      `Upgraded user ${userId} to plan ${plan} (customer ${stripeCustomerId}).`
    );
  }
}

// downgrade helper (you already had this)
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

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string | null;
        const subscriptionId = session.subscription as string | null;
        const metadata = session.metadata || {};
        const emailFromMeta = (metadata["email"] as string | undefined) ?? null;
        const emailFromSession =
          (session.customer_details?.email as string | undefined) ?? null;

        if (customerId) {
          console.log(
            "checkout.session.completed for customer",
            customerId,
            "subscription",
            subscriptionId
          );

          await upgradeCustomerFromCheckout({
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            email: emailFromMeta ?? emailFromSession,
            planFromMetadata: metadata["plan"] as string | undefined,
          });
        }
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

        console.log(
          "subscription.updated",
          customerId,
          "status",
          status
        );

        if (
          status === "canceled" ||
          status === "unpaid" ||
          status === "past_due"
        ) {
          await downgradeCustomerToFree(
            customerId,
            `subscription_${status}`
          );
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string | null;

        if (customerId) {
          console.log(
            "subscription.deleted for customer",
            customerId
          );
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
    // return 200 so Stripe does not retry forever, but log for investigation
    return new NextResponse("Webhook handler error", { status: 200 });
  }

  return new NextResponse("OK", { status: 200 });
}
