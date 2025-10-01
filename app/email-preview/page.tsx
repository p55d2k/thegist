"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  formatArticlesWithoutGemini,
  formatBody,
  formatRawBody,
} from "@/lib/email";
import { MOCK_NEWSLETTER_DATA } from "@/constants/mockData";

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
        // Convert mock data to TopicNewsGroup format
        const topics: TopicNewsGroup[] = MOCK_NEWSLETTER_DATA.topics.map(
          (group) => ({
            topic: group.topic,
            slug: group.slug,
            publisher: group.publisher,
            sectionHints: [...group.sectionHints],
            items: group.items.map((item) => ({
              title: item.title,
              description: item.description,
              link: item.link,
              pubDate: new Date(item.pubDate),
              source: item.source,
              publisher: item.publisher,
              topic: item.topic,
              slug: item.slug,
              sectionHints: [...item.sectionHints],
            })),
          })
        );

        // For preview mode, ensure links don't navigate — replace with '#'
        const previewTopics = topics.map((group) => ({
          ...group,
          items: group.items.map((item) => ({ ...item, link: "#" })),
        }));
        const formatted = await formatArticlesWithoutGemini(
          topics, // Use original topics for processing
          "Email preview with real newsletter data"
        );

        // Replace all links with '#' for preview
        const replaceLinks = (obj: any): any => {
          if (typeof obj === "object" && obj !== null) {
            if (obj.link) obj.link = "#";
            for (const key in obj) {
              replaceLinks(obj[key]);
            }
          }
          return obj;
        };
        replaceLinks(formatted);

        // Mock send ID for preview verification. In production this will be a
        // real unique send identifier returned by the send pipeline.
        const mockSendId = `preview-${new Date().toISOString()}`;

        const htmlEmail = formatBody(formatted, mockSendId);
        const plainText = formatRawBody(formatted, mockSendId);

        setData({ htmlEmail, plainText, formatted });
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
          className="mb-4 px-4 py-2 bg-slate-100 text-slate-700 rounded-md text-sm font-medium hover:bg-slate-200"
        >
          ← Back
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
        className="mb-4 px-4 py-2 bg-slate-100 text-slate-700 rounded-md text-sm font-medium hover:bg-slate-200"
      >
        ← Back
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
          <span>{formatted.totalArticles} articles</span>
          <span className="text-slate-400">•</span>
          <span>{formatted.totalTopics} topics</span>
          <span className="text-slate-400">•</span>
          <span>{formatted.totalPublishers} sources</span>
          <span className="text-slate-400">•</span>
          <span>
            {formatted.aiMetadata.usedFallback
              ? "Human safeguards"
              : `AI via ${formatted.aiMetadata.model}`}
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
              {formatted.plan.essentialReads.highlights.map((item: any) => (
                <li key={item.link}>
                  <span className="font-medium text-slate-800">
                    {item.title}
                  </span>
                  {": "}
                  {item.summary}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-1 text-slate-600">
            <div>
              <span className="font-semibold text-slate-900">
                Commentaries:
              </span>{" "}
              {formatted.plan.commentaries.length} picks
            </div>
            <div>
              <span className="font-semibold text-slate-900">
                International:
              </span>{" "}
              {formatted.plan.international.length} stories
            </div>
            <div>
              <span className="font-semibold text-slate-900">Politics:</span>{" "}
              {formatted.plan.politics.length} stories
            </div>
            <div>
              <span className="font-semibold text-slate-900">
                Business & tech:
              </span>{" "}
              {formatted.plan.businessAndTech.length} stories
            </div>
            <div>
              <span className="font-semibold text-slate-900">Wild card:</span>{" "}
              {formatted.plan.wildCard.length} feature
            </div>
            <div className="pt-2 text-slate-500">
              Summary: {formatted.plan.summary}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default EmailPreview;
