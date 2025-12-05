import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const pricePro = process.env.STRIPE_PRICE_PRO;
const priceStudioMax = process.env.STRIPE_PRICE_STUDIO_MAX;

export async function POST(req: NextRequest) {
  try {
    if (!stripeSecret) {
      console.error("Missing STRIPE_SECRET_KEY");
      return NextResponse.json({ error: "Server config error" }, { status: 500 });
    }

    const stripe = new Stripe(stripeSecret);
    const body = await req.json();

    const plan = body.plan as "pro" | "studio_max" | undefined;
    const userId = body.userId as string | undefined;
    const userEmail = body.email as string | undefined;

    if (!plan) {
      return NextResponse.json({ error: "Missing plan." }, { status: 400 });
    }

    if (!userId || !userEmail) {
      return NextResponse.json(
        { error: "Please log in inside the Studio first so we can attach this subscription to your account." },
        { status: 401 }
      );
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

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://flowsocial.ai";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: userEmail,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],

      // ⭐ REQUIRED TO ALLOW PROMOTION CODES
      allow_promotion_codes: true,

      // ⭐⭐ CRITICAL FIX: metadata passed to subscription + session
      metadata: {
        user_id: userId,
        plan_name: plan,
      },
      subscription_data: {
        metadata: {
          user_id: userId,
          plan_name: plan,
        },
      },

      success_url: `${siteUrl}/studio?checkout=success`,
      cancel_url: `${siteUrl}/studio?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("Error creating checkout session:", err);
    return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
  }
}
