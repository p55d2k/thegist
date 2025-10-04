import axios from "axios";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { parseStringPromise } from "xml2js";

import { links } from "@/constants/links";
import {
  getActiveSubscribers,
  createNewsletterJobFromNews,
  type SerializedTopicNewsGroup,
  findActiveNewsCollectionJob,
  appendNewsBatchToJob,
  NewsJobCursorConflictError,
} from "@/lib/firestore";
import {
  DEFAULT_LIMITS,
  ONE_DAY_MS,
  CACHE_HEADERS,
  USER_AGENT,
} from "@/constants/config";
import { computeArticlesSummary } from "@/lib/news-helpers";

const AUTH_HEADER = "authorization";

const ensureAuthorized = (request: NextRequest): NextResponse | null => {
  const token = process.env.NEWSLETTER_JOB_TOKEN;
  if (!token) {
    return null;
  }

  const header = request.headers.get(AUTH_HEADER);
  const expected = `Bearer ${token}`;
  if (header !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
};

export async function GET(req: NextRequest) {
  const authResponse = ensureAuthorized(req);
  if (authResponse) {
    return authResponse;
  }

  revalidatePath("/api/news");

  const searchParams = req.nextUrl.searchParams;
  const persist = searchParams.get("persist") !== "false";
  const batchSizeParam = searchParams.get("batchSize");
  const sourcesParam = searchParams.get("sources");

  const batchSize = Number.isFinite(Number(batchSizeParam))
    ? Math.max(1, Number.parseInt(batchSizeParam ?? "50", 10))
    : DEFAULT_LIMITS.batchSize;

  const totalSources = links.length;
  const defaultSourcesPerRun = Math.max(
    1,
    Math.min(DEFAULT_LIMITS.newsSourcesPerRun, Math.max(1, totalSources))
  );
  const parsedSources = Number.parseInt(sourcesParam ?? "", 10);
  const sourcesPerRun = Number.isFinite(parsedSources)
    ? Math.max(1, Math.min(parsedSources, Math.max(1, totalSources)))
    : defaultSourcesPerRun;

  const oneWeekAgo = new Date(Date.now() - 7 * ONE_DAY_MS);

  if (!persist) {
    const newsResult = await fetchNewsForLinks(links, oneWeekAgo);

    const basePayload: Record<string, unknown> = {
      message: `Retrieved ${newsResult.allNews.length} items across ${newsResult.topics.length} topic feeds`,
      count: newsResult.allNews.length,
    };

    const fullPayload = {
      ...basePayload,
      topics: newsResult.topics,
      news: newsResult.allNews,
    };

    const response = NextResponse.json(fullPayload, { status: 200 });
    applyCacheHeaders(response);
    return response;
  }

  if (totalSources === 0) {
    return new NextResponse(null, { status: 204 });
  }

  let message = "";
  let count = 0;
  let persistenceInfo: Record<string, unknown> | undefined;

  const activeJob = await findActiveNewsCollectionJob();

  if (!activeJob) {
    return NextResponse.json(
      {
        error:
          "No active newsletter job found. Start a job with /api/start-newsletter first.",
      },
      { status: 400 }
    );
  }

  const { id, job } = activeJob;
  const currentCursor = job.newsCursor ?? 0;
  const resolvedSourcesTotal = Math.max(totalSources, job.sourcesTotal ?? 0);

  if (currentCursor >= resolvedSourcesTotal) {
    return new NextResponse(null, { status: 204 });
  }

  const slice = links.slice(
    currentCursor,
    Math.min(resolvedSourcesTotal, currentCursor + sourcesPerRun)
  );

  if (slice.length === 0) {
    return new NextResponse(null, { status: 204 });
  }

  const newsResult = await fetchNewsForLinks(slice, oneWeekAgo);

  try {
    const appendResult = await appendNewsBatchToJob({
      id,
      expectedCursor: currentCursor,
      newTopics: newsResult.serializedTopics,
      cursorIncrement: slice.length,
      totalSources: resolvedSourcesTotal,
    });

    message =
      appendResult.status === "news-ready"
        ? `Completed news collection job: processed ${slice.length} sources this run`
        : `Appended ${slice.length} sources (${appendResult.newsCursor}/${appendResult.sourcesTotal})`;

    count = appendResult.articlesSummary.totalArticles;

    persistenceInfo = {
      persisted: true,
      sendId: id,
      totalRecipients: appendResult.totalRecipients,
      pendingRecipients: appendResult.pendingRecipientsCount,
      batchSize,
      jobStatus: appendResult.status,
      processedSources: appendResult.newsCursor,
      remainingSources: Math.max(
        appendResult.sourcesTotal - appendResult.newsCursor,
        0
      ),
      totalSources: appendResult.sourcesTotal,
      batchSources: slice.length,
      batchArticles: newsResult.allNews.length,
      appendedArticles: appendResult.appendedArticles,
      totalArticles: appendResult.articlesSummary.totalArticles,
      totalTopics: appendResult.articlesSummary.totalTopics,
      totalPublishers: appendResult.articlesSummary.totalPublishers,
      sourcesPerRun,
    };
  } catch (error) {
    if (error instanceof NewsJobCursorConflictError) {
      const response = NextResponse.json(
        {
          error: "News job cursor advanced by another worker. Retry shortly.",
        },
        { status: 409 }
      );
      applyCacheHeaders(response);
      return response;
    }
    throw error;
  }

  if (!persistenceInfo) {
    persistenceInfo = { persisted: false, sourcesPerRun };
  }

  if (!message) {
    message = "Processed news batch.";
  }

  if (
    count === 0 &&
    typeof (persistenceInfo as Record<string, unknown>).totalArticles ===
      "number"
  ) {
    count = (persistenceInfo as { totalArticles: number }).totalArticles;
  }

  const basePayload = {
    message,
    count,
    ...persistenceInfo,
  };

  const response = NextResponse.json(basePayload, { status: 200 });
  applyCacheHeaders(response);
  return response;
}

type FetchNewsResult = {
  topics: TopicNewsGroup[];
  serializedTopics: SerializedTopicNewsGroup[];
  allNews: ProcessedNewsItem[];
  articlesSummary: ReturnType<typeof computeArticlesSummary>;
};

const applyCacheHeaders = (response: NextResponse) => {
  response.headers.set("Cache-Control", CACHE_HEADERS["Cache-Control"]);
  response.headers.set("Pragma", CACHE_HEADERS.Pragma);
  response.headers.set("Expires", CACHE_HEADERS.Expires);
  response.headers.set("Surrogate-Control", CACHE_HEADERS["Surrogate-Control"]);
};

async function fetchNewsForLinks(
  selectedLinks: TopicLink[],
  since: Date
): Promise<FetchNewsResult> {
  if (selectedLinks.length === 0) {
    return {
      topics: [],
      serializedTopics: [],
      allNews: [],
      articlesSummary: {
        totalArticles: 0,
        totalTopics: 0,
        totalPublishers: 0,
      },
    };
  }

  const groupedResults = await Promise.all(
    selectedLinks.map(
      async ({
        topic,
        slug,
        publisher,
        url,
        commentaryPrefix,
        sectionHints,
      }) => {
        const normalizedHints: NewsletterSectionHint[] = sectionHints ?? [];
        try {
          const response = await axios.get(url, {
            headers: { "User-Agent": USER_AGENT },
          });
          const result = await parseStringPromise(response.data);

          const channel = result.rss?.channel?.[0];
          const channelTitle = channel?.title?.[0] || `${publisher} ${topic}`;
          const items = (channel?.item ?? []) as (RSSItem &
            Record<string, unknown>)[];

          const seenLinks = new Set<string>();
          let processed: ProcessedNewsItem[] = [];

          for (const item of items) {
            const link = extractText(item.link);
            if (!link || seenLinks.has(link)) {
              continue;
            }

            const title = extractText(item.title);
            if (!title) {
              continue;
            }

            if (commentaryPrefix && !title.startsWith(commentaryPrefix)) {
              continue;
            }

            const pubDateRaw = extractText(item.pubDate);
            if (!pubDateRaw) {
              continue;
            }

            const pubDate = new Date(pubDateRaw);
            if (Number.isNaN(pubDate.getTime()) || pubDate < since) {
              continue;
            }

            seenLinks.add(link);

            const description = extractText(item.description) ?? "";
            const imageUrl = extractImageUrl(item);

            processed.push({
              title,
              description,
              link,
              pubDate,
              source: channelTitle,
              publisher,
              topic,
              slug,
              imageUrl,
              sectionHints: normalizedHints,
            });
          }

          processed.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
          processed = processed.slice(0, DEFAULT_LIMITS.rssArticlesPerFeed);

          if (processed.length === 0) {
            return null;
          }

          return {
            topic,
            slug,
            publisher,
            sectionHints: normalizedHints,
            items: processed,
          } satisfies TopicNewsGroup;
        } catch (error) {
          console.error(`Error fetching RSS from ${url}:`, error);
          return null;
        }
      }
    )
  );

  // Group articles by sectionHint instead of by feed
  const articlesByHint = new Map<NewsletterSectionHint, ProcessedNewsItem[]>();
  const seenGlobal = new Set<string>();

  for (const group of groupedResults) {
    if (!group) {
      continue;
    }

    for (const item of group.items) {
      if (seenGlobal.has(item.link)) {
        continue;
      }
      seenGlobal.add(item.link);

      // Add article to ALL matching section hints
      for (const hint of item.sectionHints) {
        if (!articlesByHint.has(hint)) {
          articlesByHint.set(hint, []);
        }
        articlesByHint.get(hint)!.push(item);
      }
    }
  }

  // Create topic groups from the grouped articles
  const topics: TopicNewsGroup[] = [];

  articlesByHint.forEach((items, hint) => {
    if (items.length === 0) {
      return;
    }

    // Use the hint as the topic name, and find a representative publisher/slug
    const representativeItem = items[0];
    const topicName = hint;
    const topicSlug = hint;
    const topicPublisher =
      items.length === 1 ? representativeItem.publisher : "Multiple Publishers";

    topics.push({
      topic: topicName,
      slug: topicSlug,
      publisher: topicPublisher,
      sectionHints: [hint],
      items: items.sort(
        (a: ProcessedNewsItem, b: ProcessedNewsItem) =>
          b.pubDate.getTime() - a.pubDate.getTime()
      ),
    });
  });
  topics.sort((a, b) => {
    const hintCompare = a.sectionHints[0].localeCompare(b.sectionHints[0]);
    if (hintCompare !== 0) {
      return hintCompare;
    }
    return a.publisher.localeCompare(b.publisher);
  });

  const allNews = topics.flatMap((group) => group.items);

  const serializedTopics: SerializedTopicNewsGroup[] = topics.map((group) => ({
    topic: group.topic,
    slug: group.slug,
    publisher: group.publisher,
    sectionHints: group.sectionHints ?? [],
    items: group.items.map((item) => ({
      title: item.title,
      description: item.description,
      link: item.link,
      pubDate: item.pubDate.toISOString(),
      source: item.source,
      publisher: item.publisher,
      topic: item.topic,
      slug: item.slug,
      sectionHints: item.sectionHints ?? [],
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
    })),
  }));

  const articlesSummary = computeArticlesSummary(serializedTopics);

  return {
    topics,
    serializedTopics,
    allNews,
    articlesSummary,
  };
}

const extractText = (
  value: string[] | string | undefined
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return value?.trim();
};

const extractImageUrl = (
  item: RSSItem & Record<string, unknown>
): string | undefined => {
  const mediaContent = item["media:content"];
  if (Array.isArray(mediaContent)) {
    const mediaWithUrl = mediaContent.find(
      (media) => media?.$?.url || media?.url
    );
    if (mediaWithUrl) {
      return mediaWithUrl.$?.url ?? mediaWithUrl.url;
    }
  }

  const mediaThumbnail = item["media:thumbnail"];
  if (Array.isArray(mediaThumbnail)) {
    const thumbnailWithUrl = mediaThumbnail.find(
      (thumb) => thumb?.$?.url || thumb?.url
    );
    if (thumbnailWithUrl) {
      return thumbnailWithUrl.$?.url ?? thumbnailWithUrl.url;
    }
  }

  const enclosure = item.enclosure;
  if (Array.isArray(enclosure)) {
    const enclosureWithUrl = enclosure.find(
      (value) => value?.$?.url || value?.url
    );
    if (enclosureWithUrl) {
      return enclosureWithUrl.$?.url ?? enclosureWithUrl.url;
    }
  }

  const description = extractText(item.description);
  if (description) {
    const imageMatch = description.match(/<img[^>]+src="([^"]+)"/i);
    if (imageMatch) {
      return imageMatch[1];
    }
  }

  return undefined;
};
