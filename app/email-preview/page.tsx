import { formatArticlesWithoutGemini, formatBody } from "@/lib/email";

type SerializedProcessedNewsItem = Omit<ProcessedNewsItem, "pubDate"> & {
  pubDate: string;
};

type AggregatedTopicsResponse = {
  topics: {
    topic: string;
    slug: string;
    publisher: string;
    sectionHints: NewsletterSectionHint[];
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
    sectionHints: group.sectionHints ?? [],
    items: group.items.map((item) => ({
      ...item,
      pubDate: new Date(item.pubDate),
      sectionHints: item.sectionHints ?? [],
    })),
  }));
};

const fetchTopics = async (): Promise<TopicNewsGroup[]> => {
  // Mock data for development/testing
  const mockResponse: AggregatedTopicsResponse = {
    topics: [
      {
        topic: "Lorem Ipsum Politics",
        slug: "lorem-politics",
        publisher: "Lorem Times",
        sectionHints: ["politics"],
        items: [
          {
            title: "Lorem ipsum dolor sit amet, consectetur adipiscing elit",
            link: "https://example.com/lorem-1",
            description:
              "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
            pubDate: new Date().toISOString(),
            source: "lorem-times-rss",
            publisher: "Lorem Times",
            topic: "Lorem Ipsum Politics",
            slug: "lorem-politics",
            sectionHints: ["politics"],
          },
          {
            title: "Duis aute irure dolor in reprehenderit in voluptate",
            link: "https://example.com/lorem-2",
            description:
              "Velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident.",
            pubDate: new Date(Date.now() - 3600000).toISOString(),
            source: "lorem-times-rss",
            publisher: "Lorem Times",
            topic: "Lorem Ipsum Politics",
            slug: "lorem-politics",
            sectionHints: ["politics"],
          },
        ],
      },
      {
        topic: "Ipsum Business Technology",
        slug: "ipsum-business-tech",
        publisher: "Ipsum Business Daily",
        sectionHints: ["business-tech"],
        items: [
          {
            title: "Consectetur adipiscing elit, sed do eiusmod tempor",
            link: "https://example.com/ipsum-1",
            description:
              "Incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
            pubDate: new Date(Date.now() - 7200000).toISOString(),
            source: "ipsum-business-rss",
            publisher: "Ipsum Business Daily",
            topic: "Ipsum Business Technology",
            slug: "ipsum-business-tech",
            sectionHints: ["business-tech"],
          },
        ],
      },
      {
        topic: "Dolor International Affairs",
        slug: "dolor-international",
        publisher: "Global Dolor Report",
        sectionHints: ["international"],
        items: [
          {
            title: "Mauris blandit aliquet elit, eget tincidunt nibh pulvinar",
            link: "https://example.com/dolor-1",
            description:
              "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae.",
            pubDate: new Date(Date.now() - 10800000).toISOString(),
            source: "global-dolor-rss",
            publisher: "Global Dolor Report",
            topic: "Dolor International Affairs",
            slug: "dolor-international",
            sectionHints: ["international"],
          },
          {
            title: "Vivamus suscipit tortor eget felis porttitor volutpat",
            link: "https://example.com/dolor-2",
            description:
              "Curabitur non nulla sit amet nisl tempus convallis quis ac lectus. Donec rutrum congue leo eget malesuada.",
            pubDate: new Date(Date.now() - 14400000).toISOString(),
            source: "global-dolor-rss",
            publisher: "Global Dolor Report",
            topic: "Dolor International Affairs",
            slug: "dolor-international",
            sectionHints: ["international"],
          },
        ],
      },
      {
        topic: "Amet Commentary Corner",
        slug: "amet-commentary",
        publisher: "Amet Opinion Hub",
        sectionHints: ["commentaries"],
        items: [
          {
            title:
              "Quisque velit nisi, pretium ut lacinia in, elementum id enim",
            link: "https://example.com/amet-1",
            description:
              "Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Donec velit neque, auctor sit amet aliquam vel.",
            pubDate: new Date(Date.now() - 18000000).toISOString(),
            source: "amet-opinion-rss",
            publisher: "Amet Opinion Hub",
            topic: "Amet Commentary Corner",
            slug: "amet-commentary",
            sectionHints: ["commentaries"],
          },
        ],
      },
      {
        topic: "Elit Wild Stories",
        slug: "elit-wild",
        publisher: "Elit Chronicles",
        sectionHints: ["wildcard"],
        items: [
          {
            title: "Proin eget tortor risus cras ultricies ligula sed magna",
            link: "https://example.com/elit-1",
            description:
              "Dictum sit amet justo donec enim diam vulputate ut pharetra sit. Amet mauris commodo quis imperdiet massa tincidunt nunc pulvinar sapien.",
            pubDate: new Date(Date.now() - 21600000).toISOString(),
            source: "elit-chronicles-rss",
            publisher: "Elit Chronicles",
            topic: "Elit Wild Stories",
            slug: "elit-wild",
            sectionHints: ["wildcard"],
          },
        ],
      },
    ],
  };

  return toTopicGroups(mockResponse);
};

const EmailPreview = async () => {
  try {
    const topics = await fetchTopics();
    const formatted = await formatArticlesWithoutGemini(
      topics,
      "Email preview rendered without Gemini"
    );
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
            <span className="text-slate-400">•</span>
            <span>
              {formatted.aiMetadata.usedFallback
                ? "Heuristic fallback"
                : `Gemini: ${formatted.aiMetadata.model}`}
            </span>
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
                {formatted.plan.essentialReads.highlights.map((item) => (
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
