import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const pricePro = process.env.STRIPE_PRICE_PRO;
const priceStudioMax = process.env.STRIPE_PRICE_STUDIO_MAX;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(req: NextRequest) {
  try {
    if (!stripeSecret) {
      console.error("Missing STRIPE_SECRET_KEY");
      return NextResponse.json(
        { error: "Server config error" },
        { status: 500 }
      );
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase env vars in checkout route.");
      return NextResponse.json(
        { error: "Server config error" },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecret);

    const body = await req.json();
    const plan = body.plan as "pro" | "studio_max" | undefined;

    if (!plan) {
      return NextResponse.json({ error: "Missing plan." }, { status: 400 });
    }

    const priceId =
      plan === "pro"
        ? pricePro
        : plan === "studio_max"
        ? priceStudioMax
        : null;

    if (!priceId) {
      return NextResponse.json(
        { error: "Stripe price is not configured for this plan." },
        { status: 500 }
      );
    }

    // 🔐 Attach the logged-in Supabase user via cookies
    const cookieStore = await cookies();

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("create-checkout-session: no logged in user", userError);
      return NextResponse.json(
        {
          error:
            "Please log in inside the Studio first so we can attach this subscription to your account.",
        },
        { status: 401 }
      );
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://flowsocial.ai";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email || undefined,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],

      // 🔥 this metadata comes back on the webhook event
      metadata: {
        plan,
        supabase_user_id: user.id,
      },
      // and also on the subscription itself
      subscription_data: {
        metadata: {
          plan,
          supabase_user_id: user.id,
        },
      },

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
