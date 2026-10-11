"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FiArrowLeft, FiMail, FiEye, FiFileText, FiZap } from "react-icons/fi";
import { motion } from "framer-motion";
import {
  formatBody,
  formatRawBody,
  computeTotalsFromPlan,
  buildHtml,
  buildText,
} from "@/lib/email";

const EmailPreview = () => {
  const router = useRouter();
  const [data, setData] = useState<{
    htmlEmail: string;
    plainText: string;
    formatted: any;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPreview = async () => {
      try {
        // Fetch the latest newsletter job via the server route
        const res = await fetch(`/api/latest-newsletter`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const message = body?.error || `Server returned ${res.status}`;
          throw new Error(message);
        }

        const payload = await res.json();
        const job = payload?.job;
        if (!job || !job.plan) {
          throw new Error("Newsletter job or plan not found");
        }

        // Use the plan from the job
        const plan = job.plan;

        // Compute totals from plan
        const totals = computeTotalsFromPlan(plan);

        // Get AI metadata from job
        const aiMetadata = job.aiMetadata || {
          model: "unknown",
          usedFallback: true,
          fallbackReason: "Metadata unavailable",
        };

        // Build formatted newsletter
        const formatted = {
          plan,
          html: "",
          text: "",
          ...totals,
          aiMetadata,
        };

        formatted.html = buildHtml(formatted);
        formatted.text = buildText(formatted);

        // Preserve real article links so clicking opens the actual article
        // in a new tab (we inject a <base target="_blank"> below).

        // Mock send ID for preview verification (use non-'preview-' prefix so
        // plaintext shows real URLs instead of obfuscated placeholders)
        const mockSendId = `debug-${new Date().toISOString()}`;

        const htmlEmail = formatBody(formatted, mockSendId);

        // Ensure links open in a new tab instead of navigating the iframe.
        // Insert a <base target="_blank"> into the document head if present,
        // otherwise prepend it so anchors open in a new tab.
        const ensureBaseTarget = (html: string) => {
          try {
            if (/<head[\s>]/i.test(html)) {
              return html.replace(
                /<head(.*?)>/i,
                (m) =>
                  `${m}<base target=\"_blank\" rel=\"noopener noreferrer\" />`
              );
            }
            // If there's an HTML document wrapper, try to inject after <html> or at start
            if (/<!doctype html>/i.test(html) || /<html[\s>]/i.test(html)) {
              return html.replace(
                /<html(.*?)>/i,
                (m) =>
                  `${m}<head><base target=\"_blank\" rel=\"noopener noreferrer\" /></head>`
              );
            }
            // Fallback: prepend a minimal head with base
            return `<head><base target=\"_blank\" rel=\"noopener noreferrer\" /></head>${html}`;
          } catch (err) {
            return html;
          }
        };

        const htmlWithBase = ensureBaseTarget(htmlEmail);
        const plainText = formatRawBody(formatted, mockSendId);

        setData({ htmlEmail: htmlWithBase, plainText, formatted });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    loadPreview();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto max-w-6xl px-6 pb-24 pt-8">
        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/70 p-16 text-center shadow-[0_40px_120px_-60px_rgba(79,70,229,0.8)]">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-400" />
          <p className="mt-6 text-base text-slate-400">
            Loading email preview...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-6xl px-6 pb-24 pt-8">
        <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-12 text-center shadow-[0_40px_120px_-60px_rgba(244,63,94,0.45)]">
          <FiMail className="mx-auto h-12 w-12 text-red-300" />
          <h1 className="mt-4 text-2xl font-semibold text-slate-50">
            Unable to load preview
          </h1>
          <p className="mt-3 text-sm leading-6 text-red-200">
            {error}. Ensure the news API is reachable and try refreshing this
            page.
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-transparent px-4 py-2 text-sm font-medium text-red-200 transition-all duration-200 hover:border-red-300 hover:text-white"
          >
            <FiArrowLeft className="h-4 w-4" />
            <span>Back to home</span>
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { htmlEmail, plainText, formatted } = data;

  return (
    <div className="container mx-auto max-w-6xl px-6 pb-24 pt-8">
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-3xl border border-slate-800/60 bg-slate-900/70 pt-12 px-10 pb-10 shadow-[0_40px_120px_-60px_rgba(79,70,229,0.8)] backdrop-blur-xl"
      >
        <div className="pointer-events-none absolute -top-40 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-500/30 blur-[120px]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 translate-x-1/3 translate-y-1/3 rounded-full bg-violet-500/20 blur-[120px]" />

        <div className="relative z-10 space-y-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 rounded-full border border-slate-800/70 bg-slate-950/60 px-4 py-2 text-sm font-medium text-slate-300 transition-all duration-200 hover:border-slate-700 hover:text-white"
            >
              <FiArrowLeft className="h-4 w-4" />
              <span>Back to home</span>
            </button>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-200">
              <FiEye className="h-4 w-4" />
              Live preview
            </div>
          </div>

          <header className="space-y-6">
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl font-bold tracking-tight text-slate-50"
            >
              Email preview dashboard
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="max-w-2xl text-lg leading-7 text-slate-300"
            >
              Spot-check the layout, sources, and summaries before the brief
              goes live. Everything below mirrors what lands in inboxes twice a
              day.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800/60 bg-slate-950/60 px-5 py-3 text-sm font-medium text-slate-200"
            >
              <FiFileText className="h-4 w-4" />
              <span>{formatted?.totalArticles ?? 0} articles</span>
              <span className="text-slate-500">•</span>
              <span>{formatted?.totalTopics ?? 0} topics</span>
              <span className="text-slate-500">•</span>
              <span>{formatted?.totalPublishers ?? 0} sources</span>
              <span className="text-slate-500">•</span>
              <span className="inline-flex items-center gap-1">
                <FiZap className="h-3 w-3 text-indigo-300" />
                {formatted?.aiMetadata?.usedFallback
                  ? "Human safeguards"
                  : formatted?.aiMetadata?.model
                  ? `AI via ${formatted.aiMetadata.model}`
                  : "AI metadata unavailable"}
              </span>
            </motion.div>
          </header>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-950/60 shadow-2xl"
          >
            <iframe
              title="Email preview"
              srcDoc={htmlEmail}
              sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
              className="h-[900px] w-full sm:h-[1000px] lg:h-[1200px]"
            />
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-3">
              <FiFileText className="h-5 w-5 text-slate-400" />
              <h2 className="text-2xl font-semibold text-slate-50">
                Plain text version
              </h2>
            </div>
            <pre className="max-h-[600px] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-slate-800/60 bg-slate-950/60 p-6 text-sm leading-6 text-slate-200">
              {plainText}
            </pre>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-3">
              <FiZap className="h-5 w-5 text-indigo-300" />
              <h2 className="text-2xl font-semibold text-slate-50">
                AI content breakdown
              </h2>
            </div>
            <div className="grid gap-6 rounded-2xl border border-slate-800/60 bg-slate-950/60 p-6 text-sm text-slate-300 lg:grid-cols-2">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-50">
                  Today&apos;s essential reads
                </h3>
                <p className="text-slate-300">
                  {formatted.plan.essentialReads.overview}
                </p>
                <ul className="space-y-2 pl-4">
                  {(formatted?.plan?.essentialReads?.highlights ?? []).map(
                    (item: any) => (
                      <li key={item.link} className="flex items-start gap-2">
                        <span className="mt-1 text-indigo-300">•</span>
                        <div>
                          <span className="font-medium text-slate-50">
                            {item.title}
                          </span>
                          <span className="text-slate-400">
                            : {item.summary}
                          </span>
                        </div>
                      </li>
                    )
                  )}
                </ul>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="font-medium text-slate-200">
                    Commentaries:
                  </span>
                  <span>
                    {(formatted?.plan?.commentaries ?? []).length} picks
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-slate-200">
                    International:
                  </span>
                  <span>
                    {(formatted?.plan?.international ?? []).length} stories
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-slate-200">Politics:</span>
                  <span>
                    {(formatted?.plan?.politics ?? []).length} stories
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-slate-200">
                    Business & tech:
                  </span>
                  <span>
                    {(formatted?.plan?.businessAndTech ?? []).length} stories
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-slate-200">Wild card:</span>
                  <span>
                    {(formatted?.plan?.wildCard ?? []).length} feature
                  </span>
                </div>
                <div className="border-t border-slate-800/60 pt-4 text-slate-400">
                  <span className="font-medium text-slate-200">Summary:</span>{" "}
                  {formatted?.plan?.summary ?? "(no summary)"}
                </div>
              </div>
            </div>
          </motion.section>
        </div>
      </motion.section>
    </div>
  );
};

export default EmailPreview;
