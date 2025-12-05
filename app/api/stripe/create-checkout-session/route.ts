import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const pricePro = process.env.STRIPE_PRICE_PRO;
const priceStudioMax = process.env.STRIPE_PRICE_STUDIO_MAX;

export async function POST(req: NextRequest) {
  try {
    if (!stripeSecret) {
      console.error("Missing STRIPE_SECRET_KEY");
      return NextResponse.json(
        { error: "Server config error" },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecret);

    const body = await req.json();
    const plan = body.plan as "pro" | "studio_max" | undefined;
    const userId = body.userId as string | undefined;
    const userEmail = body.email as string | undefined;

    if (!plan) {
      return NextResponse.json({ error: "Missing plan." }, { status: 400 });
    }

    const priceId =
      plan === "pro"
        ? pricePro
        : priceStudioMax;

    if (!priceId) {
      return NextResponse.json(
        { error: "Stripe price is not configured for this plan." },
        { status: 500 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://flowsocial.ai";

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
      customer_email: userEmail,
      // this is what the webhook will use
      metadata: {
        plan,
        user_id: userId ?? "",
        email: userEmail ?? "",
      },
      allow_promotion_codes: true,
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
