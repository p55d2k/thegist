// News collection pipeline: RSS fetching and job-level persistence.
//
// Shared by the /api/news route (for manual/debug use) and the single
// worker script, which drives the whole pipeline in-process.

import axios from "axios";
import { parseStringPromise } from "xml2js";

import { links } from "@/constants/links";
import {
  getActiveSubscribers,
  createNewsletterJobFromNews,
  findActiveNewsCollectionJob,
  appendNewsBatchToJob,
  NewsJobCursorConflictError,
  type SerializedTopicNewsGroup,
  type NewsletterJob,
} from "@/lib/firestore";
import {
  DEFAULT_LIMITS,
  ONE_DAY_MS,
  USER_AGENT,
} from "@/constants/config";
import { computeArticlesSummary } from "@/lib/news-helpers";

export async function startNewsletterJob(): Promise<{
  sendId: string;
  totalRecipients: number;
  resumed: boolean;
}> {
  // Resume any active collection job instead of starting a second one. The
  // single worker is the only writer, so an existing active job means a
  // previously interrupted run that should be picked up.
  const activeJob = await findActiveNewsCollectionJob();
  if (activeJob) {
    return {
      sendId: activeJob.id,
      totalRecipients: activeJob.job.totalRecipients,
      resumed: true,
    };
  }

  // Get subscribers and create initial empty job
  const recipients = await getActiveSubscribers();
  if (recipients.length === 0) {
    throw new Error("No subscribers found");
  }

  const job = await createNewsletterJobFromNews({
    topics: [],
    articlesSummary: {
      totalArticles: 0,
      totalTopics: 0,
      totalPublishers: 0,
    },
    recipients,
    batchSize: DEFAULT_LIMITS.batchSize,
    status: "news-collecting",
    newsCursor: 0,
    sourcesTotal: 0, // Will be set by first news call
  });

  return {
    sendId: job.id,
    totalRecipients: recipients.length,
    resumed: false,
  };
}

type FetchNewsResult = {
  topics: TopicNewsGroup[];
  serializedTopics: SerializedTopicNewsGroup[];
  allNews: ProcessedNewsItem[];
  articlesSummary: ReturnType<typeof computeArticlesSummary>;
};

export async function fetchNewsForLinks(
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

/**
 * Fetch all remaining news batches for the active job until it reaches
 * `news-ready`. Reused by the single worker; refuses to run while another
 * active job is mid-collection.
 */
export async function collectNewsForJob(
  options: {
    sourcesPerRun?: number;
    maxAgeDays?: number;
  } = {}
): Promise<{
  sendId: string;
  status: NewsletterJob["status"];
  totalArticles: number;
  sourcesProcessed: number;
}> {
  const sourcesPerRun = options.sourcesPerRun ?? DEFAULT_LIMITS.newsSourcesPerRun;
  const maxAgeDays = options.maxAgeDays ?? 7;
  const since = new Date(Date.now() - maxAgeDays * ONE_DAY_MS);
  const totalSources = links.length;

  const active = await findActiveNewsCollectionJob();
  if (!active) {
    throw new Error(
      "No active newsletter job found. Start a job first."
    );
  }

  let sendId = active.id;
  let status = active.job.status;
  let currentCursor = active.job.newsCursor ?? 0;
  let sourcesTotal = Math.max(totalSources, active.job.sourcesTotal ?? 0);
  let totalArticles = active.job.articlesSummary?.totalArticles ?? 0;

  if (status === "news-ready" || currentCursor >= sourcesTotal) {
    return { sendId, status: "news-ready", totalArticles, sourcesProcessed: sourcesTotal };
  }

  while (currentCursor < sourcesTotal) {
    const slice = links.slice(
      currentCursor,
      Math.min(sourcesTotal, currentCursor + sourcesPerRun)
    );
    if (slice.length === 0) {
      break;
    }

    const newsResult = await fetchNewsForLinks(slice, since);

    try {
      const appendResult = await appendNewsBatchToJob({
        id: sendId,
        expectedCursor: currentCursor,
        newTopics: newsResult.serializedTopics,
        cursorIncrement: slice.length,
        totalSources: sourcesTotal,
        incomingArticlesSummary: newsResult.articlesSummary,
        incomingAppendedArticles: newsResult.allNews.length,
      });

      currentCursor = appendResult.newsCursor;
      sourcesTotal = appendResult.sourcesTotal;
      status = appendResult.status;
      totalArticles = appendResult.articlesSummary.totalArticles;
    } catch (error) {
      if (error instanceof NewsJobCursorConflictError) {
        // Another worker advanced the job in the meantime; re-sync and continue.
        const refreshed = await findActiveNewsCollectionJob();
        if (!refreshed) {
          throw new Error("Active news collection job disappeared");
        }
        sendId = refreshed.id;
        currentCursor = refreshed.job.newsCursor ?? 0;
        sourcesTotal = Math.max(sourcesTotal, refreshed.job.sourcesTotal ?? 0);
        status = refreshed.job.status;
        totalArticles = refreshed.job.articlesSummary?.totalArticles ?? 0;
        if (status === "news-ready") {
          break;
        }
        continue;
      }
      throw error;
    }

    if (status === "news-ready") {
      break;
    }
  }

  if (status !== "news-ready") {
    throw new Error(
      `News collection did not complete (status: ${status}, cursor ${currentCursor}/${sourcesTotal})`
    );
  }

  return { sendId, status, totalArticles, sourcesProcessed: sourcesTotal };
}

export const extractText = (
  value: string[] | string | undefined
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return value?.trim();
};

export const extractImageUrl = (
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