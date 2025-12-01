"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "../lib/supabaseClient";

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
};

type StudioPost = {
  id: string;
  caption: string;
  image_url: string | null;
  prompt_used: string | null;
  created_at: string;
};

export default function Page() {
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
          emailRedirectTo: window.location.origin,
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
type PromptHumanAnalysis = {
  impliesHuman: boolean;
  explicitNoHuman: boolean;
};

/**
 * Option C rules:
 * - impliesHuman true     => we allow personas
 * - explicitNoHuman true  => we force no people
 */
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

/**
 * Simple shot type rotation so the feed has visual variety.
 */
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
      }),
    });

    if (!captionRes.ok) {
      const data = await captionRes.json().catch(() => ({}));
      throw new Error(data.error || "Failed to generate caption.");
    }

    const captionJson = (await captionRes.json()) as {
      caption: string;
    };

    const safeCaption = captionJson.caption || "";
    setCaption(safeCaption);

    // 2) Build image prompt with Option C + product first mode
    const flags = analyzePromptForHumans(userPrompt);
    const isProductFocus = analyzeProductFocus(userPrompt);
    const shotHint = buildShotHint(userPrompt, flags, isProductFocus, posts.length);

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

    // Option C: personas only when the prompt implies humans, and not when user signals empty
    const usePersona = flags.impliesHuman && !flags.explicitNoHuman;

    let baseImagePrompt: string;

    if (usePersona) {
      const personas = buildPersonaList(brandSettings);
      const personaIndex = posts.length % personas.length;
      const persona = personas[personaIndex];

      baseImagePrompt = `
Create a realistic vertical 4:5 Instagram photo.

Persona:
${persona}

Scene:
${userPrompt}

Important:
The image must clearly match the described scene. If the user mentioned specific clothing, gear, location, or pose, follow it closely.

${isProductFocus ? "Make sure the product described in the scene is clearly visible and treated as the hero of the image." : ""}

${shotHint}

Brand hints for mood and color grading only. Do not override the scene:
${brandHints}
      `.trim();
    } else {
      baseImagePrompt = `
Create a realistic vertical 4:5 Instagram photo.

Scene:
${userPrompt}

Important:
The image must clearly match the described scene.

${
  isProductFocus
    ? "The hero of the image is the product or gear described. Do not show any people or body parts unless the user explicitly requested them."
    : "Do not include any visible people if the user did not clearly ask for them. Focus on the environment, objects, and mood."
}

${shotHint}

Brand hints for mood and color grading only. Do not override the scene:
${brandHints}
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
      const data = await imageRes.json().catch(() => ({}));
      throw new Error(data.error || "Failed to generate image.");
    }

    const imageData = await imageRes.json();

    let finalUrl: string | null = imageData.imageUrl || null;

    if (!finalUrl && imageData.imageBase64) {
      const b64 = imageData.imageBase64 as string;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "image/png" });
      finalUrl = URL.createObjectURL(blob);
    }

    if (!finalUrl) {
      throw new Error("Image service did not return usable image data.");
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
              image_url: imageData.imageUrl || null,
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

  // If no user logged in - simple auth screen
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-slate-900 rounded-3xl p-6 border border-slate-700 space-y-4">
          <h1 className="text-xl font-semibold text-center">
            Brand Content Studio
          </h1>
          <p className="text-sm text-slate-400 text-center">
            Log in with your email to start saving brand settings and posts.
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
              {authLoading ? "Sending link..." : "Send login link"}
            </button>
          </form>

          {authStatus && (
            <p className="text-xs text-slate-300 text-center">{authStatus}</p>
          )}

          <p className="text-[11px] text-slate-500 text-center">
            You will receive a magic link from Supabase. Open it and you will be
            redirected back here already logged in.
          </p>
        </div>
      </div>
    );
  }

  // Logged in view - Brand Studio
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex justify-center px-4 py-10">
      <div className="w-full max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Brand Content Studio</h1>
            <p className="text-sm text-slate-400">
              Generate Instagram ready captions and images that match your
              brand.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs rounded-full bg-emerald-900/50 border border-emerald-500 px-3 py-1">
              v0.2 prototype
            </span>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="inline-flex items-center justify-center rounded-full border border-slate-600 bg-slate-800 px-3 py-2 text-xs hover:bg-slate-700"
            >
              <span className="mr-1">Brand Settings</span>
              <span>⚙️</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="hidden sm:inline-flex items-center justify-center rounded-full border border-slate-600 bg-slate-900 px-3 py-2 text-xs hover:bg-slate-800"
            >
              Log out
            </button>
          </div>
        </div>

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
                Created{" "}
                {new Date(selectedPost.created_at).toLocaleString()}
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

        {/* DIVIDER */}
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
          <span className="text-xs text-slate-300">{brandStatus}</span>
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
