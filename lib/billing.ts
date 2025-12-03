// lib/billing.ts

// Helper to require env vars with a clean error message
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// Stripe price IDs (monthly subscriptions)
export const STRIPE_PRICE_PRO = requireEnv("STRIPE_PRICE_PRO");
export const STRIPE_PRICE_STUDIO_MAX = requireEnv("STRIPE_PRICE_STUDIO_MAX");

// Acceptable plan types
export type PlanName = "pro" | "studio_max";

// Map plan -> Stripe price ID
export function getPriceForPlan(plan: PlanName): string {
  if (plan === "pro") return STRIPE_PRICE_PRO;
  if (plan === "studio_max") return STRIPE_PRICE_STUDIO_MAX;
  throw new Error(`Invalid plan: ${plan}`);
}
