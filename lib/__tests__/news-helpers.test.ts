import { describe, it, expect } from "vitest";

import {
  computeArticlesSummary,
  mergeSerializedTopics,
} from "@/lib/news-helpers";
import type { SerializedTopicNewsGroup } from "@/lib/firestore";

describe("news helpers", () => {
  const baseTechGroup: SerializedTopicNewsGroup = {
    topic: "Tech",
    slug: "tech",
    publisher: "Alpha News",
    sectionHints: [],
    items: [
      {
        title: "Existing Story",
        description: "Existing description",
        link: "https://example.com/tech-1",
        pubDate: "2024-10-01T08:00:00.000Z",
        source: "Alpha News Tech",
        publisher: "Alpha News",
        topic: "Tech",
        slug: "tech",
        sectionHints: [],
      },
    ],
  };

  const appendedTopics: SerializedTopicNewsGroup[] = [
    {
      topic: "Tech",
      slug: "tech",
      publisher: "Alpha News",
      sectionHints: [],
      items: [
        {
          title: "Duplicate Story",
          description: "Should be deduplicated",
          link: "https://example.com/tech-1",
          pubDate: "2024-10-01T09:00:00.000Z",
          source: "Alpha News Tech",
          publisher: "Alpha News",
          topic: "Tech",
          slug: "tech",
          sectionHints: [],
        },
        {
          title: "Fresh Story",
          description: "New item for tech",
          link: "https://example.com/tech-2",
          pubDate: "2024-10-02T07:30:00.000Z",
          source: "Alpha News Tech",
          publisher: "Alpha News",
          topic: "Tech",
          slug: "tech",
          sectionHints: [],
        },
      ],
    },
    {
      topic: "Business",
      slug: "business",
      publisher: "Beta News",
      sectionHints: [],
      items: [
        {
          title: "Markets Update",
          description: "Business coverage",
          link: "https://example.com/business-1",
          pubDate: "2024-10-02T06:00:00.000Z",
          source: "Beta Markets",
          publisher: "Beta News",
          topic: "Business",
          slug: "business",
          sectionHints: [],
        },
      ],
    },
  ];

  it("merges and deduplicates serialized topics", () => {
    const { topics, appendedArticles } = mergeSerializedTopics(
      [baseTechGroup],
      appendedTopics
    );

    expect(appendedArticles).toBe(2);
    expect(topics).toHaveLength(2);

    const techGroup = topics.find((group) => group.slug === "tech");
    expect(techGroup).toBeDefined();
    expect(techGroup?.items).toHaveLength(2);
    expect(techGroup?.items[0].link).toBe("https://example.com/tech-2");
    expect(techGroup?.items[1].link).toBe("https://example.com/tech-1");

    const businessGroup = topics.find((group) => group.slug === "business");
    expect(businessGroup).toBeDefined();
    expect(businessGroup?.items).toHaveLength(1);
  });

  it("computes article summaries", () => {
    const { topics } = mergeSerializedTopics([baseTechGroup], appendedTopics);
    const summary = computeArticlesSummary(topics);

    expect(summary.totalArticles).toBe(3);
    expect(summary.totalTopics).toBe(2);
    expect(summary.totalPublishers).toBe(2);
  });
});
