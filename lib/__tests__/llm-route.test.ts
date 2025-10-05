import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/llm/route";
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

vi.mock("@/lib/firebase", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => {
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

  const toPathKey = (segments: string[]): string => segments.join("/");

  const mirrorAiPartialToParent = (ref: any, value: any | undefined) => {
    if (!ref.parentDocPath || !ref.meta?.isAiPartial) {
      return;
    }

    const parentDoc = firestoreDocStore.get(ref.parentDocPath) ?? {};
    const nextAiPartial = { ...(parentDoc.aiPartial ?? {}) };

    if (value === undefined) {
      delete nextAiPartial[ref.id];
    } else {
      nextAiPartial[ref.id] = value;
    }

    parentDoc.aiPartial = nextAiPartial;
    firestoreDocStore.set(ref.parentDocPath, parentDoc);
  };

  return {
    doc: (_db: unknown, ...segments: string[]) => {
      if (segments.length < 2 || segments.length % 2 !== 0) {
        throw new Error("Invalid Firestore document path segments");
      }

      const path = toPathKey(segments);
      const collection = segments[segments.length - 2];
      const id = segments[segments.length - 1];
      const parentDocSegments = segments.slice(0, -2);
      const parentDocPath = parentDocSegments.length
        ? toPathKey(parentDocSegments)
        : undefined;

      return {
        path,
        collection,
        id,
        parentDocPath,
        meta: {
          isAiPartial:
            segments.length >= 4 &&
            segments[segments.length - 2] === "aiPartial",
        },
      };
    },
    runTransaction: vi.fn(async (_db, updater) => {
      const transaction = {
        async get(ref: { path: string }) {
          const data = firestoreDocStore.get(ref.path);
          return {
            exists: () => data !== undefined,
            data: () => data,
          };
        },
        set(
          ref: { path: string; parentDocPath?: string; meta?: any; id: string },
          value: any,
          options?: { merge?: boolean }
        ) {
          if (options?.merge) {
            const current = firestoreDocStore.get(ref.path) ?? {};
            const merged = deepMerge(current, value);
            firestoreDocStore.set(ref.path, merged);
            mirrorAiPartialToParent(ref, merged);
          } else {
            firestoreDocStore.set(ref.path, value);
            mirrorAiPartialToParent(ref, value);
          }
        },
        delete(ref: {
          path: string;
          parentDocPath?: string;
          meta?: any;
          id: string;
        }) {
          firestoreDocStore.delete(ref.path);
          mirrorAiPartialToParent(ref, undefined);
        },
      };

      return updater(transaction);
    }),
  };
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

const toRequest = (url: string, body?: Record<string, unknown>) =>
  new NextRequest(url, {
    method: "POST",
    headers: body
      ? new Headers({ "content-type": "application/json" })
      : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

const resetJobState = () => {
  jobState.store.clear();
  jobState.nextJob = null;
};

const resetFirestoreState = () => {
  firestoreDocStore.clear();
};

describe("/api/llm route", () => {
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
    delete process.env.NEWSLETTER_JOB_TOKEN;
  });

  it("returns 400 for invalid topic", async () => {
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
    jobState.nextJob = { id: job.id, job };
    firestoreDocStore.set("emailSends/job-1", { id: job.id });

    const response = await POST(
      toRequest("http://localhost/api/llm?topic=invalid", {
        sendId: "job-1",
      })
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toMatch(/invalid topic/i);
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
    jobState.nextJob = { id: job.id, job };
    firestoreDocStore.set("emailSends/job-1", { id: job.id });

    mockedGenerateNewsletterPlan.mockResolvedValue({
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
              slug: itemSlug,
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
            slug: itemSlug,
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
      },
      metadata: {
        model: "test-model",
        usedFallback: false,
      },
    });

    const response = await POST(
      toRequest("http://localhost/api/llm?topic=commentaries", {
        sendId: "job-1",
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.message).toBe("Topic processed");
    expect(payload.topic).toBe("commentaries");
    expect(payload.articlesUsed).toBe(1);
    expect(payload.candidatesFetched).toBe(1);

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

  it("processes one topic incrementally when no topic specified", async () => {
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
    jobState.nextJob = { id: job.id, job };
    firestoreDocStore.set("emailSends/job-1", { id: job.id });

    mockedGenerateNewsletterPlan.mockResolvedValue({
      plan: {
        essentialReads: {
          overview: "Overview",
          highlights: [],
        },
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
        summary: "Commentaries summary",
      },
      metadata: {
        model: "test-model",
        usedFallback: false,
      },
    });

    const response = await POST(
      toRequest("http://localhost/api/llm", {
        sendId: "job-1",
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.message).toBe("Topic processed");
    expect(payload.topic).toBe("commentaries");
    expect(payload.articlesUsed).toBe(1);
    expect(payload.candidatesFetched).toBe(1);
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
