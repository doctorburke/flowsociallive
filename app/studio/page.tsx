"use client";

export const dynamic = "force-dynamic";


import { useEffect, useState } from "react";
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
  const [caption, setCaption] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Auth state
  const [user, setUser] = useState<any | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Posts history state
  const [posts, setPosts] = useState<StudioPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [selectedPost, setSelectedPost] = useState<StudioPost | null>(null);

  const [checkoutNotice, setCheckoutNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
    // Usage and plan state
  const [usageInfo, setUsageInfo] = useState<PlanUsageInfo | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);


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

  // Ensure the user has a profile row with a default free plan
useEffect(() => {
  const ensureProfile = async () => {
    if (!user) return;

    try {
      const supabase = supabaseBrowser;

      // 1) Check if profile already exists
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Error checking profile:", error);
        return;
      }

      if (data) {
        // Profile already exists, nothing to do
        return;
      }

      // 2) Create a new profile with default free plan
      const { error: insertError } = await supabase.from("profiles").insert([
        {
          id: user.id,
          email: user.email ?? null,
          plan: "free",
          billing_plan: "free",
          stripe_customer_id: null,
          stripe_subscription_id: null,
          subscription_status: "inactive",
        },
      ]);

      if (insertError) {
        console.error("Error creating profile:", insertError);
      } else {
        console.log("Created default profile for user", user.id);
      }
    } catch (err) {
      console.error("ensureProfile exception:", err);
    }
  };

  ensureProfile();
}, [user]);

  // Load current plan and monthly usage for this user
  useEffect(() => {
    const loadUsage = async () => {
      if (!user) {
        setUsageInfo(null);
        return;
      }

      try {
        setUsageLoading(true);
        const supabase = supabaseBrowser;

        // 1) Get the user's plan from profiles
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

        // 2) Get current period usage from usage_stats
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
    };

    loadUsage();
  }, [user]);


  // Load brand for current user
  useEffect(() => {
    const loadBrandForUser = async () => {
      if (!user) {
        setBrandSettings(defaultBrandSettings);
        setBrandId(null);
        return;
      }

      try {
        const { data, error } = await supabaseBrowser
          .from("brands")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Error loading brand:", error);
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
  const loadPosts = async () => {
    if (!user || !brandId) return;

    try {
      setIsLoadingPosts(true);

      const { data, error } = await supabaseBrowser
        .from("posts")
        .select("id, caption, image_url, prompt_used, created_at")
        .eq("user_id", user.id)
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Error loading posts:", error);
        return;
      }

      setPosts(data || []);
    } catch (err) {
      console.error("Unexpected error loading posts:", err);
    } finally {
      setIsLoadingPosts(false);
    }
  };

  // When user and brand are ready, load posts
  useEffect(() => {
    if (user && brandId) {
      loadPosts();
    } else {
      setPosts([]);
    }
  }, [user, brandId]);

  // Stripe checkout URL messages + URL cleanup
  useEffect(() => {
    const status = searchParams.get("checkout");
    if (!status) return;

    // 1. Set the banner
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

    // 2. Clean the URL so banner only shows once
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
        return;
      }

      const { error } = await supabaseBrowser.auth.signInWithOtp({
  email,
  options: {
    emailRedirectTo: `${window.location.origin}/studio`,
  },
});

      if (error) {
        console.error(error);
        setAuthStatus("Could not send login link. Please try again.");
      } else {
        setAuthStatus(
          "Magic link sent. Check your inbox and open the link to log in."
        );
      }
    } catch (err) {
      console.error(err);
      setAuthStatus("Something went wrong. Please try again.");
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
    setCaption(null);
    setImageUrl(null);
    setLastPromptLabel(null);
    setPosts([]);
  }

  function buildPersonaList(settings: BrandSettings): string[] {
    const personas: string[] = [];

    if (settings.personaPrimary.trim()) {
      personas.push(settings.personaPrimary.trim());
    }
    if (settings.personaSecondary.trim()) {
      personas.push(settings.personaSecondary.trim());
    }
    if (settings.personaThird.trim()) {
      personas.push(settings.personaThird.trim());
    }

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
    } else {
      const humanTemplates = [
        "Dynamic action shot capturing movement.",
        "Medium portrait style shot from the waist up.",
        "Candid lifestyle shot with a natural pose, not overly staged.",
        "Close up shot that includes part of the athlete and their gear.",
      ];
      return humanTemplates[index];
    }
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

  async function handleCreatePost() {
    const userPrompt = prompt.trim();

    if (!userPrompt) {
      setError("Please describe what you want to post first.");
      return;
    }

    try {
      setIsGenerating(true);
      setError(null);
      setCaption(null);
      setImageUrl(null);
      setCopied(false);

      const label = userPrompt;
      setLastPromptLabel(label);

      // 1) Caption
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
        caption: string;
        imagePrompt?: string;
      };

      const safeCaption = captionJson.caption || "";
      setCaption(safeCaption);

      // 2) Build image prompt with Option C plus product first mode
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
        brandHintsParts.push(
          `Brand name: ${brandSettings.brandName.trim()}.`
        );
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

      if (peopleMode === "no_people") {
        usePersona = false;
      } else if (peopleMode === "prefer_people") {
        usePersona = !flags.explicitNoHuman;
      } else {
        usePersona = flags.impliesHuman && !flags.explicitNoHuman;
      }

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
- The person must clearly match the age, gender, vibe, and role implied in the scene.
- The person must be engaged in an action that matches the user instruction.
- Make every specific detail from the user request visible in the image, including objects, tools, environment, time of day, mood, and setting.

Persona:
${persona}

${isProductFocus ? "The product or gear in the user prompt must be clearly visible and treated as the hero of the image." : ""}

Shot guidance:
${shotHint}

Brand hints for color grading, tone, and environment only. Do not override the scene:
${brandHints}

Hard rules:
- No readable logos or text.
- No UI elements, screens, overlays, watermarks, or captions.
- No unrealistic lighting or effects unless the user requested them.
        `.trim();
      } else {
        baseImagePrompt = `
Create a realistic vertical 4:5 Instagram photo.

Scene:
${userPrompt}

Important visual rules:
- Do not include any humans, silhouettes, reflections or shadows of people, body parts, or implied humans.
- The scene must focus entirely on the objects, environment, product, and details described by the user.
- Make every specific detail from the user request clearly visible in the final image.
- If the prompt includes a product, setting, tool, or object, it must be accurately represented.

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

      // 4) Save post to Supabase in the background
      try {
        if (user && brandId && safeCaption.trim()) {
          const { error: postError } = await supabaseBrowser
            .from("posts")
            .insert([
              {
                user_id: user.id,
                brand_id: brandId,
                caption: safeCaption,
                image_url: (imageData as any).imageUrl || null,
                prompt_used: userPrompt || null,
              },
            ]);

          if (postError) {
            console.error("Error saving post:", postError);
          } else {
            loadPosts();
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
        const { error } = await supabaseBrowser
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

        if (error) {
          console.error("Error updating brand:", error);
          setBrandStatus("Could not save brand. Please try again.");
          return;
        }
      } else {
        const { data, error } = await supabaseBrowser
          .from("brands")
          .insert([
            {
              user_id: user.id,
              brand_name: brandSettings.brandName || null,
              industry: brandSettings.industry || null,
              target_market: brandSettings.targetMarket || null,
              brand_colors_and_style:
                brandSettings.brandColorsAndStyle || null,
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

        if (error) {
          console.error("Error inserting brand:", error);
          setBrandStatus("Could not save brand. Please try again.");
          return;
        }

        if (data?.id) {
          setBrandId(data.id);
        }
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

  async function handleCopyCaption() {
    if (!caption) return;
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error(e);
    }
  }

  function handleResetPost() {
    setPrompt("");
    setCaption(null);
    setImageUrl(null);
    setLastPromptLabel(null);
    setError(null);
    setCopied(false);
  }

  // If no user logged in
if (!user) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900 rounded-3xl p-6 border border-slate-700 space-y-4">
        <h1 className="text-xl font-semibold text-center">
          Brand Content Studio
        </h1>
        <p className="text-sm text-slate-400 text-center">
          Enter your email to create your account or log back in. We will send
          you a secure magic link.
        </p>

        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              EMAIL
            </label>
            <input
              type="email"
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
              placeholder="you@example.com"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={authLoading}
            className={`w-full rounded-full px-4 py-2 text-sm font-medium ${
              authLoading
                ? "bg-sky-700/40 text-slate-300 cursor-not-allowed"
                : "bg-sky-500 hover:bg-sky-400 text-slate-950"
            }`}
          >
            {authLoading ? "Sending magic link..." : "Send magic link"}
          </button>
        </form>

        {authStatus && (
          <p className="text-xs text-slate-300 text-center">{authStatus}</p>
        )}

        <p className="text-[11px] text-slate-500 text-center">
          New here or already subscribed, it is the same flow. We will email you a login link.
        </p>
      </div>
    </div>
  );
}


  // Logged in view
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex justify-center px-4 py-10">
      <div className="w-full max-w-3xl space-y-6">
                {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Brand Content Studio</h1>
            <p className="text-sm text-slate-400">
              Instagram ready captions and images that match your brand.
            </p>
          </div>

          <div className="flex flex-col items-end gap-1 sm:items-end">
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Link
                href="/#pricing"
                className="inline-flex items-center justify-center rounded-full border border-emerald-500 bg-slate-900 px-3 py-2 text-[11px] sm:text-xs hover:bg-slate-800"
              >
                Pricing and plans
              </Link>

              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="inline-flex items-center justify-center rounded-full border border-slate-600 bg-slate-800 px-3 py-2 text-[11px] sm:text-xs hover:bg-slate-700"
              >
                <span className="mr-1">Brand Settings</span>
                <span>⚙️</span>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center justify-center rounded-full border border-slate-600 bg-slate-900 px-3 py-2 text-[11px] sm:text-xs hover:bg-slate-800"
              >
                Log out
              </button>
            </div>

            {/* Plan and usage line */}
            <div className="mt-1">
              {usageLoading && !usageInfo && (
                <p className="text-[11px] text-slate-500">
                  Loading your plan and usage...
                </p>
              )}
              {!usageLoading && usageInfo && (
                <p className="text-[11px] text-slate-400 text-right">
                  {usageInfo.maxPostsPerMonth === null ? (
                    <>
                      Plan:{" "}
                      {usageInfo.plan === "pro"
                        ? "Pro"
                        : usageInfo.plan === "studio_max"
                        ? "Studio Max"
                        : "Free"}
                      {" - "}
                      {usageInfo.postsUsedThisMonth} posts created this month
                    </>
                  ) : (
                    <>
                      Plan:{" "}
                      {usageInfo.plan === "pro"
                        ? "Pro"
                        : usageInfo.plan === "studio_max"
                        ? "Studio Max"
                        : "Free"}
                      {" - "}
                      {usageInfo.postsUsedThisMonth} of{" "}
                      {usageInfo.maxPostsPerMonth} posts used this month
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>


        {/* Stripe checkout banner */}
        {checkoutNotice && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm flex items-start gap-2 ${
              checkoutNotice.type === "success"
                ? "border-emerald-500/70 bg-emerald-900/40 text-emerald-50"
                : "border-amber-500/70 bg-amber-900/40 text-amber-50"
            }`}
          >
            <span className="mt-0.5 text-lg">
              {checkoutNotice.type === "success" ? "✅" : "⚠️"}
            </span>
            <div className="flex-1">
              <p>{checkoutNotice.text}</p>
              {checkoutNotice.type === "success" && (
                <p className="mt-1 text-[11px] text-emerald-100/90">
                  Your plan limits will update automatically as billing
                  completes in the background.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCheckoutNotice(null)}
              className="text-[11px] text-slate-100/80 hover:text-slate-50"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Prompt area */}
        <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
          <label className="block text-xs font-semibold text-slate-400">
            DESCRIBE WHAT YOU WANT TO POST
          </label>
          <textarea
            className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            rows={3}
            placeholder="Describe the scene, clothing, setting, and vibe you want in the post..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <p className="text-[11px] text-slate-500">
            Tip: For pure product or landscape shots, add "no people in the
            image" or set this brand to "Mostly no people" in Brand Settings.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleCreatePost}
              disabled={isGenerating || !prompt.trim()}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                isGenerating || !prompt.trim()
                  ? "bg-sky-700/40 text-slate-300 cursor-not-allowed"
                  : "bg-sky-500 hover:bg-sky-400 text-slate-950"
              }`}
            >
              {isGenerating ? "Creating..." : "Create Post"}
            </button>

            {isGenerating && (
              <span className="text-xs text-slate-400">
                Generating caption and image on brand. This can take up to 60
                seconds. Please do not refresh the page.
              </span>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-900/40 border border-red-500 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Output */}
        {(caption || imageUrl) && (
          <div className="bg-slate-900 rounded-3xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {lastPromptLabel && (
                <div className="inline-flex max-w-full rounded-full bg-emerald-500 text-slate-950 text-sm px-4 py-2">
                  {lastPromptLabel}
                </div>
              )}

              <div className="flex flex-wrap gap-2 ml-auto">
                {caption && (
                  <button
                    type="button"
                    onClick={handleCopyCaption}
                    className="rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 px-4 py-2 text-xs"
                  >
                    {copied ? "Copied" : "Copy caption"}
                  </button>
                )}
                {imageUrl && (
                  <a
                    href={imageUrl}
                    download="brand-post.png"
                    className="rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 px-4 py-2 text-xs"
                  >
                    Download image
                  </a>
                )}
              </div>
            </div>

            {caption && (
              <div className="bg-slate-800 rounded-3xl px-4 py-3 text-sm leading-relaxed">
                {caption}
              </div>
            )}

            {imageUrl && (
              <div className="mt-3 flex justify-center">
                <div className="w-full max-w-md aspect-[4/5] overflow-hidden rounded-3xl">
                  <img
                    src={imageUrl}
                    alt="Generated for this post"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* My Posts list */}
        <section className="mt-4 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">My recent posts</h2>
            <button
              type="button"
              onClick={loadPosts}
              className="text-xs underline underline-offset-4"
            >
              Refresh
            </button>
          </div>

          {isLoadingPosts && (
            <p className="text-sm text-slate-400">Loading posts...</p>
          )}

          {!isLoadingPosts && posts.length === 0 && (
            <p className="text-sm text-slate-400">
              No posts saved yet. Generate a post to see it here.
            </p>
          )}

          {!isLoadingPosts && posts.length > 0 && (
            <ul className="space-y-3">
              {posts.map((post) => (
                <li
                  key={post.id}
                  onClick={() => setSelectedPost(post)}
                  className="flex gap-3 rounded-lg border border-slate-800 p-3 text-sm cursor-pointer hover:bg-slate-900"
                  role="button"
                  tabIndex={0}
                >
                  {post.image_url && (
                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-slate-900">
                      <img
                        src={post.image_url}
                        alt="Generated"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{post.caption}</p>
                    {post.prompt_used && (
                      <p className="mt-1 text-xs text-slate-400">
                        Prompt: {post.prompt_used}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-slate-500">
                      {new Date(post.created_at).toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Selected post modal */}
        {selectedPost && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
            <div className="w-full max-w-lg bg-slate-900 rounded-3xl p-6 space-y-4 border border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Saved post</h3>
                <button
                  type="button"
                  onClick={() => setSelectedPost(null)}
                  className="text-sm text-slate-400 hover:text-slate-100"
                >
                  Close
                </button>
              </div>

              {selectedPost.image_url && (
                <div className="flex justify-center">
                  <div className="w-full max-w-md aspect-[4/5] overflow-hidden rounded-3xl bg-slate-800">
                    <img
                      src={selectedPost.image_url}
                      alt="Saved post"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}

              <div className="bg-slate-800 rounded-2xl px-4 py-3 text-sm leading-relaxed">
                {selectedPost.caption}
              </div>

              {selectedPost.prompt_used && (
                <p className="text-xs text-slate-400">
                  Prompt used: {selectedPost.prompt_used}
                </p>
              )}

              <p className="text-xs text-slate-500">
                Created {new Date(selectedPost.created_at).toLocaleString()}
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedPost(null)}
                  className="rounded-full border border-slate-600 bg-slate-900 px-4 py-2 text-xs hover:bg-slate-800"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCaption(selectedPost.caption);
                    setImageUrl(selectedPost.image_url);
                    setLastPromptLabel(
                      selectedPost.prompt_used || "Loaded from saved post"
                    );
                    setSelectedPost(null);
                  }}
                  className="rounded-full bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs px-4 py-2"
                >
                  Load into editor
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Brand settings modal */}
        {showSettings && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto">
            <div className="w-full max-w-lg max-h-[90vh] bg-slate-900 rounded-3xl p-6 space-y-4 border border-slate-700 overflow-y-auto">
              {/* Sticky Header */}
              <div className="flex items-center justify-between sticky top-0 pb-3 mb-2 bg-slate-900">
                <h2 className="text-lg font-semibold">Brand settings</h2>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="text-sm text-slate-400 hover:text-slate-100"
                >
                  Close
                </button>
              </div>

              <p className="text-xs text-slate-400">
                These details are used behind the scenes so every caption and
                image matches your brand.
              </p>

              {/* FORM FIELDS */}
              <div className="space-y-3 text-sm">
                {/* BRAND NAME */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    BRAND NAME
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
                    value={brandSettings.brandName}
                    onChange={(e) =>
                      updateBrandField("brandName", e.target.value)
                    }
                  />
                </div>

                {/* INDUSTRY */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    INDUSTRY
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
                    value={brandSettings.industry}
                    onChange={(e) =>
                      updateBrandField("industry", e.target.value)
                    }
                  />
                </div>

                {/* TARGET MARKET */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    TARGET MARKET
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
                    placeholder="Example: Young male athletes"
                    value={brandSettings.targetMarket}
                    onChange={(e) =>
                      updateBrandField("targetMarket", e.target.value)
                    }
                  />
                </div>

                {/* BRAND COLORS AND STYLE */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    BRAND COLORS AND STYLE
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
                    placeholder="Example: Blue, white, black and grey"
                    value={brandSettings.brandColorsAndStyle}
                    onChange={(e) =>
                      updateBrandField("brandColorsAndStyle", e.target.value)
                    }
                  />
                </div>

                {/* CONTENT PILLARS */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    CONTENT PILLARS
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
                    placeholder="Example: sustainability, performance, animal welfare"
                    value={brandSettings.contentPillars}
                    onChange={(e) =>
                      updateBrandField("contentPillars", e.target.value)
                    }
                  />
                </div>

                {/* DEFAULT IMAGE FOCUS */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    DEFAULT IMAGE FOCUS
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
                    placeholder="How a typical on-brand photo should look"
                    value={brandSettings.defaultImageFocus}
                    onChange={(e) =>
                      updateBrandField("defaultImageFocus", e.target.value)
                    }
                  />
                </div>

                {/* PEOPLE IN IMAGES */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    PEOPLE IN IMAGES
                  </label>
                  <select
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
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
                    Auto uses your text to decide. "Mostly no people" forces
                    product or scene only shots unless you clearly ask for
                    humans. "Mostly people" leans toward including a person
                    whenever it fits.
                  </p>
                </div>

                <hr className="border-slate-700 my-2" />

                {/* PRIMARY PERSONA */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    PRIMARY PERSONA
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
                    placeholder="Example: youth black or white male athlete"
                    value={brandSettings.personaPrimary}
                    onChange={(e) =>
                      updateBrandField("personaPrimary", e.target.value)
                    }
                  />
                </div>

                {/* SECONDARY PERSONA */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    SECONDARY PERSONA (OPTIONAL)
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
                    placeholder="Example: youth black or white female athlete"
                    value={brandSettings.personaSecondary}
                    onChange={(e) =>
                      updateBrandField("personaSecondary", e.target.value)
                    }
                  />
                </div>

                {/* THIRD PERSONA */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    THIRD PERSONA (OPTIONAL)
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
                    placeholder="Example: hockey coach, any gender or race"
                    value={brandSettings.personaThird}
                    onChange={(e) =>
                      updateBrandField("personaThird", e.target.value)
                    }
                  />
                </div>
              </div>

              {/* Save Button Row */}
              <div className="pt-2 flex items-center justify-between">
                {brandStatus && (
                  <span className="text-xs text-slate-300">
                    {brandStatus}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSaveBrand}
                  disabled={brandSaving}
                  className={`ml-auto rounded-full bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm px-4 py-2 ${
                    brandSaving ? "opacity-70 cursor-not-allowed" : ""
                  }`}
                >
                  {brandSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
