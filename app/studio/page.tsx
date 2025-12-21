"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "../../lib/supabaseClient";
import { getPlanPostLimit, getCurrentPeriodStart } from "@/lib/planLimits";

type BrandSettings = {
  brandName: string;
  industry: string;
  targetMarket: string;
  brandColorsAndStyle: string;
  contentPillars: string;
  defaultImageFocus: string;
  personaPrimary: string;
  personaSecondary: string;
  personaThird: string;
  peopleMode: "auto" | "no_people" | "prefer_people";
};

const defaultBrandSettings: BrandSettings = {
  brandName: "",
  industry: "",
  targetMarket: "",
  brandColorsAndStyle: "",
  contentPillars: "",
  defaultImageFocus: "",
  personaPrimary: "",
  personaSecondary: "",
  personaThird: "",
  peopleMode: "auto",
};

type StudioPost = {
  id: string;
  caption: string;
  image_url: string | null;
  prompt_used: string | null;
  created_at: string;
};

type PlanUsageInfo = {
  plan: "free" | "pro" | "studio_max";
  maxPostsPerMonth: number | null;
  postsUsedThisMonth: number;
};

type PromptHumanAnalysis = {
  impliesHuman: boolean;
  explicitNoHuman: boolean;
};

export default function Page() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [brandSettings, setBrandSettings] = useState<BrandSettings>(
    defaultBrandSettings
  );
  const [brandId, setBrandId] = useState<string | null>(null);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandStatus, setBrandStatus] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [lastPromptLabel, setLastPromptLabel] = useState<string | null>(null);

  // Now supports 3 captions
  const [captions, setCaptions] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Auth state
  const [user, setUser] = useState<any | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [hasSentMagicLink, setHasSentMagicLink] = useState(false);

  // Posts history state
  const [posts, setPosts] = useState<StudioPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [selectedPost, setSelectedPost] = useState<StudioPost | null>(null);

  // Feed preview tiles (ALWAYS computed to avoid hook order issues)
  const feedTiles = useMemo(() => {
    const tiles: Array<{ src: string | null; label: string }> = [];

    // 1) Latest image currently in the editor
    if (imageUrl) tiles.push({ src: imageUrl, label: "Latest" });

    // 2) Then recent saved post images, skipping duplicates
    for (const p of posts) {
      if (!p.image_url) continue;

      if (tiles.some((t) => t.src === p.image_url)) continue;

      tiles.push({ src: p.image_url, label: "Recent" });
      if (tiles.length >= 4) break;
    }

    // 3) Pad to 4 tiles
    while (tiles.length < 4) tiles.push({ src: null, label: "Coming next" });

    return tiles.slice(0, 4);
  }, [imageUrl, posts]);

  const [checkoutNotice, setCheckoutNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Usage and plan state
  const [usageInfo, setUsageInfo] = useState<PlanUsageInfo | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  // -----------------------------
  // Premium light tokens (inline)
  // -----------------------------
  const bg = "#F6F8FF";
  const card = "bg-white/90 backdrop-blur";
  const border = "border border-slate-200/70";
  const shadow =
    "shadow-[0_20px_60px_-40px_rgba(2,6,23,0.35)] shadow-slate-900/5";
  const radius = "rounded-[28px]";
  const accent = "#0EA5E9";

  // Load user on mount and subscribe to auth changes
  useEffect(() => {
    const initAuth = async () => {
      const { data } = await supabaseBrowser.auth.getUser();
      setUser(data.user ?? null);
    };

    initAuth();

    const { data: authListener } = supabaseBrowser.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      authListener.subscription?.unsubscribe();
    };
  }, []);

  // Ensure profile exists
  useEffect(() => {
    const ensureProfile = async () => {
      if (!user) return;

      try {
        const supabase = supabaseBrowser;

        const { data, error: profileCheckError } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        if (profileCheckError && profileCheckError.code !== "PGRST116") {
          console.error("Error checking profile:", profileCheckError);
          return;
        }

        if (data) return;

        const { error: insertError } = await supabase.from("profiles").insert([
          {
            id: user.id,
            email: user.email ?? null,
            plan: "free",
            stripe_customer_id: null,
            stripe_subscription_id: null,
            subscription_status: "inactive",
          },
        ]);

        if (insertError) {
          console.error("Error creating profile:", insertError);
        }
      } catch (err) {
        console.error("ensureProfile exception:", err);
      }
    };

    ensureProfile();
  }, [user]);

  // Load current plan and monthly usage
  const refreshUsage = useCallback(async () => {
    if (!user) {
      setUsageInfo(null);
      return;
    }

    try {
      setUsageLoading(true);
      const supabase = supabaseBrowser;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError && profileError.code !== "PGRST116") {
        console.error("Error loading profile plan:", profileError);
      }

      const planRaw = (profile?.plan as string | null) ?? "free";
      const plan =
        planRaw === "pro" || planRaw === "studio_max" ? planRaw : "free";

      const maxPostsPerMonth = getPlanPostLimit(plan);
      const periodStart = getCurrentPeriodStart(new Date());

      const { data: usageRow, error: usageError } = await supabase
        .from("usage_stats")
        .select("posts_used")
        .eq("user_id", user.id)
        .eq("period_start", periodStart)
        .maybeSingle();

      if (usageError && usageError.code !== "PGRST116") {
        console.error("Error loading usage stats:", usageError);
      }

      const postsUsedThisMonth = usageRow?.posts_used ?? 0;

      setUsageInfo({
        plan,
        maxPostsPerMonth,
        postsUsedThisMonth,
      });
    } catch (err) {
      console.error("Unexpected error loading usage:", err);
      setUsageInfo(null);
    } finally {
      setUsageLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  // Load brand for current user
  useEffect(() => {
    const loadBrandForUser = async () => {
      if (!user) {
        setBrandSettings(defaultBrandSettings);
        setBrandId(null);
        return;
      }

      try {
        const { data, error: brandError } = await supabaseBrowser
          .from("brands")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (brandError) {
          console.error("Error loading brand:", brandError);
          return;
        }

        if (data) {
          setBrandId(data.id);
          setBrandSettings({
            brandName: data.brand_name || "",
            industry: data.industry || "",
            targetMarket: data.target_market || "",
            brandColorsAndStyle: data.brand_colors_and_style || "",
            contentPillars: data.content_pillars || "",
            defaultImageFocus: data.default_image_focus || "",
            personaPrimary: data.persona_primary || "",
            personaSecondary: data.persona_secondary || "",
            personaThird: data.persona_third || "",
            peopleMode:
              (data.image_people_mode as
                | "auto"
                | "no_people"
                | "prefer_people") || "auto",
          });
        } else {
          setBrandId(null);
          setBrandSettings(defaultBrandSettings);
        }
      } catch (err) {
        console.error("Load brand exception:", err);
      }
    };

    loadBrandForUser();
  }, [user]);

  // Load posts for current user and brand
  const loadPosts = useCallback(async () => {
    if (!user || !brandId) return;

    try {
      setIsLoadingPosts(true);

      const { data, error: postsError } = await supabaseBrowser
        .from("posts")
        .select("id, caption, image_url, prompt_used, created_at")
        .eq("user_id", user.id)
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (postsError) {
        console.error("Error loading posts:", postsError);
        return;
      }

      setPosts(data || []);
    } catch (err) {
      console.error("Unexpected error loading posts:", err);
    } finally {
      setIsLoadingPosts(false);
    }
  }, [user, brandId]);

  useEffect(() => {
    if (user && brandId) {
      loadPosts();
    } else {
      setPosts([]);
    }
  }, [user, brandId, loadPosts]);

  // Stripe checkout banner + URL cleanup
  useEffect(() => {
    const status = searchParams.get("checkout");
    if (!status) return;

    if (status === "success") {
      setCheckoutNotice({
        type: "success",
        text: "Your Flow Social subscription is active. Thanks for upgrading.",
      });
    } else if (status === "cancelled") {
      setCheckoutNotice({
        type: "error",
        text: "Checkout was cancelled. You can upgrade any time from the pricing page.",
      });
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("checkout");

    const newQuery = params.toString();
    const newUrl = newQuery ? `/studio?${newQuery}` : "/studio";

    router.replace(newUrl);
  }, [searchParams, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthStatus(null);
    setAuthLoading(true);

    try {
      const email = authEmail.trim();
      if (!email) {
        setAuthStatus("Please enter an email address.");
        setAuthLoading(false);
        setHasSentMagicLink(false);
        return;
      }

      const { error: signInError } = await supabaseBrowser.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/studio`,
        },
      });

      if (signInError) {
        console.error(signInError);
        const msg = (signInError.message || "").toLowerCase();

        if (msg.includes("rate") && msg.includes("limit")) {
          setAuthStatus(
            "Magic link already sent. Check your inbox or try again in a minute."
          );
          setHasSentMagicLink(true);
        } else {
          setAuthStatus("Could not send login link. Please try again.");
          setHasSentMagicLink(false);
        }
      } else {
        setAuthStatus("Magic link sent. Check your inbox.");
        setHasSentMagicLink(true);
      }
    } catch (err) {
      console.error(err);
      setAuthStatus("Something went wrong. Please try again.");
      setHasSentMagicLink(false);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await supabaseBrowser.auth.signOut();
    setUser(null);
    setBrandSettings(defaultBrandSettings);
    setBrandId(null);
    setPrompt("");
    setCaptions([]);
    setImageUrl(null);
    setLastPromptLabel(null);
    setPosts([]);
  }

  function buildPersonaList(settings: BrandSettings): string[] {
    const personas: string[] = [];

    if (settings.personaPrimary.trim())
      personas.push(settings.personaPrimary.trim());
    if (settings.personaSecondary.trim())
      personas.push(settings.personaSecondary.trim());
    if (settings.personaThird.trim()) personas.push(settings.personaThird.trim());

    if (personas.length === 0) {
      const generic =
        settings.targetMarket ||
        settings.industry ||
        "modern performance athlete who fits this brand";
      personas.push(
        `Athlete that represents this brand and target market: ${generic}`
      );
    }

    return personas;
  }

  function analyzePromptForHumans(rawPrompt: string): PromptHumanAnalysis {
    const p = rawPrompt.toLowerCase();

    const humanWords = [
      "athlete",
      "player",
      "person",
      "people",
      "man",
      "woman",
      "guy",
      "girl",
      "boy",
      "runner",
      "skater",
      "coach",
      "referee",
      "crowd",
      "fans",
      "team",
      "goalie",
      "human",
      "model",
    ];

    const noHumanPhrases = [
      "no people",
      "no person",
      "no players",
      "no crowd",
      "no fans",
      "without people",
      "without any people",
      "nobody",
      "no one",
      "empty",
      "empty arena",
      "empty rink",
      "empty ice",
    ];

    const impliesHuman = humanWords.some((w) => p.includes(w));
    const explicitNoHuman = noHumanPhrases.some((w) => p.includes(w));

    return { impliesHuman, explicitNoHuman };
  }

  function analyzeProductFocus(rawPrompt: string): boolean {
    const p = rawPrompt.toLowerCase();

    const productWords = [
      "beanie",
      "hat",
      "toque",
      "cap",
      "hoodie",
      "sweatshirt",
      "shirt",
      "jersey",
      "jacket",
      "leggings",
      "shorts",
      "socks",
      "skates",
      "skate blades",
      "stick",
      "hockey stick",
      "puck",
      "gloves",
      "helmet",
      "bag",
      "duffel",
      "gear",
      "apparel",
      "logo",
      "label",
      "tag",
      "product",
      "bottle",
      "water bottle",
    ];

    return productWords.some((w) => p.includes(w));
  }

  function buildShotHint(
    userPrompt: string,
    flags: PromptHumanAnalysis,
    isProductFocus: boolean,
    postsCount: number
  ): string {
    const index = postsCount % 4;

    if (isProductFocus) {
      const productTemplates = [
        "Hero product shot where the product is the clear main subject of the frame.",
        "Medium close up focusing on the product with the background gently blurred.",
        "Detail shot highlighting texture, materials, stitching, or key functional elements of the product.",
        "Lifestyle product shot where the environment supports the story but the product is still the star.",
      ];
      return productTemplates[index];
    }

    if (!flags.impliesHuman || flags.explicitNoHuman) {
      const nonHumanTemplates = [
        "Wide environmental shot focused on the overall scene.",
        "Medium wide shot showing the main objects and environment.",
        "Close up detail shot emphasizing textures, edges, and materials.",
        "Cinematic composition with leading lines and depth of field.",
      ];
      return nonHumanTemplates[index];
    }

    const humanTemplates = [
      "Dynamic action shot capturing movement.",
      "Medium portrait style shot from the waist up.",
      "Candid lifestyle shot with a natural pose, not overly staged.",
      "Close up shot that includes part of the athlete and their gear.",
    ];
    return humanTemplates[index];
  }

  async function handleCreatePost() {
    const userPrompt = prompt.trim();

    if (!userPrompt) {
      setError("Please describe what you want to post first.");
      return;
    }

    try {
      setIsGenerating(true);
      setError(null);
      setCaptions([]);
      setImageUrl(null);
      setCopiedIndex(null);

      setLastPromptLabel(userPrompt);

      // 1) Captions (now 3)
      const captionRes = await fetch("/api/generate-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userPrompt,
          brandSettings,
          userId: user?.id,
        }),
      });

      if (!captionRes.ok) {
        const data = await captionRes.json().catch(() => ({} as any));

        if (captionRes.status === 402 && (data as any).code === "LIMIT_REACHED") {
          setError(
            "You have reached the post limit for your current plan. Upgrade to generate more posts."
          );
          return;
        }

        setError((data as any).error || "Failed to generate caption.");
        return;
      }

      const captionJson = (await captionRes.json()) as {
        captions?: string[];
        caption?: string; // legacy fallback
        imagePrompt?: string;
      };

      const bundle =
        Array.isArray(captionJson.captions) && captionJson.captions.length
          ? captionJson.captions
          : captionJson.caption
          ? [captionJson.caption]
          : [];

      setCaptions(bundle);

      // 2) Build image prompt (your existing logic)
      const flags = analyzePromptForHumans(userPrompt);
      const isProductFocus = analyzeProductFocus(userPrompt);
      const shotHint = buildShotHint(
        userPrompt,
        flags,
        isProductFocus,
        posts.length
      );

      const brandHintsParts: string[] = [];
      if (brandSettings.brandName.trim()) {
        brandHintsParts.push(`Brand name: ${brandSettings.brandName.trim()}.`);
      }
      if (brandSettings.brandColorsAndStyle.trim()) {
        brandHintsParts.push(
          `Brand colors and style: ${brandSettings.brandColorsAndStyle.trim()}.`
        );
      }
      if (brandSettings.contentPillars.trim()) {
        brandHintsParts.push(
          `Brand themes: ${brandSettings.contentPillars.trim()}.`
        );
      }
      if (brandSettings.defaultImageFocus.trim()) {
        brandHintsParts.push(
          `Typical image focus: ${brandSettings.defaultImageFocus.trim()}.`
        );
      }

      const brandHints =
        brandHintsParts.join(" ") ||
        "Match the overall tone and quality of this performance brand.";

      const peopleMode = brandSettings.peopleMode || "auto";

      let usePersona: boolean;
      if (peopleMode === "no_people") usePersona = false;
      else if (peopleMode === "prefer_people") usePersona = !flags.explicitNoHuman;
      else usePersona = flags.impliesHuman && !flags.explicitNoHuman;

      let baseImagePrompt: string;

      if (usePersona) {
        const personas = buildPersonaList(brandSettings);
        const personaIndex = posts.length % personas.length;
        const persona = personas[personaIndex];

        baseImagePrompt = `
Create a realistic vertical 4:5 Instagram photo.

Scene:
${userPrompt}

Important visual rules:
- The image must include a human that matches the persona below.
- Do not invent extra people. Only include the one primary subject unless the user clearly requests multiple.
- The person must be engaged in an action that matches the user instruction.
- Make every specific detail from the user request visible in the image.

Persona:
${persona}

${
  isProductFocus
    ? "The product or gear in the user prompt must be clearly visible and treated as the hero of the image."
    : ""
}

Shot guidance:
${shotHint}

Brand hints for color grading, tone, and environment only. Do not override the scene:
${brandHints}

Hard rules:
- No readable logos or text.
- No UI elements, screens, overlays, watermarks, or captions.
        `.trim();
      } else {
        baseImagePrompt = `
Create a realistic vertical 4:5 Instagram photo.

Scene:
${userPrompt}

Important visual rules:
- Do not include any humans, silhouettes, reflections or shadows of people, body parts, or implied humans.
- The scene must focus entirely on the objects, environment, product, and details described by the user.

${
  isProductFocus
    ? "The product or gear mentioned by the user must be the hero of the image. Keep the environment supportive, not dominant."
    : "Focus on the environment, objects, textures, materials, and mood."
}

Shot guidance:
${shotHint}

Brand hints for color grading and mood only. Do not add brand logos:
${brandHints}

Hard rules:
- No humans.
- No implied humans.
- No readable logos or text.
- No UI elements, screens, overlays, watermarks, or captions.
        `.trim();
      }

      // 3) Image
      const imageRes = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: baseImagePrompt,
          brandSettings,
        }),
      });

      if (!imageRes.ok) {
        const data = await imageRes.json().catch(() => ({} as any));
        setError((data as any).error || "Failed to generate image.");
        return;
      }

      const imageData = await imageRes.json();

      let finalUrl: string | null = (imageData as any).imageUrl || null;

      if (!finalUrl && (imageData as any).imageBase64) {
        const b64 = (imageData as any).imageBase64 as string;
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "image/png" });
        finalUrl = URL.createObjectURL(blob);
      }

      if (!finalUrl) {
        setError("Image service did not return usable image data.");
        return;
      }

      setImageUrl(finalUrl);

      // 4) Save post (keep working)
      try {
        const captionToSave = (bundle?.[0] || "").trim(); // save the best option
        if (user && brandId && captionToSave) {
          const { error: postError } = await supabaseBrowser.from("posts").insert([
            {
              user_id: user.id,
              brand_id: brandId,
              caption: captionToSave,
              image_url: (imageData as any).imageUrl || null,
              prompt_used: userPrompt || null,
            },
          ]);

          if (postError) {
            console.error("Error saving post:", postError);
          } else {
            await loadPosts();
            await refreshUsage();
          }
        }
      } catch (postErr) {
        console.error("Unexpected error saving post:", postErr);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong.");
    } finally {
      setIsGenerating(false);
    }
  }

  function updateBrandField<K extends keyof BrandSettings>(
    key: K,
    value: BrandSettings[K]
  ) {
    setBrandSettings((prev) => ({ ...prev, [key]: value }));
    setBrandStatus(null);
  }

  async function handleSaveBrand() {
    if (!user) return;

    try {
      setBrandSaving(true);
      setBrandStatus(null);

      if (brandId) {
        const { error: updateError } = await supabaseBrowser
          .from("brands")
          .update({
            brand_name: brandSettings.brandName || null,
            industry: brandSettings.industry || null,
            target_market: brandSettings.targetMarket || null,
            brand_colors_and_style: brandSettings.brandColorsAndStyle || null,
            content_pillars: brandSettings.contentPillars || null,
            default_image_focus: brandSettings.defaultImageFocus || null,
            persona_primary: brandSettings.personaPrimary || null,
            persona_secondary: brandSettings.personaSecondary || null,
            persona_third: brandSettings.personaThird || null,
            image_people_mode: brandSettings.peopleMode || "auto",
            updated_at: new Date().toISOString(),
          })
          .eq("id", brandId)
          .eq("user_id", user.id);

        if (updateError) {
          console.error("Error updating brand:", updateError);
          setBrandStatus("Could not save brand. Please try again.");
          return;
        }
      } else {
        const { data, error: insertError } = await supabaseBrowser
          .from("brands")
          .insert([
            {
              user_id: user.id,
              brand_name: brandSettings.brandName || null,
              industry: brandSettings.industry || null,
              target_market: brandSettings.targetMarket || null,
              brand_colors_and_style: brandSettings.brandColorsAndStyle || null,
              content_pillars: brandSettings.contentPillars || null,
              default_image_focus: brandSettings.defaultImageFocus || null,
              persona_primary: brandSettings.personaPrimary || null,
              persona_secondary: brandSettings.personaSecondary || null,
              persona_third: brandSettings.personaThird || null,
              image_people_mode: brandSettings.peopleMode || "auto",
            },
          ])
          .select()
          .single();

        if (insertError) {
          console.error("Error inserting brand:", insertError);
          setBrandStatus("Could not save brand. Please try again.");
          return;
        }

        if (data?.id) setBrandId(data.id);
      }

      setBrandStatus("Brand saved.");
      setTimeout(() => setBrandStatus(null), 1500);
      setShowSettings(false);
    } catch (err) {
      console.error(err);
      setBrandStatus("Could not save brand. Please try again.");
    } finally {
      setBrandSaving(false);
    }
  }

  async function handleCopyCaption(idx: number) {
    const text = captions[idx];
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex(null), 1200);
    } catch (e) {
      console.error(e);
    }
  }

  function handleResetPost() {
    setPrompt("");
    setCaptions([]);
    setImageUrl(null);
    setLastPromptLabel(null);
    setError(null);
    setCopiedIndex(null);
  }

  // --------------------------------------------
  // Render
  // --------------------------------------------
  const isAuthed = !!user;

  return (
    <div className="min-h-screen text-slate-900" style={{ backgroundColor: bg }}>
      {/* Top bar */}
      <header className="border-b border-slate-200/80 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-semibold text-white"
              style={{ backgroundColor: accent }}
            >
              FS
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide">
                Flow Social
              </div>
              <div className="text-xs text-slate-500">Brand Studio</div>
            </div>
          </Link>

          {isAuthed ? (
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="hidden sm:inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
              >
                Back to home
              </Link>

              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
              >
                Brand Settings
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
              >
                Log out
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-500">Private beta</div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-10">
        {/* Auth gate panel */}
        {!isAuthed ? (
          <div className="mx-auto w-full max-w-md">
            <div className={`${radius} ${card} ${border} ${shadow} p-6`}>
              <h1 className="text-xl font-semibold">Sign in to your Studio</h1>
              <p className="mt-2 text-sm text-slate-600">
                Enter your email. We will send a secure magic link.
              </p>

              <form onSubmit={handleLogin} className="mt-5 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                    placeholder="you@example.com"
                    value={authEmail}
                    onChange={(e) => {
                      setAuthEmail(e.target.value);
                      setAuthStatus(null);
                      setHasSentMagicLink(false);
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={authLoading || hasSentMagicLink}
                  className={`w-full rounded-full px-4 py-2.5 text-sm font-medium ${
                    authLoading || hasSentMagicLink
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "text-white"
                  }`}
                  style={{
                    backgroundColor:
                      authLoading || hasSentMagicLink ? undefined : accent,
                  }}
                >
                  {authLoading
                    ? "Sending magic link..."
                    : hasSentMagicLink
                    ? "Magic link sent"
                    : "Send magic link"}
                </button>
              </form>

              {authStatus && (
                <p className="mt-3 text-xs text-slate-600">{authStatus}</p>
              )}

              <p className="mt-4 text-[11px] text-slate-500">
                New here or already subscribed, we will email you a login link.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Header row */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold">Brand Studio</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Generate captions and images that match your brand.
                </p>
              </div>

              <div className="text-right">
                {usageLoading && !usageInfo && (
                  <p className="text-[11px] text-slate-500">
                    Loading your plan and usage...
                  </p>
                )}
                {!usageLoading && usageInfo && (
                  <p className="text-[11px] text-slate-500">
                    Plan:{" "}
                    <span className="font-semibold text-slate-700">
                      {usageInfo.plan === "pro"
                        ? "Pro"
                        : usageInfo.plan === "studio_max"
                        ? "Studio Max"
                        : "Free"}
                    </span>{" "}
                    ·{" "}
                    {usageInfo.maxPostsPerMonth === null
                      ? `${usageInfo.postsUsedThisMonth} posts created this month`
                      : `${usageInfo.postsUsedThisMonth} of ${usageInfo.maxPostsPerMonth} used this month`}
                  </p>
                )}
              </div>
            </div>

            {/* Stripe checkout notice */}
            {checkoutNotice && (
              <div
                className={`mt-5 ${radius} ${border} ${card} ${shadow} p-4`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 h-8 w-8 rounded-2xl flex items-center justify-center text-sm font-semibold"
                    style={{
                      backgroundColor:
                        checkoutNotice.type === "success"
                          ? "#DCFCE7"
                          : "#FEF3C7",
                      color:
                        checkoutNotice.type === "success"
                          ? "#166534"
                          : "#92400E",
                    }}
                  >
                    {checkoutNotice.type === "success" ? "✓" : "!"}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-800">
                      {checkoutNotice.text}
                    </p>
                    {checkoutNotice.type === "success" && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Your plan limits will update automatically as billing
                        completes.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCheckoutNotice(null)}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Prompt card */}
            <section className={`mt-6 ${radius} ${card} ${border} ${shadow} p-6`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Prompt
                  </div>
                  <div className="text-xs text-slate-500">
                    Describe the scene, vibe, setting, and what the post should
                    feel like.
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: accent }}
                  />
                  <span className="text-xs text-slate-500">Studio light</span>
                </div>
              </div>

              <div className="mt-4">
                <textarea
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                  rows={3}
                  placeholder='Example: "Founder at a coffee shop, laptop open, warm morning light, confident tone, minimal aesthetic."'
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <p className="mt-2 text-[11px] text-slate-500">
                  Tip: For pure product or landscape shots, add "no people in
                  the image" or set People in images to Mostly no people.
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCreatePost}
                    disabled={isGenerating || !prompt.trim()}
                    className={`rounded-full px-5 py-2.5 text-sm font-medium text-white ${
                      isGenerating || !prompt.trim()
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:opacity-95"
                    }`}
                    style={{ backgroundColor: accent }}
                  >
                    {isGenerating ? "Generating..." : "Generate"}
                  </button>

                  <button
                    type="button"
                    onClick={handleResetPost}
                    className="rounded-full px-5 py-2.5 text-sm font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  >
                    Reset
                  </button>

                  {isGenerating && (
                    <span className="text-xs text-slate-500">
                      Generating caption and image. Please do not refresh.
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* Error */}
            {error && (
              <div className={`mt-5 ${radius} ${border} ${card} ${shadow} p-4`}>
                <p className="text-sm text-rose-700">{error}</p>
              </div>
            )}

            {/* Output grid */}
            {(captions.length > 0 || imageUrl) && (
              <section className="mt-6 grid gap-5 lg:grid-cols-2">
                {/* Captions */}
                <div className={`${radius} ${card} ${border} ${shadow} p-6`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        Caption
                      </div>
                      <div className="text-xs text-slate-500">
                        Three options. Copy the one that fits best.
                      </div>
                    </div>

                    {lastPromptLabel && (
                      <span
                        className="hidden sm:inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold"
                        style={{
                          backgroundColor: "#E0F2FE",
                          color: "#075985",
                        }}
                        title={lastPromptLabel}
                      >
                        Latest prompt
                      </span>
                    )}
                  </div>

                  <div className="mt-5 space-y-4">
                    {(captions.length ? captions : [])
                      .slice(0, 3)
                      .map((c, idx) => (
                        <div
                          key={idx}
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                                style={{
                                  backgroundColor:
                                    idx === 0 ? "#E0F2FE" : "#F1F5F9",
                                  color: idx === 0 ? "#075985" : "#334155",
                                }}
                              >
                                Option {idx + 1}
                                {idx === 0 ? " · Recommended" : ""}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleCopyCaption(idx)}
                              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {copiedIndex === idx ? "Copied" : "Copy"}
                            </button>
                          </div>

                          <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                            {c}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Image */}
                <div className={`${radius} ${card} ${border} ${shadow} p-6`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        Image
                      </div>
                      <div className="text-xs text-slate-500">
                        Generated in a clean studio light style.
                      </div>
                    </div>

                    {imageUrl && (
                      <a
                        href={imageUrl}
                        download="brand-post.png"
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Download
                      </a>
                    )}
                  </div>

                  <div className="mt-5">
                    <div className="w-full overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 aspect-[4/5]">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt="Generated for this post"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">
                          Image will appear here
                        </div>
                      )}
                    </div>

                    <div className="mt-3">
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600">
                        Style: clean studio light
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Feed preview */}
            <section className={`mt-6 ${radius} ${card} ${border} ${shadow} p-6`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Feed preview
                  </div>
                  <div className="text-xs text-slate-500">
                    Quick look at how your next posts could sit together.
                  </div>
                </div>
                <div className="text-xs text-slate-500">Coming next</div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {feedTiles.map((t, idx) => (
                  <div
                    key={idx}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                  >
                    <div className="aspect-square w-full">
                      {t.src ? (
                        <img
                          src={t.src}
                          alt={t.label}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                          Coming next
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* History (keep it) */}
            <section className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  Recent history
                </h2>
                <button
                  type="button"
                  onClick={loadPosts}
                  className="text-xs text-slate-600 hover:text-slate-800 underline underline-offset-4"
                >
                  Refresh
                </button>
              </div>

              {isLoadingPosts && (
                <p className="text-sm text-slate-500">Loading posts...</p>
              )}

              {!isLoadingPosts && posts.length === 0 && (
                <p className="text-sm text-slate-500">
                  Nothing saved yet. Generate a post to see it here.
                </p>
              )}

              {!isLoadingPosts && posts.length > 0 && (
                <ul className="space-y-3">
                  {posts.map((post) => (
                    <li
                      key={post.id}
                      onClick={() => setSelectedPost(post)}
                      className={`${radius} ${card} ${border} ${shadow} p-4 cursor-pointer hover:bg-white`}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="flex gap-4">
                        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                          {post.image_url ? (
                            <img
                              src={post.image_url}
                              alt="Post thumbnail"
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {post.caption}
                          </p>
                          {post.prompt_used && (
                            <p className="mt-1 text-xs text-slate-500 truncate">
                              Prompt: {post.prompt_used}
                            </p>
                          )}
                          <p className="mt-1 text-[11px] text-slate-400">
                            {new Date(post.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Selected post modal */}
            {selectedPost && (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 p-4">
                <div
                  className={`w-full max-w-2xl ${radius} bg-white ${border} ${shadow} p-6`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-900">
                      Saved post
                    </h3>
                    <button
                      type="button"
                      onClick={() => setSelectedPost(null)}
                      className="text-sm text-slate-500 hover:text-slate-700"
                    >
                      Close
                    </button>
                  </div>

                  {selectedPost.image_url && (
                    <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 aspect-[4/5] max-h-[70vh]">
                      <img
                        src={selectedPost.image_url}
                        alt="Saved post"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                    {selectedPost.caption}
                  </div>

                  {selectedPost.prompt_used && (
                    <p className="mt-3 text-xs text-slate-500">
                      Prompt used: {selectedPost.prompt_used}
                    </p>
                  )}

                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPost(null)}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCaptions([selectedPost.caption]);
                        setImageUrl(selectedPost.image_url);
                        setLastPromptLabel(
                          selectedPost.prompt_used || "Loaded from saved post"
                        );
                        setSelectedPost(null);
                      }}
                      className="rounded-full px-4 py-2 text-xs font-medium text-white hover:opacity-95"
                      style={{ backgroundColor: accent }}
                    >
                      Load into editor
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Brand settings modal */}
            {showSettings && (
              <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4 overflow-y-auto">
                <div
                  className={`w-full max-w-lg ${radius} bg-white ${border} ${shadow} p-6`}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-slate-900">
                      Brand settings
                    </h2>
                    <button
                      type="button"
                      onClick={() => setShowSettings(false)}
                      className="text-sm text-slate-500 hover:text-slate-700"
                    >
                      Close
                    </button>
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    These details guide every caption and image behind the scenes.
                  </p>

                  <div className="mt-5 space-y-3 text-sm">
                    {[
                      { key: "brandName", label: "Brand name", placeholder: "" },
                      { key: "industry", label: "Industry", placeholder: "" },
                      {
                        key: "targetMarket",
                        label: "Target market",
                        placeholder: "Example: Solo founders building SaaS",
                      },
                      {
                        key: "brandColorsAndStyle",
                        label: "Brand colors and style",
                        placeholder: "Example: white, slate, sky accent, Apple clean",
                      },
                      {
                        key: "contentPillars",
                        label: "Content pillars",
                        placeholder: "Example: product, workflows, growth, founder stories",
                      },
                      {
                        key: "defaultImageFocus",
                        label: "Default image focus",
                        placeholder: "How a typical on-brand photo should look",
                      },
                    ].map((f) => (
                      <div key={f.key}>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          {f.label}
                        </label>
                        <input
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                          placeholder={f.placeholder}
                          value={(brandSettings as any)[f.key]}
                          onChange={(e) =>
                            updateBrandField(f.key as any, e.target.value as any)
                          }
                        />
                      </div>
                    ))}

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
                        People in images
                      </label>
                      <select
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                        value={brandSettings.peopleMode}
                        onChange={(e) =>
                          updateBrandField(
                            "peopleMode",
                            e.target.value as
                              | "auto"
                              | "no_people"
                              | "prefer_people"
                          )
                        }
                      >
                        <option value="auto">Auto (decide from my prompt)</option>
                        <option value="no_people">Mostly no people</option>
                        <option value="prefer_people">Mostly people</option>
                      </select>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Auto uses your prompt. Mostly no people forces product or
                        scene shots unless you clearly ask for humans. Mostly
                        people leans toward including a person when it fits.
                      </p>
                    </div>

                    <hr className="border-slate-200 my-2" />

                    {[
                      {
                        key: "personaPrimary",
                        label: "Primary persona",
                        placeholder: "Example: founder, 25-40, modern, confident",
                      },
                      {
                        key: "personaSecondary",
                        label: "Secondary persona (optional)",
                        placeholder: "Example: creator, 20-35, vibrant",
                      },
                      {
                        key: "personaThird",
                        label: "Third persona (optional)",
                        placeholder: "Example: agency operator, 30-50",
                      },
                    ].map((f) => (
                      <div key={f.key}>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                          {f.label}
                        </label>
                        <input
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                          placeholder={f.placeholder}
                          value={(brandSettings as any)[f.key]}
                          onChange={(e) =>
                            updateBrandField(f.key as any, e.target.value as any)
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex items-center justify-between">
                    {brandStatus ? (
                      <span className="text-xs text-slate-500">{brandStatus}</span>
                    ) : (
                      <span />
                    )}

                    <button
                      type="button"
                      onClick={handleSaveBrand}
                      disabled={brandSaving}
                      className={`rounded-full px-5 py-2.5 text-sm font-medium text-white ${
                        brandSaving ? "opacity-60 cursor-not-allowed" : "hover:opacity-95"
                      }`}
                      style={{ backgroundColor: accent }}
                    >
                      {brandSaving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-slate-200/80 bg-white/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-[11px] text-slate-500 sm:flex-row">
          <span>© {new Date().getFullYear()} Flow Social</span>
          <div className="flex items-center gap-3">
            <Link href="/" className="hover:text-slate-700">
              Home
            </Link>
            <Link href="/#pricing" className="hover:text-slate-700">
              Pricing
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
