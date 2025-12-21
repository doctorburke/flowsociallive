import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { checkAndIncrementPostUsage } from "@/lib/usageServer";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type BrandSettings = {
  brandName?: string;
  industry?: string;
  targetMarket?: string;
  brandColorsAndStyle?: string;
  contentPillars?: string;
};

function safeNoEmDash(text: string) {
  return (text || "")
    .replace(/\u2014/g, " - ")
    .replace(/\u2013/g, " - ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tryParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userPrompt: string = body.prompt || "";
    const brand: BrandSettings = body.brandSettings || {};
    const userId: string | undefined = body.userId || undefined;

    // --------------------------------------------
    // Usage enforcement: only if we have userId
    // --------------------------------------------
    if (userId) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && serviceRoleKey) {
        const supabase = createClient(supabaseUrl, serviceRoleKey);

        const usageCheck = await checkAndIncrementPostUsage(supabase, userId);

        if (!usageCheck.allowed) {
          return NextResponse.json(
            {
              error:
                usageCheck.reason ||
                "You have reached your monthly post limit for your plan.",
              code: "LIMIT_REACHED",
              plan: usageCheck.plan,
              used: usageCheck.used,
              limit: usageCheck.limit,
              remaining: usageCheck.remaining,
            },
            { status: 402 }
          );
        }
      } else {
        console.warn(
          "generate-caption: SUPABASE_SERVICE_ROLE_KEY or URL missing, skipping usage enforcement."
        );
      }
    } else {
      console.warn(
        "generate-caption: no userId in request body, skipping usage enforcement."
      );
    }

    // --------------------------------------------
    // Brand context
    // --------------------------------------------
    const brandName = brand.brandName || "this brand";
    const industry = brand.industry || "consumer brand";
    const targetMarket = brand.targetMarket || "the brand’s ideal customers";
    const brandColorsAndStyle =
      brand.brandColorsAndStyle || "clean, modern visual style";
    const contentPillars =
      brand.contentPillars || "topics that matter to this audience";

    const brandContext = `
Brand name: ${brandName}
Industry: ${industry}
Target market: ${targetMarket}
Brand colors and style: ${brandColorsAndStyle}
Content pillars: ${contentPillars}
`.trim();

    const userInstruction = userPrompt.trim()
      ? `User idea for this post: "${userPrompt.trim()}".`
      : `No user idea provided. Create a fresh post idea that fits the brand.`;

    // --------------------------------------------
    // 1) Generate 3 caption options (JSON)
    // --------------------------------------------
    const captionBundlePrompt = `
You are a social media copywriter for a premium SaaS.

Use the brand details below to guide every choice of tone, topic, and angle.

${brandContext}

User input:
${userInstruction}

Task:
- Create 3 DIFFERENT caption options for Instagram.
- Each option must be:
  - Maximum 5 sentences
  - Roughly under 650 characters
  - Instagram formatting:
    - Start with a short hook on its own line
    - Short paragraphs with blank lines between key ideas
    - Easy to scan, no wall of text
- Do NOT include hashtags inside the caption text (we add them later).
- Do NOT use em dashes. Use a comma or " - " instead.
- Keep it natural, human, and engaging.
- Make Option 1 the most direct, Option 2 slightly more story-driven, Option 3 slightly more playful.

Return ONLY valid JSON in this exact shape:
{
  "captions": ["...", "...", "..."]
}
`.trim();

    const captionBundleResp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: captionBundlePrompt,
    });

    const captionBundleRaw =
      (captionBundleResp as any).output_text ||
      (captionBundleResp as any).output?.[0]?.content?.[0]?.text ||
      "";

    const parsed = tryParseJson<{ captions: string[] }>(captionBundleRaw);

    let captionsBase =
      parsed?.captions && Array.isArray(parsed.captions) ? parsed.captions : [];

    // Fallback: if parse fails, treat entire output as one caption and duplicate
    if (captionsBase.length < 3) {
      const fallback = safeNoEmDash(captionBundleRaw) || "Could not generate caption.";
      captionsBase = [fallback, fallback, fallback];
    }

    captionsBase = captionsBase.slice(0, 3).map((c) => safeNoEmDash(c));

    // --------------------------------------------
    // 1B) Generate 3 hashtags PER caption and append
    // --------------------------------------------
    const captionsWithTags: string[] = [];

    for (const cap of captionsBase) {
      const hashtagPrompt = `
Based on this brand and caption, generate exactly 3 short, relevant hashtags.

Rules:
- No generic spam hashtags.
- No brand name hashtags unless the brand is widely known.
- Each hashtag must be simple and category-specific.
- Return only the 3 hashtags separated by spaces on one line.
- No em dashes.

Brand:
${brandContext}

Caption:
"${cap}"
`.trim();

      const hashtagResp = await client.responses.create({
        model: "gpt-4.1-mini",
        input: hashtagPrompt,
      });

      const hashtagsRaw =
        (hashtagResp as any).output_text ||
        (hashtagResp as any).output?.[0]?.content?.[0]?.text ||
        "";

      const hashtags = safeNoEmDash(hashtagsRaw).replace(/\n/g, " ").trim();

      captionsWithTags.push(hashtags ? `${cap}\n\n${hashtags}` : cap);
    }

    // --------------------------------------------
    // 2) Generate a short image prompt that matches the brand + the best caption
    // Use caption 1 as the anchor
    // --------------------------------------------
    const imagePromptPrompt = `
You are helping create a matching photo for a social media post.

Brand context:
${brandContext}

Caption:
"${captionsBase[0]}"

Write a single sentence that describes one realistic photo that would fit this caption and brand.
Include:
- who is in the photo (age, gender or vibe based on the target market),
- what they are doing,
- the setting,
- any useful mood or color hints.

Do not mention cameras, lenses, aspect ratio, text, logos, or user interface elements.
Return only the sentence, nothing else.
`.trim();

    const imagePromptResp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: imagePromptPrompt,
    });

    const imagePromptRaw =
      (imagePromptResp as any).output_text ||
      (imagePromptResp as any).output?.[0]?.content?.[0]?.text ||
      "";

    const imagePrompt = safeNoEmDash(imagePromptRaw);

    return NextResponse.json({ captions: captionsWithTags, imagePrompt });
  } catch (error: any) {
    console.error("Caption generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate caption" },
      { status: 500 }
    );
  }
}
