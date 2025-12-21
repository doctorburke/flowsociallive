"use client";

import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseClient";

export default function LandingPage() {
  const [checkoutLoading, setCheckoutLoading] = useState<"pro" | "studio_max" | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function handleCheckout(plan: "pro" | "studio_max") {
    try {
      setCheckoutError(null);
      setCheckoutLoading(plan);

      const {
        data: { user },
        error: userError,
      } = await supabaseBrowser.auth.getUser();

      if (userError || !user) {
        setCheckoutError(
          "Please log in inside the Studio first so we can attach this subscription to your account."
        );
        setCheckoutLoading(null);
        return;
      }

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          userId: user.id,
          email: user.email,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));

        if (res.status === 401) {
          setCheckoutError(
            "Please log in inside the Studio first so we can attach this subscription to your account."
          );
        } else {
          setCheckoutError((data as any).error || "Could not start checkout. Please try again.");
        }
        return;
      }

      const data = (await res.json()) as { url?: string };

      if (data.url) {
        window.location.href = data.url;
      } else {
        setCheckoutError("Stripe did not return a checkout link. Please try again.");
      }
    } catch (err) {
      console.error(err);
      setCheckoutError("Unexpected error starting checkout. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  const pageBg = "#F6F8FF"; // premium cool-white
  const accent = "#0EA5E9"; // brand blue

  return (
    <div className="min-h-screen text-slate-900" style={{ backgroundColor: pageBg }}>
      {/* Soft background bloom (not a gradient wall) */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 520px at 50% 120px, rgba(14,165,233,0.18), rgba(245,248,255,0) 60%)",
        }}
      />

      {/* Header */}
      <header className="border-b border-slate-200/70 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl text-sm font-semibold text-white shadow-sm"
              style={{ backgroundColor: accent }}
            >
              FS
            </div>
            <span className="text-sm font-semibold tracking-wide text-slate-900">Flow Social</span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <Link
              href="/studio"
              className="hidden sm:inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Open Studio
            </Link>

            <Link
              href="/studio"
              className="inline-flex items-center rounded-full px-3.5 py-1.5 font-medium text-white shadow-sm hover:opacity-95"
              style={{ backgroundColor: accent }}
            >
              Start Free
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-10">
        {/* Hero */}
        <section className="relative">
          <div className="rounded-[32px] border border-slate-200/80 bg-white/80 p-6 shadow-[0_18px_45px_-28px_rgba(2,6,23,0.35)] backdrop-blur sm:p-10">
            <div className="grid items-center gap-8 lg:grid-cols-2">
              {/* Left */}
              <div className="text-center lg:text-left">
                {/* Accent badge */}
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 shadow-sm">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: accent }}
                    aria-hidden="true"
                  />
                  <span>AI powered brand studio for Instagram</span>
                </div>

                <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
                  Create on brand content in seconds
                </h1>

                <p className="mt-4 max-w-xl text-sm text-slate-600 sm:text-base lg:mx-0 lg:max-w-none">
                  Flow Social turns your brand settings into a content engine so captions and images
                  feel consistent, premium, and ready to post.
                </p>

                {/* Benefit bullets */}
                <ul className="mx-auto mt-5 max-w-xl space-y-2 text-left text-[13px] text-slate-700 lg:mx-0">
                  <li className="flex items-start gap-2">
                    <span
                      className="mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: accent }}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <span>Save your brand once, generate endlessly with consistent tone and style.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span
                      className="mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: accent }}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <span>Captions that match your voice, images that match your feed.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span
                      className="mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: accent }}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <span>Built for founders who want speed without sacrificing brand quality.</span>
                  </li>
                </ul>

                {/* CTAs */}
                <div className="mt-7 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                  <Link
                    href="/studio"
                    className="inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                    style={{ backgroundColor: accent }}
                  >
                    Start creating content
                  </Link>

                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-medium text-slate-600 shadow-sm">
                    Free tier available · No credit card
                  </span>
                </div>

                {/* Trust hint */}
                <p className="mt-3 text-[11px] text-slate-500">
                  Private beta. Fast setup. Cancel anytime.
                </p>
              </div>

              {/* Right: fake UI preview */}
              <div className="relative">
                {/* Accent bar */}
                <div
                  className="absolute -top-3 left-6 h-1 w-24 rounded-full"
                  style={{ backgroundColor: accent }}
                  aria-hidden="true"
                />

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-xl bg-slate-100" />
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Brand Studio</div>
                        <div className="text-[11px] text-slate-500">Flow Social preview</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-slate-200" />
                      <span className="h-2 w-2 rounded-full bg-slate-200" />
                      <span className="h-2 w-2 rounded-full bg-slate-200" />
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold text-slate-800">Prompt</div>
                    <div className="mt-2 h-9 rounded-xl bg-white shadow-sm ring-1 ring-slate-200" />
                    <div className="mt-3 flex gap-2">
                      <span
                        className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium text-white"
                        style={{ backgroundColor: accent }}
                      >
                        Generate
                      </span>
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700">
                        Save to drafts
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-xs font-semibold text-slate-800">Caption</div>
                      <div className="mt-2 space-y-2">
                        <div className="h-2 w-11/12 rounded bg-slate-100" />
                        <div className="h-2 w-10/12 rounded bg-slate-100" />
                        <div className="h-2 w-8/12 rounded bg-slate-100" />
                      </div>
                      <div className="mt-3 inline-flex items-center rounded-full bg-slate-50 px-3 py-1 text-[11px] text-slate-600">
                        Tone: confident, concise
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-xs font-semibold text-slate-800">Image</div>
                      <div className="mt-2 aspect-[4/3] w-full rounded-xl bg-slate-100 ring-1 ring-slate-200" />
                      <div className="mt-3 inline-flex items-center rounded-full bg-slate-50 px-3 py-1 text-[11px] text-slate-600">
                        Style: clean studio light
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-slate-800">Feed preview</div>
                      <div className="text-[11px] text-slate-500">Coming next</div>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      <div className="aspect-square rounded-lg bg-slate-100" />
                      <div className="aspect-square rounded-lg bg-slate-100" />
                      <div className="aspect-square rounded-lg bg-slate-100" />
                      <div className="aspect-square rounded-lg bg-slate-100" />
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-center text-[11px] text-slate-500 lg:text-left">
                  Preview UI for marketing. Your Studio experience is faster and more complete.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Why Flow Social */}
        <section className="mt-16 space-y-6 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Why Flow Social</h2>
          <p className="mx-auto max-w-2xl text-sm text-slate-600">
            Flow Social is built for solo founders and lean teams that want pro level Instagram content.
          </p>

          <div className="grid gap-5 text-sm md:grid-cols-3">
            {[
              {
                title: "Brand first, not prompt first",
                body:
                  "Capture your brand once in settings. Every caption and image uses those details so you stay on brand with every post.",
              },
              {
                title: "Captions and images that match",
                body:
                  "The engine reads your prompt, knows when to focus on people or product, and varies the shot for engaging posts.",
              },
              {
                title: "Built for real founders",
                body:
                  "Flow Social is designed for founders and lean teams. It gives you a studio that feels like an assistant who already knows your brand.",
              },
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 text-left shadow-sm transition-transform hover:-translate-y-0.5"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-slate-50 text-sm font-semibold"
                    style={{ color: accent }}
                    aria-hidden="true"
                  >
                    ✦
                  </span>
                  <p className="text-xs font-semibold text-slate-700">{c.title}</p>
                </div>
                <p className="text-slate-600">{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Testimonials */}
        <section className="mt-14 space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              Founders want speed, without losing brand quality
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
              Early users are using Flow Social to publish more consistently while keeping their voice tight.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                quote:
                  "I set up my brand once and now every post sounds like me. It feels like having a content assistant that actually understands our voice.",
                name: "Founder",
                role: "DTC wellness brand",
              },
              {
                quote:
                  "The captions are the first ones I did not need to rewrite. I can move from idea to publishable copy in minutes.",
                name: "Founder",
                role: "Solo creator",
              },
              {
                quote:
                  "This is the cleanest workflow I have tried. The content stays consistent and the output looks premium across the feed.",
                name: "Founder",
                role: "Agency operator",
              },
            ].map((t, i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm"
              >
                <div className="text-sm font-medium text-slate-800">“{t.quote}”</div>
                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-800">{t.name}</div>
                    <div className="text-[11px] text-slate-500">{t.role}</div>
                  </div>
                  <div className="flex items-center gap-1" aria-hidden="true">
                    <span style={{ color: accent }}>★</span>
                    <span style={{ color: accent }}>★</span>
                    <span style={{ color: accent }}>★</span>
                    <span style={{ color: accent }}>★</span>
                    <span style={{ color: accent }}>★</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section className="mt-16 space-y-6 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Pricing</h2>
          <p className="mx-auto max-w-2xl text-sm text-slate-600">
            Start on the free tier while you learn how Flow Social fits into your content plans. Upgrade when ready.
          </p>

          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {/* Free */}
            <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white/90 p-6 text-left shadow-sm">
              <p className="mb-2 text-xs font-semibold text-slate-500">Free</p>
              <p className="mb-1 text-3xl font-semibold text-slate-900">
                $0 <span className="text-xs font-medium text-slate-600">per month</span>
              </p>
              <ul className="mb-5 mt-3 space-y-1.5 text-[12px] text-slate-600">
                <li>One brand profile</li>
                <li>Limited monthly caption and image generations</li>
                <li>Access to core Brand Studio flow</li>
              </ul>
              <Link
                href="/studio"
                className="mt-auto inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95"
                style={{ backgroundColor: accent }}
              >
                Start Free
              </Link>
              <p className="mt-3 text-[11px] text-slate-500">Best for trying the workflow.</p>
            </div>

            {/* Pro (Recommended) */}
            <div className="relative flex flex-col rounded-2xl border border-sky-200 bg-white p-6 text-left shadow-[0_18px_45px_-28px_rgba(2,6,23,0.35)] ring-1 ring-sky-100">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold text-white shadow-sm"
                  style={{ backgroundColor: accent }}
                >
                  Recommended
                </span>
              </div>

              <p className="mb-2 text-xs font-semibold text-slate-700">Pro</p>
              <p className="mb-1 text-3xl font-semibold text-slate-900">
                $99 <span className="text-xs font-medium text-slate-600">per month</span>
              </p>

              <ul className="mb-5 mt-3 space-y-1.5 text-[12px] text-slate-600">
                <li>Up to 3 brands</li>
                <li>Higher monthly caption and image generations</li>
                <li>Priority access to new studio features</li>
                <li>Early access to feed preview and batch generation</li>
              </ul>

              <button
                type="button"
                onClick={() => handleCheckout("pro")}
                disabled={checkoutLoading !== null}
                className={`mt-auto inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold shadow-sm ${
                  checkoutLoading
                    ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                    : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                }`}
              >
                {checkoutLoading === "pro" ? "Redirecting..." : "Upgrade to Pro"}
              </button>

              <p className="mt-3 text-[11px] text-slate-500">
                Best for founders posting weekly.
              </p>
            </div>

            {/* Studio Max */}
            <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white/90 p-6 text-left shadow-sm">
              <p className="mb-2 text-xs font-semibold text-slate-500">Studio Max</p>
              <p className="mb-1 text-3xl font-semibold text-slate-900">
                $299 <span className="text-xs font-medium text-slate-600">per month</span>
              </p>
              <ul className="mb-5 mt-3 space-y-1.5 text-[12px] text-slate-600">
                <li>For agencies and creators with many brands</li>
                <li>Higher or custom monthly limits</li>
                <li>Advanced tools as they ship</li>
                <li>Best once Flow Social is your studio of record</li>
              </ul>

              <button
                type="button"
                onClick={() => handleCheckout("studio_max")}
                disabled={checkoutLoading !== null}
                className={`mt-auto inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold shadow-sm ${
                  checkoutLoading
                    ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                    : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                }`}
              >
                {checkoutLoading === "studio_max" ? "Redirecting..." : "Upgrade to Studio Max"}
              </button>

              <p className="mt-3 text-[11px] text-slate-500">Best for multi-brand teams.</p>
            </div>
          </div>

          <p className="mt-5 text-[11px] text-slate-500">
            All paid plans come with a 30 day money back guarantee. If Flow Social does not help you
            publish more consistently in your first month, email us for a refund.
          </p>

          {checkoutError && <p className="mt-3 text-xs text-red-500 text-center">{checkoutError}</p>}
        </section>

        {/* FAQ + final CTA */}
        <section className="mt-16 space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              Questions, before you try it?
            </h2>
            <p className="mx-auto max-w-2xl text-sm text-slate-600">
              Flow Social is still early, but the core studio is live and already being used to create real content.
              Here is what most founders ask before they start.
            </p>
          </div>

          <div className="grid gap-5 text-sm md:grid-cols-2">
            {[
              {
                q: "Do I need design or AI skills to use this?",
                a: "No. You describe what you want to post in plain language. The studio uses your brand settings behind the scenes so captions and images stay on brand.",
              },
              {
                q: "What happens when I outgrow the free tier?",
                a: "The free tier is meant to get Flow Social into your weekly workflow. When you need more features or more content, you can move to Pro or Studio Max once payments are live.",
              },
              {
                q: "Does Flow Social replace my social scheduler?",
                a: "Not yet. Right now, Flow Social is a focused studio for creating on brand content. You can still post or schedule from tools you already use.",
              },
              {
                q: "Can I use this for more than Instagram?",
                a: "Yes. Captions and images are optimized for Instagram, but they work well for TikTok, LinkedIn and other channels with light tweaks.",
              },
            ].map((f) => (
              <div
                key={f.q}
                className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 text-left shadow-sm"
              >
                <p className="mb-2 text-xs font-semibold text-slate-800">{f.q}</p>
                <p className="text-slate-600">{f.a}</p>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white/90 px-6 py-6 text-center shadow-sm">
            <p className="text-base font-semibold text-slate-900">Ready to see how your brand looks in the studio?</p>
            <p className="mt-1 text-sm text-slate-600">Set up your brand and create content in minutes.</p>

            <div className="mx-auto mt-5 max-w-2xl">
              <div className="grid gap-3 text-left text-[12px] text-slate-700 sm:grid-cols-3">
                <div className="flex items-start gap-2">
                  <span
                    className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: accent }}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <span>Set your brand settings</span>
                </div>
                <div className="flex items-start gap-2">
                  <span
                    className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: accent }}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <span>Generate your first post</span>
                </div>
                <div className="flex items-start gap-2">
                  <span
                    className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: accent }}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <span>Save to drafts and repeat</span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/studio"
                className="inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                style={{ backgroundColor: accent }}
              >
                Open the Brand Studio
              </Link>
              <span className="text-[11px] text-slate-500">Free tier · No credit card · Private beta</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/70 bg-white/60 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-4 text-[11px] text-slate-500 sm:flex-row">
          <span>© {new Date().getFullYear()} Flow Social. Built for Founders.</span>
          <div className="flex items-center gap-3">
            <Link href="/studio" className="text-slate-600 hover:text-slate-900">
              Open Studio
            </Link>
            <span>Private Beta</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
