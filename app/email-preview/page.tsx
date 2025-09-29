import { headers } from "next/headers";

import { formatArticles, formatBody } from "@/lib/email";

type SerializedProcessedNewsItem = Omit<ProcessedNewsItem, "pubDate"> & {
  pubDate: string;
};

type AggregatedTopicsResponse = {
  topics: {
    topic: string;
    slug: string;
    publisher: string;
    items: SerializedProcessedNewsItem[];
  }[];
};

const toTopicGroups = (
  response: AggregatedTopicsResponse
): TopicNewsGroup[] => {
  return response.topics.map((group) => ({
    topic: group.topic,
    slug: group.slug,
    publisher: group.publisher,
    items: group.items.map((item) => ({
      ...item,
      pubDate: new Date(item.pubDate),
    })),
  }));
};

const fetchTopics = async (): Promise<TopicNewsGroup[]> => {
  const headerList = headers();
  const host = headerList.get("host");
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const fallbackBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const baseUrl = host ? `${protocol}://${host}` : fallbackBaseUrl;

  const res = await fetch(`${baseUrl}/api/news`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
    },
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(`Failed to fetch news topics: ${res.status} ${message}`);
  }

  const json = (await res.json()) as AggregatedTopicsResponse;
  return toTopicGroups(json);
};

const EmailPreview = async () => {
  try {
    const topics = await fetchTopics();
    const formatted = formatArticles(topics);
    const htmlEmail = formatBody(formatted, "preview");

    return (
      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Newsletter email preview
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            This page renders the exact HTML sent to recipients using the latest
            commentary feeds from your configured publishers. Use this view to
            spot-check styling and content before sending.
          </p>
          <div className="inline-flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-600">
            <span>{formatted.totalArticles} commentaries</span>
            <span className="text-slate-400">•</span>
            <span>{formatted.totalTopics} topics</span>
            <span className="text-slate-400">•</span>
            <span>{formatted.totalPublishers} sources</span>
          </div>
        </header>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <iframe
            title="Email preview"
            srcDoc={htmlEmail}
            sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
            className="h-[900px] w-full"
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">
            Plaintext version
          </h2>
          <pre className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            {formatted.text}
          </pre>
        </section>
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-red-700">
          <h1 className="text-lg font-semibold">Unable to load preview</h1>
          <p className="mt-2 text-sm leading-6">
            {message}. Ensure the news API is reachable and try refreshing this
            page.
          </p>
        </div>
      </main>
    );
  }
};

export default EmailPreview;
