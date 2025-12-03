import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const plan = body.plan as "pro" | "studio_max" | undefined;

    if (!plan) {
      return NextResponse.json({ error: "Missing plan." }, { status: 400 });
    }

    const priceId =
      plan === "pro"
        ? process.env.STRIPE_PRICE_PRO
        : process.env.STRIPE_PRICE_STUDIO_MAX;

    if (!priceId) {
      return NextResponse.json(
        { error: "Stripe price is not configured for this plan." },
        { status: 500 }
      );
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://flowsociallive.vercel.app";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/studio?checkout=success`,
      cancel_url: `${siteUrl}/studio?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("Error creating checkout session:", err);
    return NextResponse.json(
      { error: "Could not start checkout." },
      { status: 500 }
    );
  }
}
