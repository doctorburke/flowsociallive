"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function LandingPage() {
  const [checkoutLoading, setCheckoutLoading] = useState<"pro" | "studio_max" | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function handleCheckout(plan: "pro" | "studio_max") {
    try {
      setCheckoutError(null);
      setCheckoutLoading(plan);

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));

        if (res.status === 401) {
          setCheckoutError(
            "Please log in inside the Studio first so we can attach this subscription to your account."
          );
        } else {
          setCheckoutError(
            (data as any).error || "Could not start checkout. Please try again."
          );
        }
        return;
      }

      const data = (await res.json()) as { url?: string };

      if (data.url) {
        window.location.href = data.url;
      } else {
        setCheckoutError(
          "Stripe did not return a checkout link. Please try again."
        );
      }
    } catch (err) {
      console.error(err);
      setCheckoutError("Unexpected error starting checkout. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      {/* Background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950" />

      {/* Header */}
      <header className="border-b border-slate-800/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-emerald-400 text-sm font-semibold">
              FS
            </div>
            <span className="text-sm font-semibold tracking-wide">
              Flow Social
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <Link
              href="/studio"
              className="hidden sm:inline-flex items-center rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 hover:bg-slate-800"
            >
              Open Studio
            </Link>
            <Link
              href="/studio"
              className="inline-flex items-center rounded-full bg-sky-500 px-3.5 py-1.5 font-medium text-slate-950 hover:bg-sky-400"
            >
              Start Free
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20 pt-10">
        {/* Hero + app preview */}
        <section className="flex flex-col items-center gap-8 text-center">
          <div className="max-w-2xl space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>AI powered brand studio for Instagram</span>
            </div>

            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
              On brand Instagram posts
              <span className="text-sky-400"> without the content grind.</span>
            </h1>

            <p className="text-sm text-slate-300 sm:text-base">
              Flow Social turns your brand settings into a content engine. Capture
              your brand once, then generate Instagram ready captions and images
              that actually look and feel like you every post.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/studio"
                className="inline-flex items-center justify-center rounded-full bg-sky-500 px-5 py-2.5 text-sm font-medium text-slate-950 hover:bg-sky-400"
              >
                Start free in the browser
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-1 text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>Brand aware captions and images</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                <span>Works for any niche or product</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
                <span>Built by a founder for founders</span>
              </div>
            </div>
          </div>

          {/* Static app preview card */}
          <div className="relative mt-4 w-full max-w-3xl">
            <div className="absolute -inset-6 rounded-[32px] bg-sky-500/10 blur-3xl" />
            <div className="relative rounded-[28px] border border-slate-800 bg-slate-900/80 p-5 shadow-xl shadow-sky-500/20">
              {/* Header row */}
              <div className="mb-4 flex items-center justify-between">
                <div className="text-left">
                  <p className="text-xs font-medium text-slate-200">
                    Brand Content Studio
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Sharp Jock · Your Next Brand
                  </p>
                </div>
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-300">
                  v0.2 · Prototype
                </span>
              </div>

              {/* Prompt */}
              <div className="mb-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-left">
                <p className="mb-1 text-[10px] font-semibold text-slate-400">
                  DESCRIBE WHAT YOU WANT TO POST
                </p>
                <p className="text-xs text-slate-200">
                  Empty locker room with a Sharp Jock beanie on the bench.
                </p>
              </div>

              {/* Buttons row */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-full bg-sky-500 px-4 py-1.5 text-xs font-medium text-slate-950"
                >
                  Generate caption and image
                </button>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] text-slate-200">
                  Brand settings saved
                </span>
              </div>

              {/* Caption + screenshot */}
              <div className="grid items-stretch gap-4 md:grid-cols-[1.4fr,1fr]">
                {/* Caption */}
                <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 px-3 py-3 text-left">
                  <div className="mb-2 inline-flex max-w-full rounded-full bg-emerald-500 px-3 py-1 text-[11px] text-slate-950">
                    Sharp Jock · Sustainability · Performance
                  </div>
                  <p className="text-xs leading-relaxed text-slate-100">
                    Quiet moments like this power the next win. When you gear up
                    with Sharp Jock, you are not just chasing performance, you
                    are standing up for the planet and the animals you share it
                    with. Train hard, tread light, and own your journey.
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-full border border-slate-600 bg-slate-800 px-3.5 py-1.5 text-[11px] text-slate-100 hover:bg-slate-700"
                    >
                      Copy caption
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-slate-600 bg-slate-800 px-3.5 py-1.5 text-[11px] text-slate-100 hover:bg-slate-700"
                    >
                      Download image
                    </button>
                  </div>
                </div>

                {/* Screenshot preview */}
                <div className="flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/70 p-3">
                  <div className="w-full max-w-[360px] overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/80">
                    <Image
                      src="/beanie.png"
                      alt="FlowSocial Brand Studio ready for a new post"
                      width={720}
                      height={480}
                      className="h-auto w-full object-cover"
                      priority
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why FlowSocial */}
        <section className="mt-16 space-y-6 text-center">
          <h2 className="text-lg font-semibold">Why Flow Social</h2>
          <p className="mx-auto max-w-2xl text-sm text-slate-300">
            Flow Social is built for solo founders and lean teams that want pro
            level Instagram content.
          </p>
          <div className="grid gap-5 text-sm md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-left">
              <p className="mb-1 text-xs font-semibold text-slate-400">
                Brand first, not prompt first
              </p>
              <p className="text-slate-200">
                Capture your brand once in settings. Every caption and image uses
                those details so you stay on brand with every post.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-left">
              <p className="mb-1 text-xs font-semibold text-slate-400">
                Captions and images that match
              </p>
              <p className="text-slate-200">
                The engine reads your prompt, knows when to focus on people or
                product, and varies the shot for engaging posts.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-left">
              <p className="mb-1 text-xs font-semibold text-slate-400">
                Built for real founders
              </p>
              <p className="text-slate-200">
                Flow Social is designed for founders and lean teams. It gives you a studio that feels like an assistant who
                already knows your brand.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="mt-16 space-y-6 text-center">
          <h2 className="text-lg font-semibold">Pricing</h2>
          <p className="mx-auto max-w-2xl text-sm text-slate-300">
            Start on the free tier while you learn how Flow Social fits into your
            content plans. Upgrade when ready.
          </p>

          <div className="mt-4 grid gap-5 md:grid-cols-3">
            {/* Free tier */}
            <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-left">
              <p className="mb-1 text-xs font-semibold text-slate-400">Free</p>
              <p className="mb-1 text-2xl font-semibold">
                $0 <span className="text-xs text-slate-400">per month</span>
              </p>
              <ul className="mb-4 space-y-1 text-[11px] text-slate-300">
                <li>One brand profile</li>
                <li>Limited monthly caption and image generations</li>
                <li>Access to core Brand Studio flow</li>
              </ul>
              <Link
                href="/studio"
                className="mt-auto inline-flex items-center justify-center rounded-full bg-sky-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-sky-400"
              >
                Start Free
              </Link>
            </div>

            {/* Pro tier */}
            <div className="flex flex-col rounded-2xl border border-sky-500 bg-slate-900/80 p-5 text-left shadow-lg shadow-sky-500/30">
              <p className="mb-1 text-xs font-semibold text-sky-300">Pro</p>
              <p className="mb-1 text-2xl font-semibold">
                $99 <span className="text-xs text-slate-400">per month</span>
              </p>
              <ul className="mb-4 space-y-1 text-[11px] text-slate-300">
                <li>Up to 3 brands</li>
                <li>Higher monthly caption and image generations</li>
                <li>Priority access to new studio features</li>
                <li>Early access to feed preview and batch generation</li>
              </ul>
              <button
                type="button"
                onClick={() => handleCheckout("pro")}
                disabled={checkoutLoading !== null}
                className={`mt-auto inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-medium ${
                  checkoutLoading
                    ? "border-slate-700 bg-slate-800 text-slate-400 cursor-not-allowed"
                    : "border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer"
                }`}
              >
                {checkoutLoading === "pro" ? "Redirecting..." : "Upgrade to Pro"}
              </button>
            </div>

            {/* Studio Max tier */}
            <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-left">
              <p className="mb-1 text-xs font-semibold text-slate-400">
                Studio Max
              </p>
              <p className="mb-1 text-2xl font-semibold">
                $299 <span className="text-xs text-slate-400">per month</span>
              </p>
              <ul className="mb-4 space-y-1 text-[11px] text-slate-300">
                <li>For agencies and creators with many brands</li>
                <li>Higher or custom monthly limits</li>
                <li>Advanced tools as they ship</li>
                <li>Best once Flow Social is your studio of record</li>
              </ul>
              <button
                type="button"
                onClick={() => handleCheckout("studio_max")}
                disabled={checkoutLoading !== null}
                className={`mt-auto inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-medium ${
                  checkoutLoading
                    ? "border-slate-700 bg-slate-800 text-slate-400 cursor-not-allowed"
                    : "border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer"
                }`}
              >
                {checkoutLoading === "studio_max"
                  ? "Redirecting..."
                  : "Upgrade to Studio Max"}
              </button>
            </div>
          </div>

          {checkoutError && (
            <p className="mt-3 text-xs text-red-400 text-center">
              {checkoutError}
            </p>
          )}
        </section>

        {/* FAQ + final CTA */}
        <section className="mt-16 space-y-8">
          <div className="text-center">
            <h2 className="text-lg font-semibold">Questions, before you try it?</h2>
            <p className="mx-auto max-w-2xl text-sm text-slate-300">
              Flow Social is still early, but the core studio is live and already
              being used to create real content. Here is what most founders ask
              before they start.
            </p>
          </div>

          <div className="grid gap-5 text-sm md:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="mb-1 text-xs font-semibold text-slate-400">
                Do I need design or AI skills to use this?
              </p>
              <p className="text-slate-200">
                No. You describe what you want to post in plain language. The
                studio uses your brand settings behind the scenes so captions and
                images stay on brand.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="mb-1 text-xs font-semibold text-slate-400">
                What happens when I outgrow the free tier?
              </p>
              <p className="text-slate-200">
                The free tier is meant to get Flow Social into your weekly
                workflow. When you need more features or more content, you can
                move to Pro or Studio Max once payments are live.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="mb-1 text-xs font-semibold text-slate-400">
                Does Flow Social replace my social scheduler?
              </p>
              <p className="text-slate-200">
                Not yet. Right now, Flow Social is a focused studio for creating
                on brand content. You can still post or schedule from tools you
                already use.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="mb-1 text-xs font-semibold text-slate-400">
                Can I use this for more than Instagram?
              </p>
              <p className="text-slate-200">
                Yes. Captions and images are optimized for Instagram, but they
                work well for TikTok, LinkedIn and other channels with light
                tweaks.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-900/70 px-5 py-5 text-center">
            <p className="text-sm font-medium text-slate-100">
              Ready to see how your brand looks inside the studio?
            </p>
            <p className="mt-1 text-xs text-slate-300">
              Set up your first brand in a few minutes and generate your first
              post today.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/studio"
                className="inline-flex items-center justify-center rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400"
              >
                Open the Brand Studio
              </Link>
              <span className="text-[11px] text-slate-400">
                Free tier · No credit card · Private beta
              </span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-4 text-[11px] text-slate-500 sm:flex-row">
          <span>
            © {new Date().getFullYear()} Flow Social. Built for Founders.
          </span>
          <div className="flex items-center gap-3">
            <Link href="/studio" className="hover:text-slate-300">
              Open Studio
            </Link>
            <span>Private Beta</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
