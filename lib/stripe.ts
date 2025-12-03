// lib/stripe.ts

import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
}

// Minimal, type-safe Stripe client for your SDK version.
// Uses the account's default API version.
export const stripe = new Stripe(stripeSecretKey);
