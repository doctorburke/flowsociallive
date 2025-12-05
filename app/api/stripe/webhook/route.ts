import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!stripeSecretKey) {
  console.warn("STRIPE_SECRET_KEY is not set. Stripe webhooks will not work.");
}

if (!webhookSecret) {
  console.warn(
    "STRIPE_WEBHOOK_SECRET is not set. Stripe webhooks will not verify."
  );
}

if (!supabaseUrl || !serviceRoleKey) {
  console.warn("Supabase admin env vars missing for webhook handler.");
}

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const supabase =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey)
    : null;

type PlanName = "free" | "pro" | "studio_max";

// UPGRADE on successful checkout
async function upgradeFromCheckoutSession(session: Stripe.Checkout.Session) {
  if (!supabase) return;

  const userId = (session.metadata?.user_id || "") as string;
  if (!userId) {
    console.warn(
      "checkout.session.completed received without user_id metadata. Skipping."
    );
    return;
  }

  const planMeta = session.metadata?.plan as PlanName | undefined;
  const plan: PlanName =
    planMeta === "studio_max" ? "studio_max" : "pro";

  const customerId = session.customer as string | null;
  const subscriptionId = session.subscription as string | null;

  const update: Record<string, any> = {
    plan, // this is the enum billing_plan in your DB
    subscription_status: "active",
    updated_at: new Date().toISOString(),
  };

  if (customerId) update.stripe_customer_id = customerId;
  if (subscriptionId) update.stripe_subscription_id = subscriptionId;

  console.log("Upgrading profile", userId, "to plan", plan);

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId);

  if (error) {
    console.error("Error upgrading profile from checkout.session:", error);
  } else {
    console.log("Upgraded user", userId, "to plan", plan);
  }
}

// DOWNGRADE helper used for failures / cancellations
async function downgradeCustomerToFree(
  stripeCustomerId: string,
  statusNote: string
) {
  if (!supabase) return;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
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

  console.log(
    "Downgrading profile",
    profile.id,
    "for customer",
    stripeCustomerId,
    "due to",
    statusNote
  );

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      plan: "free",
      subscription_status: statusNote,
      stripe_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (updateError) {
    console.error("Error downgrading profile to free:", updateError);
  } else {
    console.log(
      `Downgraded user ${profile.id} (customer ${stripeCustomerId}) to free plan due to ${statusNote}.`
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
    console.error(
      "Stripe webhook signature verification failed:",
      err.message
    );
    return new NextResponse(`Webhook Error: ${err.message}`, {
      status: 400,
    });
  }

  console.log("Received Stripe event:", event.type);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription") {
          await upgradeFromCheckoutSession(session);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string | null;

        if (customerId) {
          await downgradeCustomerToFree(customerId, "payment_failed");
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string | null;

        if (customerId) {
          await downgradeCustomerToFree(
            customerId,
            "subscription_deleted"
          );
        }
        break;
      }

      default: {
        console.log("Unhandled Stripe event type:", event.type);
      }
    }
  } catch (err) {
    console.error("Error handling Stripe webhook event:", err);
    // Still return 200 so Stripe does not retry forever
    return new NextResponse("Webhook handler error", { status: 200 });
  }

  return new NextResponse("OK", { status: 200 });
}
