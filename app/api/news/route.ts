import axios from "axios";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { parseStringPromise } from "xml2js";

import { links } from "@/constants/links";
import {
  getActiveSubscribers,
  createNewsletterJobFromNews,
  type SerializedTopicNewsGroup,
} from "@/lib/firestore";
import {
  DEFAULT_LIMITS,
  ONE_DAY_MS,
  CACHE_HEADERS,
  USER_AGENT,
} from "@/constants/config";

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
  const batchSize = Number.isFinite(Number(batchSizeParam))
    ? Math.max(1, Number.parseInt(batchSizeParam ?? "50", 10))
    : DEFAULT_LIMITS.batchSize;

  const twentyFourHoursAgo = new Date(Date.now() - ONE_DAY_MS);

  const groupedResults = await Promise.all(
    links.map(
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
            if (
              Number.isNaN(pubDate.getTime()) ||
              pubDate < twentyFourHoursAgo
            ) {
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

          // Limit to most recent articles per feed to reduce processing load
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

  const seenGlobal = new Set<string>();
  const topics: TopicNewsGroup[] = [];

  for (const group of groupedResults) {
    if (!group) {
      continue;
    }

    const uniqueItems = group.items.filter((item) => {
      if (seenGlobal.has(item.link)) {
        return false;
      }
      seenGlobal.add(item.link);
      return true;
    });

    if (uniqueItems.length === 0) {
      continue;
    }

    topics.push({
      ...group,
      items: uniqueItems,
    });
  }

  topics.sort((a, b) => {
    const publisherCompare = a.publisher.localeCompare(b.publisher);
    if (publisherCompare !== 0) {
      return publisherCompare;
    }
    return a.topic.localeCompare(b.topic);
  });

  const allNews = topics.flatMap((group) => group.items);

  let persistenceInfo: Record<string, unknown> | undefined;

  if (persist) {
    const recipients = await getActiveSubscribers();

    const serializedTopics: SerializedTopicNewsGroup[] = topics.map(
      (group) => ({
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
      })
    );

    const articlesSummary = {
      totalArticles: allNews.length,
      totalTopics: topics.length,
      totalPublishers: new Set(topics.map((group) => group.publisher)).size,
    };

    const job = await createNewsletterJobFromNews({
      topics: serializedTopics,
      articlesSummary,
      recipients,
      batchSize,
    });

    persistenceInfo = {
      persisted: true,
      sendId: job.id,
      totalRecipients: recipients.length,
      pendingRecipients: job.pendingRecipientsCount ?? recipients.length,
      batchSize,
      jobStatus: job.status,
    };
  }

  // If this request is persisting the job (cron), avoid returning the
  // full `topics` and `news` payload to keep the response small. For
  // manual/debug calls (persist=false) return the full data.
  const basePayload: Record<string, unknown> = {
    message: `Retrieved ${allNews.length} items across ${topics.length} topic feeds`,
    count: allNews.length,
    ...(persistenceInfo ?? {}),
  };

  const fullPayload = {
    ...basePayload,
    topics,
    news: allNews,
  };

  const response = NextResponse.json(persist ? basePayload : fullPayload, {
    status: 200,
  });

  response.headers.set("Cache-Control", CACHE_HEADERS["Cache-Control"]);
  response.headers.set("Pragma", CACHE_HEADERS.Pragma);
  response.headers.set("Expires", CACHE_HEADERS.Expires);
  response.headers.set("Surrogate-Control", CACHE_HEADERS["Surrogate-Control"]);

  return response;
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
    const imageMatch = description.match(/<img[^>]+src=\"([^\"]+)\"/i);
    if (imageMatch) {
      return imageMatch[1];
    }
  }

  return undefined;
};
