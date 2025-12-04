// lib/usage.ts

import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { PLAN_LIMITS, BillingPlan } from "./plans";

type UsageInfo = {
  plan: BillingPlan;
  maxBrands: number;
  maxPostsPerMonth: number | null;
  postsThisMonth: number;
  brandsCount: number;
};

export async function getUsageInfo(): Promise<UsageInfo | null> {
  // Next 16: cookies() is async, so we must await it
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
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
    }
  );

  // 1) Current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("getUsageInfo auth error", userError);
    return null;
  }

  // 2) Profile / plan
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.error("getUsageInfo profile error", profileError);
  }

  const plan: BillingPlan = (profile?.plan as BillingPlan) || "free";
  const limits = PLAN_LIMITS[plan];

  // 3) Count brands for this user
  const { count: brandsCountRaw, error: brandsError } = await supabase
    .from("brands")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (brandsError) {
    console.error("getUsageInfo brands count error", brandsError);
  }

  const brandsCount = brandsCountRaw ?? 0;

  // 4) Posts used this month (from usage_stats, with safe fallback)

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

  let postsThisMonth = 0;

  try {
    // Preferred: read from usage_stats table
    const { data: usageRow, error: usageError } = await supabase
      .from("usage_stats")
      .select("posts_used")
      .eq("user_id", user.id)
      .eq("period_start", periodStart)
      .maybeSingle();

    if (usageError && (usageError as any).code !== "PGRST116") {
      console.error("getUsageInfo usage_stats error", usageError);
    }

    if (usageRow && typeof usageRow.posts_used === "number") {
      postsThisMonth = usageRow.posts_used;
    } else {
      // No row for this period means zero usage so far
      postsThisMonth = 0;
    }
  } catch (err) {
    console.error("getUsageInfo usage_stats unexpected error", err);

    // Fallback: approximate by counting posts in this calendar month
    const { count: postsCountRaw, error: postsError } = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", monthStart.toISOString());

    if (postsError) {
      console.error("getUsageInfo posts fallback error", postsError);
    }

    postsThisMonth = postsCountRaw ?? 0;
  }

  return {
    plan,
    maxBrands: limits.maxBrands,
    maxPostsPerMonth: limits.maxPostsPerMonth,
    postsThisMonth,
    brandsCount,
  };
}
