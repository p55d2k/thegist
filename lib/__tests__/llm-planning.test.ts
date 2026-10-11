import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  processTopicWithLLM,
  runLLMPlanningStep,
} from "@/lib/llm-planning";
import {
  getNewsletterJob,
  getNextNewsletterJobNeedingLLM,
  saveNewsletterPlanStage,
} from "@/lib/firestore";
import { generateNewsletterPlan } from "@/lib/llm";

const jobState = {
  store: new Map<string, any>(),
  nextJob: null as { id: string; job: any } | null,
};

const firestoreDocStore = new Map<string, any>();

vi.mock("@/lib/llm", () => ({
  generateNewsletterPlan: vi.fn(),
}));

vi.mock("@/lib/firebase", () => {
  const deepMerge = (target: any, source: any): any => {
    const output: Record<string, any> = { ...target };
    for (const [key, value] of Object.entries(source)) {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof output[key] === "object" &&
        output[key] !== null
      ) {
        output[key] = deepMerge(output[key], value);
      } else {
        output[key] = value;
      }
    }
    return output;
  };

  const mirrorAiPartialToParent = (refPath: string, value: any) => {
    const segments = refPath.split("/");
    if (segments.length < 4) {
      return;
    }
    if (segments[segments.length - 2] !== "aiPartial") {
      return;
    }
    const parentDocPath = segments.slice(0, -2).join("/");
    const topicId = segments[segments.length - 1];
    const parentDoc = firestoreDocStore.get(parentDocPath) ?? {};
    const nextAiPartial = { ...(parentDoc.aiPartial ?? {}) };
    if (value === undefined) {
      delete nextAiPartial[topicId];
    } else {
      nextAiPartial[topicId] = value;
    }
    firestoreDocStore.set(parentDocPath, {
      ...parentDoc,
      aiPartial: nextAiPartial,
    });
  };

  const makeRef = (path: string) => ({
    path,
    collection: (name: string) => ({
      doc: (id: string) => makeRef(`${path}/${name}/${id}`),
    }),
  });

  const db = {
    collection: (name: string) => ({
      doc: (id: string) => makeRef(`${name}/${id}`),
    }),
    runTransaction: vi.fn(async (updater: (transaction: any) => Promise<any>) => {
      const transaction = {
        async get(ref: { path: string }) {
          const data = firestoreDocStore.get(ref.path);
          return {
            exists: data !== undefined,
            data: () => data,
          };
        },
        set(
          ref: { path: string },
          value: any,
          options?: { merge?: boolean }
        ) {
          const current = firestoreDocStore.get(ref.path);
          const stored =
            options?.merge && current
              ? deepMerge(current, value)
              : value;
          firestoreDocStore.set(ref.path, stored);
          mirrorAiPartialToParent(ref.path, stored);
        },
        delete(ref: { path: string }) {
          firestoreDocStore.delete(ref.path);
          mirrorAiPartialToParent(ref.path, undefined);
        },
      };

      return updater(transaction);
    }),
  };

  return { db };
});

vi.mock("@/lib/firestore", () => ({
  getNewsletterJob: vi.fn(),
  getNextNewsletterJobNeedingLLM: vi.fn(),
  saveNewsletterPlanStage: vi.fn(),
}));

const mockedGenerateNewsletterPlan = vi.mocked(generateNewsletterPlan);
const mockedGetNewsletterJob = vi.mocked(getNewsletterJob);
const mockedGetNextNewsletterJobNeedingLLM = vi.mocked(
  getNextNewsletterJobNeedingLLM
);
const mockedSaveNewsletterPlanStage = vi.mocked(saveNewsletterPlanStage);

const buildSerializedGroup = (topic: string, slug: string, items: any[]) => ({
  topic,
  slug,
  publisher: "Publisher",
  sectionHints: [topic],
  items,
});

const buildSerializedItem = (
  slug: string,
  link: string,
  overrides: Record<string, unknown> = {}
) => ({
  title: `${slug}-title`,
  description: `${slug}-description`,
  link,
  pubDate: new Date().toISOString(),
  source: "Source",
  publisher: "Publisher",
  topic: slug,
  slug,
  sectionHints: [slug],
  ...overrides,
});

const resetJobState = () => {
  jobState.store.clear();
  jobState.nextJob = null;
};

const resetFirestoreState = () => {
  firestoreDocStore.clear();
};

const planFixture = (
  sections: Partial<LLMNewsletterPlan> = {}
): { plan: LLMNewsletterPlan; metadata: { model: string; usedFallback: boolean } } => ({
  plan: {
    essentialReads: {
      overview: "Overview",
      highlights: [
        {
          title: "Highlight",
          summary: "Summary",
          link: "https://example.com/a1",
          publisher: "Publisher",
          topic: "commentaries",
          slug: "commentaries-article",
          source: "Source",
          pubDate: new Date().toISOString(),
          sectionHints: ["commentaries"],
        },
      ],
    },
    commentaries: [
      {
        title: "Highlight",
        summary: "Summary",
        link: "https://example.com/a1",
        publisher: "Publisher",
        topic: "commentaries",
        slug: "commentaries-article",
        source: "Source",
        pubDate: new Date().toISOString(),
        sectionHints: ["commentaries"],
      },
    ],
    international: [],
    politics: [],
    business: [],
    tech: [],
    sport: [],
    culture: [],
    wildCard: [],
    entertainment: [],
    science: [],
    lifestyle: [],
    summary: "Plan summary",
    ...sections,
  },
  metadata: {
    model: "test-model",
    usedFallback: false,
  },
});

describe("lib/llm-planning", () => {
  beforeEach(() => {
    resetJobState();
    resetFirestoreState();
    mockedGenerateNewsletterPlan.mockReset();
    mockedGetNewsletterJob.mockImplementation((id: string) =>
      Promise.resolve(jobState.store.get(id) ?? null)
    );
    mockedGetNextNewsletterJobNeedingLLM.mockImplementation(() =>
      Promise.resolve(jobState.nextJob)
    );
    mockedSaveNewsletterPlanStage.mockResolvedValue();
  });

  it("rejects with a 400 error for an invalid topic", async () => {
    const job = {
      id: "job-1",
      status: "news-ready",
      topics: [
        buildSerializedGroup("commentaries", "commentaries", [
          buildSerializedItem("commentaries-1", "https://example.com/a1", {
            sectionHints: ["commentaries"],
          }),
        ]),
      ],
    };

    jobState.store.set(job.id, job);
    firestoreDocStore.set("emailSends/job-1", { id: job.id });

    await expect(
      processTopicWithLLM({ sendId: "job-1", topic: "invalid" })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("processes a topic and stores a partial result", async () => {
    const itemSlug = "commentaries-article";
    const job = {
      id: "job-1",
      status: "news-ready",
      topics: [
        buildSerializedGroup("commentaries", "commentaries", [
          buildSerializedItem(itemSlug, "https://example.com/a1", {
            sectionHints: ["commentaries"],
          }),
        ]),
      ],
    };

    jobState.store.set(job.id, job);
    firestoreDocStore.set("emailSends/job-1", { id: job.id });

    mockedGenerateNewsletterPlan.mockResolvedValue(planFixture());

    const result = await processTopicWithLLM({
      sendId: "job-1",
      topic: "commentaries",
    });

    expect(result.message).toBe("Topic processed");
    expect(result.topic).toBe("commentaries");
    expect(result.articlesUsed).toBe(1);
    expect(result.candidatesFetched).toBe(1);

    const stored = firestoreDocStore.get("emailSends/job-1");
    expect(stored).toBeDefined();
    expect(stored.aiPartial.commentaries.section).toHaveLength(1);
    // Verify compact storage: only essential fields stored
    expect(stored.aiPartial.commentaries.section[0]).toEqual({
      title: "Highlight",
      link: "https://example.com/a1",
      slug: itemSlug,
      pubDate: expect.any(String),
      publisher: "Publisher",
    });
  });

  it("processes one topic incrementally when none is specified", async () => {
    const firstSlug = "commentaries-article";
    const secondSlug = "business-article";
    const job = {
      id: "job-1",
      status: "news-ready",
      topics: [
        buildSerializedGroup("commentaries", "commentaries", [
          buildSerializedItem(firstSlug, "https://example.com/a1", {
            sectionHints: ["commentaries"],
          }),
        ]),
        buildSerializedGroup("business", "business", [
          buildSerializedItem(secondSlug, "https://example.com/b1", {
            sectionHints: ["business"],
          }),
        ]),
      ],
    };

    jobState.store.set(job.id, job);
    firestoreDocStore.set("emailSends/job-1", { id: job.id });

    mockedGenerateNewsletterPlan.mockResolvedValue(
      planFixture({
        commentaries: [
          {
            title: "Commentary",
            summary: "Summary",
            link: "https://example.com/a1",
            publisher: "Publisher",
            topic: "commentaries",
            slug: firstSlug,
            source: "Source",
            pubDate: new Date().toISOString(),
            sectionHints: ["commentaries"],
          },
        ],
        summary: "Commentaries summary",
      })
    );

    const result = await runLLMPlanningStep("job-1");

    expect(result.step).toBe("topic");
    expect(result.message).toBe("Topic processed");
    if (result.step === "topic") {
      expect(result.topic).toBe("commentaries");
      expect(result.articlesUsed).toBe(1);
      expect(result.candidatesFetched).toBe(1);
    }
    expect(mockedGenerateNewsletterPlan).toHaveBeenCalledTimes(1);
    const stored = firestoreDocStore.get("emailSends/job-1");
    expect(stored).toBeDefined();
    expect(stored.aiPartial.commentaries.section).toHaveLength(1);
    // Verify compact storage: only essential fields stored
    expect(stored.aiPartial.commentaries.section[0]).toEqual({
      title: "Commentary",
      link: "https://example.com/a1",
      slug: firstSlug,
      pubDate: expect.any(String),
      publisher: "Publisher",
    });
    expect(stored.aiPartial.business).toBeUndefined();
  });
});