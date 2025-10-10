"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FiArrowLeft, FiMail } from "react-icons/fi";
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
      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600 mx-auto"></div>
          <p className="mt-2 text-sm text-slate-500">Loading preview...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <button
          onClick={() => router.push("/")}
          className="mb-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-md text-sm font-medium hover:bg-slate-200"
        >
          <FiArrowLeft className="text-base" />
          <span>Back</span>
        </button>
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-red-700">
          <h1 className="text-lg font-semibold">Unable to load preview</h1>
          <p className="mt-2 text-sm leading-6">
            {error}. Ensure the news API is reachable and try refreshing this
            page.
          </p>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const { htmlEmail, plainText, formatted } = data;

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
      <button
        onClick={() => router.push("/")}
        className="mb-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-md text-sm font-medium hover:bg-slate-200"
      >
        <FiArrowLeft className="text-base" />
        <span>Back</span>
      </button>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          The Gist email preview
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          Preview exactly what lands in inboxes each morning. Use this to
          sanity-check layout, sources, and summaries before hitting send.
        </p>
        <div className="inline-flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-600">
          <span>{formatted?.totalArticles ?? 0} articles</span>
          <span className="text-slate-400">•</span>
          <span>{formatted?.totalTopics ?? 0} topics</span>
          <span className="text-slate-400">•</span>
          <span>{formatted?.totalPublishers ?? 0} sources</span>
          <span className="text-slate-400">•</span>
          <span>
            {formatted?.aiMetadata?.usedFallback
              ? "Human safeguards"
              : formatted?.aiMetadata?.model
              ? `AI via ${formatted.aiMetadata.model}`
              : "AI metadata unavailable"}
          </span>
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <iframe
          title="Email preview"
          srcDoc={htmlEmail}
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          className="h-[900px] sm:h-[1000px] lg:h-[1200px] w-full"
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-800">
          Plaintext version
        </h2>
        <pre className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          {plainText}
        </pre>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-800">
          AI section breakdown
        </h2>
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 lg:grid-cols-2">
          <div>
            <h3 className="font-semibold text-slate-900">
              Today&apos;s essential reads
            </h3>
            <p className="mt-1 text-slate-600">
              {formatted.plan.essentialReads.overview}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-600">
              {(formatted?.plan?.essentialReads?.highlights ?? []).map(
                (item: any) => (
                  <li key={item.link}>
                    <span className="font-medium text-slate-800">
                      {item.title}
                    </span>
                    {": "}
                    {item.summary}
                  </li>
                )
              )}
            </ul>
          </div>
          <div className="space-y-1 text-slate-600">
            <div>
              <span className="font-semibold text-slate-900">
                Commentaries:
              </span>{" "}
              {(formatted?.plan?.commentaries ?? []).length} picks
            </div>
            <div>
              <span className="font-semibold text-slate-900">
                International:
              </span>{" "}
              {(formatted?.plan?.international ?? []).length} stories
            </div>
            <div>
              <span className="font-semibold text-slate-900">Politics:</span>{" "}
              {(formatted?.plan?.politics ?? []).length} stories
            </div>
            <div>
              <span className="font-semibold text-slate-900">
                Business & tech:
              </span>{" "}
              {(formatted?.plan?.businessAndTech ?? []).length} stories
            </div>
            <div>
              <span className="font-semibold text-slate-900">Wild card:</span>{" "}
              {(formatted?.plan?.wildCard ?? []).length} feature
            </div>
            <div className="pt-2 text-slate-500">
              Summary: {formatted?.plan?.summary ?? "(no summary)"}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default EmailPreview;
