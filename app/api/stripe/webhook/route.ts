import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Price IDs so we can map to plans
const pricePro = process.env.STRIPE_PRICE_PRO;
const priceStudioMax = process.env.STRIPE_PRICE_STUDIO_MAX;

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

// Map Stripe price id → internal plan name
function getPlanFromPriceId(
  priceId?: string | null
): "pro" | "studio_max" | null {
  if (!priceId) return null;
  if (priceId === pricePro) return "pro";
  if (priceId === priceStudioMax) return "studio_max";
  return null;
}

// Upgrade / attach subscription to profile
async function applyActiveSubscriptionToProfile(params: {
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  priceId: string | null;
  subscriptionStatus: string | null;
  userIdFromMetadata?: string | null;
}) {
  if (!supabase) {
    console.error("Supabase client not available in applyActiveSubscriptionToProfile.");
    return;
  }

  const {
    stripeCustomerId,
    subscriptionId,
    priceId,
    subscriptionStatus,
    userIdFromMetadata,
  } = params;

  if (!stripeCustomerId) {
    console.warn("No stripeCustomerId in applyActiveSubscriptionToProfile.");
    return;
  }

  const plan = getPlanFromPriceId(priceId) ?? "pro";

  const updateData: Record<string, any> = {
    plan,
    billing_plan: plan,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: subscriptionId,
    subscription_status: subscriptionStatus ?? "active",
    updated_at: new Date().toISOString(),
  };

  // Prefer user id from metadata if we have it
  let updateQuery = supabase.from("profiles").update(updateData);

  if (userIdFromMetadata) {
    updateQuery = updateQuery.eq("id", userIdFromMetadata);
  } else {
    // Fallback: match by customer id (in case we already attached it)
    updateQuery = updateQuery.eq("stripe_customer_id", stripeCustomerId);
  }

  const { error } = await updateQuery;

  if (error) {
    console.error("Error updating profile with subscription:", error);
  } else {
    console.log(
      "Updated profile for active subscription:",
      stripeCustomerId,
      "plan:",
      plan
    );
  }
}

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
      // ✅ Upgrade / attach subscription
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const customerId = session.customer as string | null;
        const subscriptionId = session.subscription as string | null;
        const userIdFromMetadata =
          (session.metadata?.userId as string | undefined) ?? null;

        let priceId: string | null = null;
        let subscriptionStatus: string | null = null;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(
            subscriptionId
          );
          const item = subscription.items.data[0];
          priceId = (item?.price?.id as string | undefined) ?? null;
          subscriptionStatus = subscription.status;
        }

        console.log("checkout.session.completed for customer", {
          customerId,
          subscriptionId,
          priceId,
          userIdFromMetadata,
        });

        await applyActiveSubscriptionToProfile({
          stripeCustomerId: customerId,
          subscriptionId,
          priceId,
          subscriptionStatus,
          userIdFromMetadata,
        });

        break;
      }

      // 🔻 Downgrade cases
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
          "customer.subscription.updated",
          customerId,
          "status",
          status
        );

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
          console.log(
            "customer.subscription.deleted for customer",
            customerId
          );
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
