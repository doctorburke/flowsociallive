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

export async function POST(req: Request) {
  try {
    // --------------------------------------------
    // Read request body once
    // --------------------------------------------
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
    // Caption + image prompt logic
    // --------------------------------------------

    const brandName = brand.brandName || "this brand";
    const industry = brand.industry || "consumer brand";
    const targetMarket =
      brand.targetMarket || "the brand’s ideal customers";
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
      ? `User idea for this post: "${userPrompt.trim()}". Turn this into a concise, punchy social caption that fits the brand.`
      : `Create a new concise social media caption and idea that fits this brand with no extra input from the user.`;

    // 1) Generate the caption
    const captionPrompt = `
You are a social media copywriter for a premium brand.

Use the brand details below to guide every choice of tone, topic, and angle.

${brandContext}

Task:
- Write one caption only (hashtags will be added separately later).
- Keep it succinct: maximum 5 sentences and roughly under 650 characters.
- Format for Instagram:
  - Start with a short hook on its own line.
  - Use short paragraphs with blank lines between key ideas.
  - Avoid long walls of text; keep lines tight and easy to scan.
- Speak directly to ${targetMarket}.
- Reflect the content pillars: ${contentPillars}.
- Imply or support the product or brand, but do not sound like a hard ad on every line.
- Keep it natural, human, and engaging.
- Do not use em dashes. If you want a break in a sentence, use a comma or " - " instead.

${userInstruction}
`.trim();

    const captionResp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: captionPrompt,
    });

    const captionRaw =
      (captionResp as any).output_text ||
      (captionResp as any).output?.[0]?.content?.[0]?.text ||
      "Could not generate caption.";

    // Cleanup for Instagram formatting and no em dashes
    const captionClean = captionRaw
      // Normalize any em dash or en dash characters just in case
      .replace(/\u2014/g, " - ")
      .replace(/\u2013/g, " - ")
      // Trim spaces before newlines
      .replace(/\s+\n/g, "\n")
      // Avoid more than two consecutive newlines
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // --------------------------------------------
    // 1B) Generate 3 category-specific hashtags
    // --------------------------------------------
    const hashtagPrompt = `
Based on this brand and caption, generate exactly 3 short, relevant hashtags.

Rules:
- No generic spam hashtags.
- No brand name hashtags unless the brand is widely known.
- Each hashtag must be simple and category-specific.
- Return only the 3 hashtags separated by spaces on one line.

Brand:
${brandContext}

Caption:
"${captionClean}"
`.trim();

    const hashtagResp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: hashtagPrompt,
    });

    const hashtagsRaw =
      (hashtagResp as any).output_text ||
      (hashtagResp as any).output?.[0]?.content?.[0]?.text ||
      "";

    const hashtags = hashtagsRaw.trim();

    // Final caption with hashtags as last paragraph
    const finalCaption = hashtags
      ? `${captionClean}\n\n${hashtags}`
      : captionClean;

    // 2) Generate a short image prompt that matches the caption + brand
    const imagePromptPrompt = `
You are helping create a matching photo for a social media post.

Brand context:
${brandContext}

Caption:
"${captionClean}"

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

    const imagePrompt =
      (imagePromptResp as any).output_text ||
      (imagePromptResp as any).output?.[0]?.content?.[0]?.text ||
      "";

    return NextResponse.json({ caption: finalCaption, imagePrompt });
  } catch (error: any) {
    console.error("Caption generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate caption" },
      { status: 500 }
    );
  }
}
