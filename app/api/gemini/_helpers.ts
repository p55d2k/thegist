// FOCUS: implement the task exactly as described. Do not add unrelated features or extra abstraction layers.
// MODIFY ONLY: edit `app/api/gemini/route.ts`, add `app/api/gemini/_helpers.ts`, and update `lib/gemini.ts` only if strictly necessary. Keep other files unchanged unless required for small helpers.
// IDEMPOTENT: ensure partial topic processing is safe to re-run and avoids duplicating stored data unless `force=true`.
// RETURN SHAPE: Follow the specified JSON response format for success and errors.

import {
  SECTION_LIMITS,
  SECTION_HINT_MAP,
  SECTION_TOKEN_MAP,
} from "@/constants/gemini";
import {
  getNewsletterJob,
  getNextNewsletterJobNeedingGemini,
  type NewsletterJob,
  type SerializedTopicNewsGroup,
} from "@/lib/firestore";
import { generateNewsletterPlan } from "@/lib/gemini";
import { db } from "@/lib/firebase";
import { doc, runTransaction } from "firebase/firestore";

const SEND_COLLECTION = "emailSends";
const DEFAULT_EXTRA_CANDIDATES = 5;

export type GeminiTopicKey = keyof Omit<
  GeminiNewsletterPlan,
  "essentialReads" | "summary"
>;

const ALLOWED_TOPICS = Object.keys(SECTION_LIMITS) as GeminiTopicKey[];
const ALLOWED_TOPICS_MESSAGE = ALLOWED_TOPICS.join(", ");

const sanitizeToken = (raw: string): string =>
  raw.replace(/[^a-z]/gi, "").toLowerCase();

const tokenToTopic = new Map<string, GeminiTopicKey>();
for (const key of ALLOWED_TOPICS) {
  tokenToTopic.set(sanitizeToken(key), key);
}
for (const [token, mapped] of Object.entries(SECTION_TOKEN_MAP)) {
  tokenToTopic.set(token.toLowerCase(), mapped as GeminiTopicKey);
}

const hintToTopic = new Map<NewsletterSectionHint, GeminiTopicKey>();
for (const [topicKey, hint] of Object.entries(SECTION_HINT_MAP)) {
  hintToTopic.set(hint, topicKey as GeminiTopicKey);
}

export class GeminiTopicProcessingError extends Error {
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GeminiTopicProcessingError";
    this.status = status;
    this.details = details;
  }
}

class GeminiTopicAlreadyProcessedError extends Error {
  readonly existing: GeminiTopicPartialRecord;

  constructor(existing: GeminiTopicPartialRecord) {
    super("Topic already processed");
    this.name = "GeminiTopicAlreadyProcessedError";
    this.existing = existing;
  }
}

export type GeminiOverallRecord = {
  overview: string;
  summary: string;
  highlights: NewsletterSectionItem[];
  aiMetadata: {
    model: string;
    usedFallback: boolean;
    fallbackReason?: string;
  };
};

export type GeminiTopicPartialRecord = {
  topic: GeminiTopicKey;
  updatedAt: string;
  section: NewsletterSectionItem[];
  articlesUsed: number;
  candidatesFetched: number;
  aiMetadata: {
    model: string;
    usedFallback: boolean;
    fallbackReason?: string;
  };
  input: {
    limit: number;
    extra: number;
  };
};

export type GeminiJobContext = {
  id: string;
  job: NewsletterJob;
  topics: TopicNewsGroup[];
};

export const deserializeTopics = (
  serialized: SerializedTopicNewsGroup[]
): TopicNewsGroup[] =>
  serialized.map((group) => ({
    topic: group.topic,
    slug: group.slug,
    publisher: group.publisher,
    sectionHints: group.sectionHints ?? [],
    items: group.items
      .map((item) => ({
        title: item.title,
        description: item.description,
        link: item.link,
        pubDate: new Date(item.pubDate),
        source: item.source,
        publisher: item.publisher,
        topic: item.topic,
        slug: item.slug,
        imageUrl: item.imageUrl,
        sectionHints: item.sectionHints ?? [],
      }))
      .filter((item) => !Number.isNaN(item.pubDate.getTime())),
  }));

const normalizeTopicInput = (value: unknown): GeminiTopicKey | null => {
  if (typeof value !== "string") {
    return null;
  }
  const sanitized = sanitizeToken(value);
  if (!sanitized) {
    return null;
  }
  return tokenToTopic.get(sanitized) ?? null;
};

const resolveTopicForGroup = (group: TopicNewsGroup): GeminiTopicKey | null => {
  const direct = normalizeTopicInput(group.topic);
  if (direct) {
    return direct;
  }

  for (const hint of group.sectionHints ?? []) {
    const mapped = hintToTopic.get(hint);
    if (mapped) {
      return mapped;
    }
  }

  const slugMatch = normalizeTopicInput(group.slug);
  if (slugMatch) {
    return slugMatch;
  }

  return null;
};

const findTopicGroup = (
  topic: GeminiTopicKey,
  topics: TopicNewsGroup[]
): TopicNewsGroup | null => {
  for (const group of topics) {
    if (normalizeTopicInput(group.topic) === topic) {
      return group;
    }
  }

  for (const group of topics) {
    const hints = group.sectionHints ?? [];
    if (hints.some((hint) => hintToTopic.get(hint) === topic)) {
      return group;
    }
  }

  for (const group of topics) {
    if (normalizeTopicInput(group.slug) === topic) {
      return group;
    }
  }

  return null;
};

export const deriveProcessableTopics = (
  topics: TopicNewsGroup[]
): GeminiTopicKey[] => {
  const seen = new Set<GeminiTopicKey>();
  const ordered: GeminiTopicKey[] = [];

  for (const group of topics) {
    const topic = resolveTopicForGroup(group);
    if (!topic || seen.has(topic)) {
      continue;
    }
    seen.add(topic);
    ordered.push(topic);
  }

  return ordered;
};

export const getNextTopicToProcess = (
  job: NewsletterJob,
  topics: TopicNewsGroup[]
): GeminiTopicKey | null => {
  const processable = deriveProcessableTopics(topics);
  const partials = (job as any).aiPartial || {};
  for (const topic of processable) {
    if (!partials[topic]) {
      return topic;
    }
  }
  return null;
};

export const isAllTopicsProcessed = (
  job: NewsletterJob,
  topics: TopicNewsGroup[]
): boolean => {
  const processable = deriveProcessableTopics(topics);
  const partials = (job as any).aiPartial || {};
  return processable.every(topic => partials[topic]);
};

export const loadGeminiJobOrThrow = async (
  sendId?: string
): Promise<GeminiJobContext> => {
  if (sendId) {
    const job = await getNewsletterJob(sendId);
    if (!job) {
      throw new GeminiTopicProcessingError(
        404,
        `Newsletter job ${sendId} not found`
      );
    }
    if (!job.topics || job.topics.length === 0) {
      throw new GeminiTopicProcessingError(
        400,
        "Newsletter job is missing topics. Run /api/news?persist=true first."
      );
    }
    return { id: sendId, job, topics: deserializeTopics(job.topics) };
  }

  const nextJob = await getNextNewsletterJobNeedingGemini();
  if (!nextJob) {
    throw new GeminiTopicProcessingError(
      404,
      "No newsletter job needing Gemini available"
    );
  }
  const { id, job } = nextJob;
  if (!job.topics || job.topics.length === 0) {
    throw new GeminiTopicProcessingError(
      400,
      "Newsletter job is missing topics. Run /api/news?persist=true first."
    );
  }

  return { id, job, topics: deserializeTopics(job.topics) };
};

const getArticleKey = (article: ProcessedNewsItem): string =>
  article.slug ? `${article.slug}` : article.link;

const clampLimit = (value: unknown, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.floor(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(1, parsed);
    }
  }
  return fallback;
};

const clampExtra = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return DEFAULT_EXTRA_CANDIDATES;
};

const buildCandidateSet = (
  topicGroup: TopicNewsGroup,
  topicKey: GeminiTopicKey,
  topics: TopicNewsGroup[],
  limit: number,
  extra: number,
  usedKeys: Set<string>
): {
  primary: ProcessedNewsItem[];
  candidates: ProcessedNewsItem[];
  candidateKeys: Set<string>;
} => {
  const sortedPrimary = [...topicGroup.items].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
  );
  const primary = sortedPrimary.slice(0, Math.max(1, limit));

  const candidateOrder: ProcessedNewsItem[] = [];
  const candidateKeys = new Set<string>();

  const addCandidate = (item: ProcessedNewsItem) => {
    const key = getArticleKey(item);
    if (candidateKeys.has(key) || usedKeys.has(key)) {
      return;
    }
    candidateKeys.add(key);
    candidateOrder.push(item);
  };

  primary.forEach(addCandidate);

  if (extra > 0) {
    const extras = topics
      .filter((group) => group !== topicGroup)
      .flatMap((group) => group.items)
      .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

    let added = 0;
    for (const item of extras) {
      if (added >= extra) {
        break;
      }
      const key = getArticleKey(item);
      if (candidateKeys.has(key)) {
        continue;
      }
      addCandidate(item);
      added += 1;
    }
  }

  if (candidateOrder.length === 0) {
    throw new GeminiTopicProcessingError(
      400,
      `No articles available for topic ${topicKey}`
    );
  }

  return {
    primary,
    candidates: candidateOrder,
    candidateKeys,
  };
};

const persistGeminiTopicPartial = async (
  sendId: string,
  topic: GeminiTopicKey,
  record: GeminiTopicPartialRecord,
  force: boolean
): Promise<void> => {
  const ref = doc(db, SEND_COLLECTION, sendId);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new GeminiTopicProcessingError(
        404,
        `Newsletter job ${sendId} not found`
      );
    }

    const data = snapshot.data() as NewsletterJob & {
      aiPartial?: Record<string, GeminiTopicPartialRecord>;
    };
    const existing = data.aiPartial?.[topic];

    if (existing && !force) {
      throw new GeminiTopicAlreadyProcessedError(existing);
    }

    transaction.set(
      ref,
      {
        aiPartial: {
          [topic]: record,
        },
      },
      { merge: true }
    );
  });
};

export type ProcessGeminiTopicResult = {
  status: "processed" | "already-processed";
  message: string;
  sendId: string;
  topic: GeminiTopicKey;
  articlesUsed: number;
  candidatesFetched: number;
  overview?: string;
  summary?: string;
  highlights?: NewsletterSectionItem[];
  section?: NewsletterSectionItem[];
  aiMetadata?: {
    model: string;
    usedFallback: boolean;
    fallbackReason?: string;
  };
};

export const processGeminiTopic = async (params: {
  sendId?: string;
  topic: string;
  limit?: number | string;
  extra?: number | string;
  force?: boolean;
}): Promise<ProcessGeminiTopicResult> => {
  const normalizedTopic = normalizeTopicInput(params.topic);
  if (!normalizedTopic) {
    throw new GeminiTopicProcessingError(
      400,
      `Invalid topic. Allowed topics: ${ALLOWED_TOPICS_MESSAGE}`
    );
  }

  const limit = clampLimit(params.limit, SECTION_LIMITS[normalizedTopic]);
  const extra = clampExtra(params.extra);
  const force = Boolean(params.force);

  const {
    id: resolvedSendId,
    job,
    topics,
  } = await loadGeminiJobOrThrow(params.sendId);

  const jobWithPartial = job as NewsletterJob & {
    aiPartial?: Record<string, GeminiTopicPartialRecord | GeminiOverallRecord>;
  };
  const partials = jobWithPartial.aiPartial || {};
  let overall = partials.overall as GeminiOverallRecord | undefined;
  const existingPartial = partials[normalizedTopic] as GeminiTopicPartialRecord | undefined;

  if (existingPartial && !force) {
    return {
      status: "already-processed",
      message: "Topic already processed",
      sendId: resolvedSendId,
      topic: normalizedTopic,
      articlesUsed: existingPartial.articlesUsed,
      candidatesFetched: existingPartial.candidatesFetched,
      overview: overall?.overview,
      summary: overall?.summary,
      highlights: overall?.highlights,
      section: existingPartial.section,
      aiMetadata: overall?.aiMetadata || existingPartial.aiMetadata,
    };
  }

  const topicGroup = findTopicGroup(normalizedTopic, topics);
  if (!topicGroup) {
    throw new GeminiTopicProcessingError(
      400,
      `Topic ${normalizedTopic} is not available for this job`
    );
  }

  const usedKeys = new Set<string>();
  for (const [key, partial] of Object.entries(partials)) {
    if (key === 'overall') continue;
    const p = partial as GeminiTopicPartialRecord;
    for (const item of p.section) {
      usedKeys.add(item.slug ?? item.link);
    }
  }

  const { primary, candidates, candidateKeys } = buildCandidateSet(
    topicGroup,
    normalizedTopic,
    topics,
    limit,
    extra,
    usedKeys
  );

  const preClusterKey =
    normalizedTopic === "wildCard" ? "wildcard" : normalizedTopic;
  const preClustered = new Map<string, ProcessedNewsItem[]>([
    [preClusterKey, primary],
  ]);

  const planResult = await generateNewsletterPlan(candidates, preClustered, {
    topicKey: normalizedTopic,
  });

  const filterPlanItem = (item: NewsletterSectionItem): boolean =>
    candidateKeys.has(item.slug ?? item.link);

  const sectionItems = planResult.plan[normalizedTopic].filter(filterPlanItem);
  if (sectionItems.length === 0) {
    throw new GeminiTopicProcessingError(
      500,
      `Gemini returned no articles for topic ${normalizedTopic}`
    );
  }

  const hasOverall = !!overall;
  if (!hasOverall) {
    const ref = doc(db, SEND_COLLECTION, resolvedSendId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) {
        throw new GeminiTopicProcessingError(
          404,
          `Newsletter job ${resolvedSendId} not found`
        );
      }
      transaction.set(
        ref,
        {
          aiPartial: {
            overall: {
              overview: planResult.plan.essentialReads.overview,
              summary: planResult.plan.summary,
              highlights: planResult.plan.essentialReads.highlights,
              aiMetadata: planResult.metadata,
            } as GeminiOverallRecord,
          },
        },
        { merge: true }
      );
    });
    // Update local overall
    overall = {
      overview: planResult.plan.essentialReads.overview,
      summary: planResult.plan.summary,
      highlights: planResult.plan.essentialReads.highlights,
      aiMetadata: planResult.metadata,
    } as GeminiOverallRecord;
  }

  const record: GeminiTopicPartialRecord = {
    topic: normalizedTopic,
    updatedAt: new Date().toISOString(),
    section: sectionItems,
    articlesUsed: sectionItems.length,
    candidatesFetched: candidates.length,
    aiMetadata: planResult.metadata,
    input: {
      limit,
      extra,
    },
  };

  try {
    await persistGeminiTopicPartial(
      resolvedSendId,
      normalizedTopic,
      record,
      force
    );
  } catch (error) {
    if (error instanceof GeminiTopicAlreadyProcessedError) {
      return {
        status: "already-processed",
        message: "Topic already processed",
        sendId: resolvedSendId,
        topic: normalizedTopic,
        articlesUsed: error.existing.articlesUsed,
        candidatesFetched: error.existing.candidatesFetched,
        overview: overall?.overview,
        summary: overall?.summary,
        highlights: overall?.highlights,
        section: error.existing.section,
        aiMetadata: overall?.aiMetadata || error.existing.aiMetadata,
      };
    }
    if (error instanceof GeminiTopicProcessingError) {
      throw error;
    }
    throw error;
  }

  return {
    status: "processed",
    message: "Topic processed",
    sendId: resolvedSendId,
    topic: normalizedTopic,
    articlesUsed: record.articlesUsed,
    candidatesFetched: record.candidatesFetched,
    overview: overall?.overview,
    summary: overall?.summary,
    highlights: overall?.highlights,
    section: record.section,
    aiMetadata: overall?.aiMetadata || record.aiMetadata,
  };
};
