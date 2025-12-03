// lib/plans.ts

export type BillingPlan = "free" | "pro" | "studio_max";

export type PlanLimits = {
  maxBrands: number;
  maxPostsPerMonth: number | null; // null means "no effective limit" for now
};

export const PLAN_LIMITS: Record<BillingPlan, PlanLimits> = {
  free: {
    maxBrands: 1,
    maxPostsPerMonth: 30,
  },
  pro: {
    maxBrands: 3,
    maxPostsPerMonth: 300,
  },
  studio_max: {
    maxBrands: 50, // high ceiling for agencies
    maxPostsPerMonth: null, // treat as unlimited until we decide otherwise
  },
};
