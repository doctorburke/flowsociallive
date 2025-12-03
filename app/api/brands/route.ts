// app/api/brands/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getUsageInfo } from "@/lib/usage";

export async function POST(req: Request) {
  try {
    // --------------------------------------------
    // Plan enforcement – max brands
    // --------------------------------------------
    const usage = await getUsageInfo();

    if (!usage) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (usage.brandsCount >= usage.maxBrands) {
      return NextResponse.json(
        {
          error: "You have reached the brand limit for your plan.",
          code: "BRAND_LIMIT_REACHED",
          plan: usage.plan,
        },
        { status: 402 }
      );
    }

    // --------------------------------------------
    // Create Supabase server client (Next 16: await cookies())
    // --------------------------------------------
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

    // --------------------------------------------
    // Get current user
    // --------------------------------------------
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("Brand create auth error", userError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // --------------------------------------------
    // Read body and insert brand
    // --------------------------------------------
    const body = await req.json();
    const {
      brandName,
      industry,
      targetMarket,
      brandColorsAndStyle,
      contentPillars,
      defaultImageFocus,
      personaPrimary,
      personaSecondary,
      personaThird,
    } = body;

    const { data, error } = await supabase
      .from("brands")
      .insert({
        user_id: user.id,
        brand_name: brandName || null,
        industry: industry || null,
        target_market: targetMarket || null,
        brand_colors_and_style: brandColorsAndStyle || null,
        content_pillars: contentPillars || null,
        default_image_focus: defaultImageFocus || null,
        persona_primary: personaPrimary || null,
        persona_secondary: personaSecondary || null,
        persona_third: personaThird || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Brand insert error", error);
      return NextResponse.json(
        { error: "Failed to create brand" },
        { status: 500 }
      );
    }

    return NextResponse.json({ brand: data });
  } catch (error) {
    console.error("Brand create server error", error);
    return NextResponse.json(
      { error: "Server error while creating brand" },
      { status: 500 }
    );
  }
}
