export type Plan = "free" | "pro" | "studio_max";

/**
 * Monthly post limits for each plan.
 * Use `null` to represent "effectively unlimited" in marketing.
 */
export const PLAN_POST_LIMITS: Record<Plan, number | null> = {
  free: 30,
  pro: 300,
  studio_max: null, // we will still apply a high safety cap elsewhere if needed
};

/**
 * Get the numeric monthly post limit for a plan.
 * Falls back to the free limit if the plan is missing or unknown.
 */
export function getPlanPostLimit(plan: string | null | undefined): number | null {
  const normalized = (plan ?? "free").toLowerCase();

  if (normalized === "pro") return PLAN_POST_LIMITS.pro;
  if (normalized === "studio_max") return PLAN_POST_LIMITS.studio_max;

  // default to free
  return PLAN_POST_LIMITS.free;
}

/**
 * Returns the start date of the current billing period as YYYY-MM-DD.
 * For now we align billing periods with calendar months.
 */
export function getCurrentPeriodStart(date: Date = new Date()): string {
  const periodStart = new Date(date.getFullYear(), date.getMonth(), 1);
  return periodStart.toISOString().slice(0, 10); // "YYYY-MM-DD"
}
