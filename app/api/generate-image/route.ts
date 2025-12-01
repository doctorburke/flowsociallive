import { NextResponse } from "next/server";
import OpenAI from "openai";

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

    // Infer gender from targetMarket
    const lowerTM = targetMarket.toLowerCase();
    let genderHint = "";
    if (/male|men|man|boys|guys/.test(lowerTM)) {
      genderHint =
        "The main subject must clearly be a male from this audience. Do not show a female subject as the primary person.";
    } else if (/female|women|woman|girls|ladies/.test(lowerTM)) {
      genderHint =
        "The main subject must clearly be a female from this audience. Do not show a male subject as the primary person.";
    } else {
      genderHint =
        "Choose a subject whose age, build, and energy clearly fit this audience.";
    }

    // Infer environment hint from the user text
    const lowerPrompt = userPrompt.toLowerCase();
    let environmentHint = "";
    if (
      /outdoor|outside|nature|trail|forest|park|mountain|beach|walk|hike|running path/.test(
        lowerPrompt
      )
    ) {
      environmentHint =
        "The scene must clearly be outdoors in nature, matching the user request (for example park, trail, forest, or similar). Do not show an indoor setting.";
    } else if (/gym|weight room|court|field|rink/.test(lowerPrompt)) {
      environmentHint =
        "The scene should be in a sport specific environment that matches the user request, such as a gym, court, field, or rink.";
    } else {
      environmentHint =
        "Choose an environment that naturally fits the industry and themes above.";
    }

    // Scene description
    const sceneDescription = userPrompt.trim()
      ? `User scene request (this is the primary instruction for the image, follow it literally): ${userPrompt.trim()}.`
      : `Create a compelling scene that visually represents ${brandName} for ${targetMarket}, even though the user did not supply a prompt.`;

    const imagePrompt = `
Ultra realistic photo, 4k, natural lighting, shallow depth of field.

Brand: ${brandName} (${industry}).
Target audience or customers: ${targetMarket}.
Brand colors and visual style: ${brandColorsAndStyle}.
Key themes and content pillars: ${contentPillars}.

${sceneDescription}

Guidance for the visual:
- The visual must clearly match the activity, setting, and vibe described in the user request above.
- ${genderHint}
- ${environmentHint}
- You may subtly reflect ${brandName} through clothing style, colors, or generic gear,
  but keep products unbranded: no readable logos or text.
- Use the color palette and style hints from "${brandColorsAndStyle}" in clothing,
  objects, or background details, without overdoing it.
- Avoid showing people working at a computer or desk unless the user prompt
  explicitly asks for a laptop or desk scenario.
`.trim();

    console.log("IMAGE PROMPT SENT TO OPENAI:\n", imagePrompt);

    const result = await client.images.generate({
      model: "gpt-image-1",
      prompt: imagePrompt,
      size: "1024x1024",
    });

    const imgData: any = (result as any).data?.[0] || {};
    const imageBase64: string | null = imgData.b64_json || null;
    const directUrl: string | null = imgData.url || null;

    if (!imageBase64 && !directUrl) {
      console.error("OpenAI image result had neither b64_json nor url");
      return NextResponse.json(
        { error: "No image data returned from OpenAI" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      imageBase64,
      imageUrl: directUrl,
    });
  } catch (error: any) {
    console.error("Image generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}
