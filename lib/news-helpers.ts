import type { SerializedTopicNewsGroup } from "@/lib/firestore";

export type ArticlesSummary = {
  totalArticles: number;
  totalTopics: number;
  totalPublishers: number;
};

const sortTopics = (
  topics: SerializedTopicNewsGroup[]
): SerializedTopicNewsGroup[] => {
  return [...topics].sort((a, b) => {
    const publisherCompare = a.publisher.localeCompare(b.publisher);
    if (publisherCompare !== 0) {
      return publisherCompare;
    }
    return a.topic.localeCompare(b.topic);
  });
};

const sortItemsByRecency = (
  items: SerializedTopicNewsGroup["items"]
): SerializedTopicNewsGroup["items"] => {
  return [...items].sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );
};

export const computeArticlesSummary = (
  topics: SerializedTopicNewsGroup[]
): ArticlesSummary => {
  const totalArticles = topics.reduce(
    (sum, group) => sum + group.items.length,
    0
  );
  const totalTopics = topics.length;
  const totalPublishers = new Set(topics.map((group) => group.publisher)).size;

  return {
    totalArticles,
    totalTopics,
    totalPublishers,
  };
};

export const mergeSerializedTopics = (
  existingTopics: SerializedTopicNewsGroup[] | undefined,
  appendedTopics: SerializedTopicNewsGroup[]
): {
  topics: SerializedTopicNewsGroup[];
  appendedArticles: number;
} => {
  const topicsBySlug = new Map<string, SerializedTopicNewsGroup>();
  const seenLinks = new Set<string>();

  const normalizedExisting = existingTopics ?? [];
  for (const group of normalizedExisting) {
    const dedupedItems = Array.from(
      new Map(group.items.map((item) => [item.link, item])).values()
    );
    const sortedItems = sortItemsByRecency(dedupedItems);
    topicsBySlug.set(group.slug, {
      ...group,
      items: sortedItems,
    });
    for (const item of sortedItems) {
      seenLinks.add(item.link);
    }
  }

  let appendedArticles = 0;

  for (const group of appendedTopics) {
    const dedupedItems = group.items.filter((item) => {
      if (seenLinks.has(item.link)) {
        return false;
      }
      seenLinks.add(item.link);
      return true;
    });

    if (dedupedItems.length === 0) {
      continue;
    }

    const sortedItems = sortItemsByRecency(dedupedItems);
    const existingGroup = topicsBySlug.get(group.slug);

    if (existingGroup) {
      existingGroup.items = sortItemsByRecency([
        ...existingGroup.items,
        ...sortedItems,
      ]);
    } else {
      topicsBySlug.set(group.slug, {
        ...group,
        items: sortedItems,
      });
    }

    appendedArticles += sortedItems.length;
  }

  const combinedTopics = sortTopics(Array.from(topicsBySlug.values()));

  return {
    topics: combinedTopics,
    appendedArticles,
  };
};
