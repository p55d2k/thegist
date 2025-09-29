import axios from "axios";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { parseStringPromise } from "xml2js";

import { links } from "@/constants/links";

export async function GET(req: NextRequest) {
  revalidatePath("/api/news");

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

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
            headers: { "User-Agent": "Mozilla/5.0" },
          });
          const result = await parseStringPromise(response.data);

          const channel = result.rss?.channel?.[0];
          const channelTitle = channel?.title?.[0] || `${publisher} ${topic}`;
          const items = (channel?.item ?? []) as (RSSItem &
            Record<string, unknown>)[];

          const seenLinks = new Set<string>();
          const processed: ProcessedNewsItem[] = [];

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

  const response = NextResponse.json(
    {
      message: `Retrieved ${allNews.length} commentary items across ${topics.length} topic feeds`,
      count: allNews.length,
      topics,
      news: allNews,
    },
    { status: 200 }
  );

  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Surrogate-Control", "no-store");

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
