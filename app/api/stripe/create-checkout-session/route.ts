// app/api/stripe/create-checkout-session/route.ts

import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getPriceForPlan, type PlanName } from "@/lib/billing";

export async function POST(req: Request) {
  try {
    // ------------------------------------------
    // 1) Parse and validate requested plan
    // ------------------------------------------
    const body = (await req.json()) as { plan?: PlanName };
    const plan = body.plan;

    if (!plan || (plan !== "pro" && plan !== "studio_max")) {
      return NextResponse.json(
        { error: "Invalid or missing plan in request." },
        { status: 400 }
      );
    }

    // ------------------------------------------
    // 2) Resolve Stripe price for this plan
    // ------------------------------------------
    const priceId = getPriceForPlan(plan);

    // Build a base URL for redirects
    const host = req.headers.get("host") ?? "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ?? `${proto}://${host}`;

    // ------------------------------------------
    // 3) Create Stripe Checkout session
    // ------------------------------------------
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      billing_address_collection: "auto",
      // No customer_email here for now – Stripe will ask in checkout.
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${origin}/studio?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
      metadata: {
        plan,
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error", err);
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 500 }
    );
  }
}
