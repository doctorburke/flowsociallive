import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getUsageInfo } from "@/lib/usage";

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
    // Billing plan and monthly usage check
    // --------------------------------------------
    let usage = null;

    try {
      // Note: this may return null if there is no auth session
      usage = await getUsageInfo();
    } catch (e) {
      console.error("getUsageInfo threw an error:", e);
    }

    if (usage) {
      const { plan, maxPostsPerMonth, postsThisMonth } = usage;

      if (maxPostsPerMonth !== null && postsThisMonth >= maxPostsPerMonth) {
        return NextResponse.json(
          {
            error:
              "You have reached your monthly post limit for your plan.",
            code: "LIMIT_REACHED",
            plan,
          },
          { status: 402 }
        );
      }
    } else {
      // Dev mode: if we cannot read usage (no session), do NOT block
      console.warn(
        "generate-caption: usage info was null, skipping plan enforcement for this request."
      );
    }

    // --------------------------------------------
    // Existing caption + image-prompt logic
    // --------------------------------------------
    const body = await req.json();
    const userPrompt: string = body.prompt || "";
    const brand: BrandSettings = body.brandSettings || {};

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
      ? `User idea for this post: "${userPrompt.trim()}". Expand this into a strong social caption that fits the brand.`
      : `Create a new social media post idea and caption that fits this brand with no extra input from the user.`;

    // 1) Generate the caption
    const captionPrompt = `
You are a social media copywriter for a premium brand.

Use the brand details below to guide every choice of tone, topic, and angle.

${brandContext}

Task:
- Write one caption only, no hashtags.
- Speak directly to ${targetMarket}.
- Reflect the content pillars: ${contentPillars}.
- Imply or support the product or brand, but do not sound like a hard ad on every line.
- Keep it natural, human, and engaging.
- Use a single short hook in the first line.
- Do not use em dashes. If you want a break in a sentence, use a comma or " - " instead.

${userInstruction}
`.trim();

    const captionResp = await client.responses.create({
      model: "gpt-4.1-mini",
      input: captionPrompt,
    });

    const caption =
      (captionResp as any).output_text ||
      (captionResp as any).output?.[0]?.content?.[0]?.text ||
      "Could not generate caption.";

    // 2) Generate a short image prompt that matches the caption + brand
    const imagePromptPrompt = `
You are helping create a matching photo for a social media post.

Brand context:
${brandContext}

Caption:
"${caption}"

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

    return NextResponse.json({ caption, imagePrompt });
  } catch (error: any) {
    console.error("Caption generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate caption" },
      { status: 500 }
    );
  }
}
