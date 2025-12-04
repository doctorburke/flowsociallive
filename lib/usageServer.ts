// lib/usageServer.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_LIMITS, type BillingPlan } from "./plans";

export type UsageCheckResult = {
  allowed: boolean;
  reason?: string;
  used?: number;
  limit?: number | null;
  remaining?: number | null;
  plan?: BillingPlan;
};

/**
 * Helper to get the user's billing plan from the profiles table.
 */
async function getUserPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<BillingPlan> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("getUserPlan error", error);
    return "free";
  }

  const plan = (profile?.plan as BillingPlan) || "free";
  return plan;
}

/**
 * Checks whether the user is allowed to create another post
 * in the current monthly period, and if so, increments their usage.
 *
 * This is meant to be called from API routes like:
 * - /api/generate-caption
 * - /api/generate-image
 */
export async function checkAndIncrementPostUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<UsageCheckResult> {
  // 1) Determine user's plan
  const plan = await getUserPlan(supabase, userId);
  const limits = PLAN_LIMITS[plan];
  const limit = limits.maxPostsPerMonth; // null means "unlimited" for this plan

  // 2) Compute current billing period start (calendar month for now)
  const now = new Date();
  const monthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
    0,
    0,
    0,
    0
  );
  const periodStart = monthStart.toISOString().slice(0, 10); // "YYYY-MM-DD"

  // 3) Unlimited plans (Studio Max)
  if (limit === null) {
    const { data: usageRow, error: usageError } = await supabase
      .from("usage_stats")
      .select("id, posts_used")
      .eq("user_id", userId)
      .eq("period_start", periodStart)
      .maybeSingle();

    if (usageError && (usageError as any).code !== "PGRST116") {
      console.error("usage_stats read error (unlimited plan)", usageError);
    }

    if (!usageRow) {
      const { error: insertError } = await supabase.from("usage_stats").insert({
        user_id: userId,
        period_start: periodStart,
        posts_used: 1,
      });

      if (insertError) {
        console.error("usage_stats insert error (unlimited plan)", insertError);
      }

      return {
        allowed: true,
        used: 1,
        limit: null,
        remaining: null,
        plan,
      };
    }

    const newCount = (usageRow.posts_used ?? 0) + 1;

    const { error: updateError } = await supabase
      .from("usage_stats")
      .update({
        posts_used: newCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", usageRow.id);

    if (updateError) {
      console.error("usage_stats update error (unlimited plan)", updateError);
    }

    return {
      allowed: true,
      used: newCount,
      limit: null,
      remaining: null,
      plan,
    };
  }

  // 4) Plans with numeric monthly limits (free, pro)
  const { data: usageRow, error: usageError } = await supabase
    .from("usage_stats")
    .select("id, posts_used")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (usageError && (usageError as any).code !== "PGRST116") {
    console.error("usage_stats read error", usageError);
    return {
      allowed: false,
      reason:
        "Could not verify your monthly usage right now. Please try again in a minute.",
      used: undefined,
      limit,
      remaining: null,
      plan,
    };
  }

  // No existing row yet for this month
  if (!usageRow) {
    if (limit <= 0) {
      return {
        allowed: false,
        reason:
          "You have reached your monthly limit for this plan. Please upgrade to continue creating posts.",
        used: 0,
        limit,
        remaining: 0,
        plan,
      };
    }

    const { error: insertError } = await supabase.from("usage_stats").insert({
      user_id: userId,
      period_start: periodStart,
      posts_used: 1,
    });

    if (insertError) {
      console.error("usage_stats insert error", insertError);
      return {
        allowed: false,
        reason:
          "Could not update your usage right now. Please try again in a minute.",
        used: 0,
        limit,
        remaining: limit,
        plan,
      };
    }

    return {
      allowed: true,
      used: 1,
      limit,
      remaining: limit - 1,
      plan,
    };
  }

  const currentUsed = usageRow.posts_used ?? 0;

  if (currentUsed >= limit) {
    return {
      allowed: false,
      reason:
        "You have reached your monthly limit for this plan. Please upgrade to create more posts.",
      used: currentUsed,
      limit,
      remaining: 0,
      plan,
    };
  }

  const newCount = currentUsed + 1;

  const { error: updateError } = await supabase
    .from("usage_stats")
    .update({
      posts_used: newCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", usageRow.id);

  if (updateError) {
    console.error("usage_stats update error", updateError);
    return {
      allowed: false,
      reason:
        "Could not update your usage right now. Please try again in a minute.",
      used: currentUsed,
      limit,
      remaining: limit - currentUsed,
      plan,
    };
  }

  return {
    allowed: true,
    used: newCount,
    limit,
    remaining: limit - newCount,
    plan,
  };
}
