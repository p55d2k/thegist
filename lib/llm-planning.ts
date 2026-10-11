// LLM planning pipeline: per-topic plan generation, incremental progress
// tracking (aiPartial subcollection), deduplication, and finalization.
//
// Used by the single worker script, which drives the whole pipeline
// in-process.

import {
  SECTION_LIMITS,
  SECTION_HINT_MAP,
  SECTION_TOKEN_MAP,
} from "@/constants/llm";
import {
  getNewsletterJob,
  getNextNewsletterJobNeedingLLM,
  saveNewsletterPlanStage,
  type NewsletterJob,
  type SerializedTopicNewsGroup,
} from "@/lib/firestore";
import { generateNewsletterPlan, generateFinalOverview as generateLLMFinalOverview } from "@/lib/llm";
import { db } from "@/lib/firebase";
import { getDateString } from "@/lib/date";
import { EMAIL_CONFIG } from "@/constants/email";

const SEND_COLLECTION = "emailSends";
const DEFAULT_EXTRA_CANDIDATES = 5;

export type LLMTopicKey = keyof Omit<
  LLMNewsletterPlan,
  "essentialReads" | "summary"
>;

const ALLOWED_TOPICS = Object.keys(SECTION_LIMITS) as LLMTopicKey[];
const ALLOWED_TOPICS_MESSAGE = ALLOWED_TOPICS.join(", ");

const sanitizeToken = (raw: string): string =>
  raw.replace(/[^a-z]/gi, "").toLowerCase();

const tokenToTopic = new Map<string, LLMTopicKey>();
for (const key of ALLOWED_TOPICS) {
  tokenToTopic.set(sanitizeToken(key), key);
}
for (const [token, mapped] of Object.entries(SECTION_TOKEN_MAP)) {
  tokenToTopic.set(token.toLowerCase(), mapped as LLMTopicKey);
}

const hintToTopic = new Map<NewsletterSectionHint, LLMTopicKey>();
for (const [topicKey, hint] of Object.entries(SECTION_HINT_MAP)) {
  hintToTopic.set(hint, topicKey as LLMTopicKey);
}

export class LLMTopicProcessingError extends Error {
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "LLMTopicProcessingError";
    this.status = status;
    this.details = details;
  }
}

class LLMTopicAlreadyProcessedError extends Error {
  readonly existing: LLMTopicPartialRecord;

  constructor(existing: LLMTopicPartialRecord) {
    super("Topic already processed");
    this.name = "LLMTopicAlreadyProcessedError";
    this.existing = existing;
  }
}

export type LLMOverallRecord = {
  overview: string;
  summary: string;
  highlights: NewsletterSectionItem[];
  aiMetadata: {
    model: string;
    usedFallback: boolean;
    fallbackReason?: string;
  };
};

export type LLMTopicPartialRecord = {
  topic: LLMTopicKey;
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

export type LLMJobContext = {
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

const normalizeTopicInput = (value: unknown): LLMTopicKey | null => {
  if (typeof value !== "string") {
    return null;
  }
  const sanitized = sanitizeToken(value);
  if (!sanitized) {
    return null;
  }
  return tokenToTopic.get(sanitized) ?? null;
};

const resolveTopicForGroup = (group: TopicNewsGroup): LLMTopicKey | null => {
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
  topic: LLMTopicKey,
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
): LLMTopicKey[] => {
  const seen = new Set<LLMTopicKey>();
  const ordered: LLMTopicKey[] = [];

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
): LLMTopicKey | null => {
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
  return processable.every((topic) => partials[topic]);
};

export const loadLLMJobOrThrow = async (
  sendId?: string
): Promise<LLMJobContext> => {
  if (sendId) {
    const job = await getNewsletterJob(sendId);
    if (!job) {
      throw new LLMTopicProcessingError(
        404,
        `Newsletter job ${sendId} not found`
      );
    }
    if (!job.topics || job.topics.length === 0) {
      throw new LLMTopicProcessingError(
        400,
        "Newsletter job is missing topics. Run scripts/send-newsletter.ts to collect news first."
      );
    }
    return { id: sendId, job, topics: deserializeTopics(job.topics) };
  }

  const nextJob = await getNextNewsletterJobNeedingLLM();
  if (!nextJob) {
    throw new LLMTopicProcessingError(
      404,
      "No newsletter job needing LLM planning available"
    );
  }
  const { id, job } = nextJob;
  if (!job.topics || job.topics.length === 0) {
    throw new LLMTopicProcessingError(
      400,
      "Newsletter job is missing topics. Run scripts/send-newsletter.ts to collect news first."
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

const persistLLMTopicPartial = async (
  sendId: string,
  topic: LLMTopicKey,
  record: LLMTopicPartialRecord,
  force: boolean
): Promise<void> => {
  await db.runTransaction(async (transaction) => {
    const ref = db.collection(SEND_COLLECTION).doc(sendId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      throw new LLMTopicProcessingError(
        404,
        `Newsletter job ${sendId} not found`
      );
    }

    // Check if topic is already processed (for force=false)
    const partialRef = db
      .collection(SEND_COLLECTION)
      .doc(sendId)
      .collection("aiPartial")
      .doc(topic);
    const partialSnapshot = await transaction.get(partialRef);
    if (partialSnapshot.exists && !force) {
      const existing = partialSnapshot.data() as LLMTopicPartialRecord;
      throw new LLMTopicAlreadyProcessedError(existing);
    }

    // To avoid storing large article objects in the main emailSends document
    // (Firestore has a 1MiB document limit), persist a compact representation
    // of the selected articles for the topic. Keep only the smallest useful
    // fields that allow rehydration or display: title, link, slug, pubDate,
    // and publisher. This should drastically reduce stored size while
    // preserving necessary information for downstream steps.
    const compactSection = (record.section || []).map((item) => ({
      title: item.title,
      link: item.link,
      slug: item.slug,
      // pubDate may already be an ISO string in many code paths; support
      // both Date and string here.
      pubDate:
        typeof item.pubDate === "string"
          ? item.pubDate
          : item.pubDate && typeof (item as any).toISOString === "function"
          ? (item as any).toISOString()
          : undefined,
      publisher: item.publisher,
    }));

    const compactRecord: LLMTopicPartialRecord = {
      ...record,
      section: compactSection as unknown as NewsletterSectionItem[],
    };

    // Save to subcollection instead of main document
    transaction.set(partialRef, compactRecord);
  });
};

export type ProcessLLMTopicResult = {
  status: "processed" | "already-processed";
  message: string;
  sendId: string;
  topic: LLMTopicKey;
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

export const processTopicWithLLM = async (params: {
  sendId?: string;
  topic: string;
  limit?: number | string;
  extra?: number | string;
  force?: boolean;
}): Promise<ProcessLLMTopicResult> => {
  const normalizedTopic = normalizeTopicInput(params.topic);
  if (!normalizedTopic) {
    throw new LLMTopicProcessingError(
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
  } = await loadLLMJobOrThrow(params.sendId);

  const jobWithPartial = job as NewsletterJob & {
    aiPartial?: Record<string, LLMTopicPartialRecord | LLMOverallRecord>;
  };
  const partials = jobWithPartial.aiPartial || {};
  let overall = partials.overall as LLMOverallRecord | undefined;
  const existingPartial = partials[normalizedTopic] as
    | LLMTopicPartialRecord
    | undefined;

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
    throw new LLMTopicProcessingError(
      400,
      `Topic ${normalizedTopic} is not available for this job`
    );
  }

  const usedKeys = new Set<string>();
  const alreadySelectedTitles: string[] = [];
  for (const [key, partial] of Object.entries(partials)) {
    if (key === "overall") continue;
    const p = partial as LLMTopicPartialRecord;
    for (const item of p.section) {
      usedKeys.add(item.slug ?? item.link);
      alreadySelectedTitles.push(item.title);
    }
  }

  // Limit context to prevent timeouts - only send most recent 12 titles
  const limitedSelectedTitles = alreadySelectedTitles.slice(-12);

  // For topic processing, send ALL available articles with the correct hint
  // Don't limit or sample - let the LLM choose from the full dataset
  const allTopicArticles = topicGroup.items.filter((item) => {
    const key = getArticleKey(item);
    return !usedKeys.has(key);
  });

  if (allTopicArticles.length === 0) {
    throw new LLMTopicProcessingError(
      400,
      `No unused articles available for topic ${normalizedTopic}`
    );
  }

  const preClusterKey =
    normalizedTopic === "wildCard" ? "wildcard" : normalizedTopic;
  const preClustered = new Map<string, ProcessedNewsItem[]>([
    [preClusterKey, allTopicArticles],
  ]);

  let sectionItems: NewsletterSectionItem[];
  let planMetadata: {
    model: string;
    usedFallback: boolean;
    fallbackReason?: string;
  };

  if (normalizedTopic === "wildCard") {
    // For wildcard, just select the most recent strange news without using GPT
    // Filter to only articles tagged with wildcard/strange section hints
    const strangeArticles = allTopicArticles.filter((item) =>
      item.sectionHints?.some(
        (hint) =>
          hint.toLowerCase().includes("wildcard") ||
          hint.toLowerCase().includes("strange")
      )
    );
    const sortedArticles = strangeArticles.sort(
      (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
    );
    sectionItems = sortedArticles
      .slice(0, SECTION_LIMITS.wildCard)
      .map((item) => ({
        title: item.title,
        summary: item.description || "",
        link: item.link,
        publisher: item.publisher,
        topic: item.topic,
        slug: item.slug,
        source: item.source,
        pubDate: item.pubDate.toISOString(),
        sectionHints: item.sectionHints,
      }));
    planMetadata = {
      model: "fallback",
      usedFallback: true,
      fallbackReason: "Wildcard uses most recent strange articles without LLM",
    };
  } else {
    const planResult = await generateNewsletterPlan(
      allTopicArticles,
      preClustered,
      {
        topicKey: normalizedTopic,
        alreadySelectedTitles:
          limitedSelectedTitles.length > 0 ? limitedSelectedTitles : undefined,
      }
    );

    sectionItems = planResult.plan[normalizedTopic].slice(
      0,
      SECTION_LIMITS[normalizedTopic]
    ); // Take top N ranked articles based on section limits
    planMetadata = planResult.metadata;
  }

  if (sectionItems.length === 0) {
    throw new LLMTopicProcessingError(
      500,
      `No articles available for topic ${normalizedTopic}`
    );
  }

  const record: LLMTopicPartialRecord = {
    topic: normalizedTopic,
    updatedAt: new Date().toISOString(),
    section: sectionItems,
    articlesUsed: sectionItems.length,
    candidatesFetched: allTopicArticles.length,
    aiMetadata: planMetadata,
    input: {
      limit,
      extra,
    },
  };

  try {
    await persistLLMTopicPartial(
      resolvedSendId,
      normalizedTopic,
      record,
      force
    );
  } catch (error) {
    if (error instanceof LLMTopicAlreadyProcessedError) {
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
    if (error instanceof LLMTopicProcessingError) {
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

// Finalization -------------------------------------------------------------

const SECTION_SEQUENCE: Array<
  keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">
> = [
  "commentaries",
  "international",
  "politics",
  "business",
  "tech",
  "science",
  "sport",
  "culture",
  "entertainment",
  "lifestyle",
  "wildCard",
];

const HEADLINE_STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "with",
  "without",
  "into",
  "onto",
  "after",
  "before",
  "over",
  "under",
  "more",
  "than",
  "less",
  "to",
  "from",
  "for",
  "of",
  "in",
  "on",
  "at",
  "by",
  "about",
  "is",
  "are",
  "was",
  "were",
  "be",
  "being",
  "been",
  "has",
  "have",
  "had",
  "will",
  "would",
  "can",
  "could",
  "should",
  "may",
  "might",
  "must",
  "do",
  "does",
  "did",
  "done",
  "new",
  "latest",
  "breaking",
  "update",
  "report",
  "review",
  "video",
  "podcast",
  "exclusive",
]);

const normalizeArticleUrl = (url: string): string => {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.hostname.startsWith("www.")) {
      parsed.hostname = parsed.hostname.slice(4);
    }
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }
    return parsed.toString();
  } catch (error) {
    return url.trim();
  }
};

const tokenizeHeadline = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[\u2019'’`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !HEADLINE_STOPWORDS.has(token));

const buildTokenSet = (
  item: NewsletterSectionItem
): { tokens: Set<string>; hasTokens: boolean } => {
  const headlineTokens = tokenizeHeadline(item.title ?? "");
  const summaryTokens = tokenizeHeadline(item.summary ?? "");
  const combined = new Set<string>([...headlineTokens, ...summaryTokens]);
  return {
    tokens: combined,
    hasTokens: combined.size > 0,
  };
};

const shouldDropAsDuplicate = (
  currentTokens: Set<string>,
  existingTokens: Set<string>
): boolean => {
  if (currentTokens.size === 0 || existingTokens.size === 0) {
    return false;
  }

  let overlapCount = 0;
  let longOverlap = 0;

  currentTokens.forEach((token) => {
    if (existingTokens.has(token)) {
      overlapCount += 1;
      if (token.length >= 5) {
        longOverlap += 1;
      }
    }
  });

  if (overlapCount >= 5) {
    return true;
  }

  if (overlapCount >= 4 && longOverlap >= 2) {
    return true;
  }

  if (overlapCount >= 3) {
    const minSize = Math.min(currentTokens.size, existingTokens.size);
    const unionSize = new Set<string>([
      ...Array.from(currentTokens),
      ...Array.from(existingTokens),
    ]).size;
    const overlapRatio = overlapCount / minSize;
    const jaccard = overlapCount / unionSize;
    if (overlapRatio >= 0.55 || jaccard >= 0.45 || longOverlap >= 2) {
      return true;
    }
  }

  return false;
};

const deduplicatePlanSections = (
  plan: LLMNewsletterPlan
): {
  plan: LLMNewsletterPlan;
  removed: Array<{
    removedTitle: string;
    keptTitle: string;
    section: keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">;
  }>;
} => {
  const dedupedPlan: LLMNewsletterPlan = {
    ...plan,
    essentialReads: {
      overview: plan.essentialReads.overview,
      highlights: [...plan.essentialReads.highlights],
    },
    commentaries: [...plan.commentaries],
    international: [...plan.international],
    politics: [...plan.politics],
    business: [...plan.business],
    tech: [...plan.tech],
    sport: [...plan.sport],
    culture: [...plan.culture],
    wildCard: [...plan.wildCard],
    entertainment: [...plan.entertainment],
    science: [...plan.science],
    lifestyle: [...plan.lifestyle],
  };

  type DedupRecord = {
    tokens: Set<string>;
    link: string;
    slug?: string;
    title: string;
    section: keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">;
  };

  const seen: DedupRecord[] = [];
  const removed: Array<{
    removedTitle: string;
    keptTitle: string;
    section: keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">;
  }> = [];

  for (const section of SECTION_SEQUENCE) {
    const items = [...dedupedPlan[section]];
    const filtered: NewsletterSectionItem[] = [];

    items.forEach((item) => {
      const normalizedLink = normalizeArticleUrl(item.link);
      const slugKey = item.slug?.toLowerCase();

      const duplicateByLink = seen.find(
        (entry) => entry.link === normalizedLink
      );
      if (duplicateByLink) {
        removed.push({
          removedTitle: item.title,
          keptTitle: duplicateByLink.title,
          section,
        });
        return;
      }

      if (slugKey) {
        const duplicateBySlug = seen.find((entry) => entry.slug === slugKey);
        if (duplicateBySlug) {
          removed.push({
            removedTitle: item.title,
            keptTitle: duplicateBySlug.title,
            section,
          });
          return;
        }
      }

      const { tokens, hasTokens } = buildTokenSet(item);
      if (hasTokens) {
        const duplicateByTokens = seen.find((entry) =>
          shouldDropAsDuplicate(tokens, entry.tokens)
        );

        if (duplicateByTokens) {
          removed.push({
            removedTitle: item.title,
            keptTitle: duplicateByTokens.title,
            section,
          });
          return;
        }
      }

      filtered.push(item);
      seen.push({
        tokens,
        link: normalizedLink,
        slug: slugKey ?? undefined,
        title: item.title,
        section,
      });
    });

    dedupedPlan[section] = filtered;
  }

  return { plan: dedupedPlan, removed };
};

export type LLMPlanningStepResult =
  | {
      step: "topic";
      message: string;
      sendId: string;
      topic: LLMTopicKey;
      articlesUsed: number;
      candidatesFetched: number;
    }
  | {
      step: "finalize";
      message: string;
      sendId: string;
      totalTopics: number;
      totalArticles: number;
      totalPublishers: number;
    };

/**
 * Process the next unprocessed topic, or finalize the plan once all topics
 * are processed. Used by the single worker, which runs it until the plan is
 * finalized.
 */
export async function runLLMPlanningStep(
  sendId: string
): Promise<LLMPlanningStepResult> {
  const { id, job, topics } = await loadLLMJobOrThrow(sendId);

  if (job.status === "success") {
    return {
      step: "finalize",
      message: "Job already completed",
      sendId: id,
      totalTopics: topics.length,
      totalArticles: topics.reduce((sum, t) => sum + t.items.length, 0),
      totalPublishers: new Set(topics.map((t) => t.publisher)).size,
    };
  }

  if (topics.length === 0) {
    throw new LLMTopicProcessingError(
      400,
      "No valid topics available for LLM planning"
    );
  }

  const nextTopic = getNextTopicToProcess(job, topics);

  if (nextTopic) {
    const result = await processTopicWithLLM({
      sendId: id,
      topic: nextTopic,
    });

    return {
      step: "topic",
      message: result.message,
      sendId: result.sendId,
      topic: result.topic,
      articlesUsed: result.articlesUsed,
      candidatesFetched: result.candidatesFetched,
    };
  }

  return finalizeNewsletterPlan(id);
}

/**
 * Generate the final consolidated plan from processed topic partials and
 * persist it (deduplicated, with essential reads summary). Falls back to a
 * non-LLM plan if finalization fails.
 */
export async function finalizeNewsletterPlan(
  sendId: string
): Promise<Extract<LLMPlanningStepResult, { step: "finalize" }>> {
  const { id, job, topics } = await loadLLMJobOrThrow(sendId);

  const partials = (job as any).aiPartial || {};

  let plan: LLMNewsletterPlan = {
    essentialReads: {
      overview:
        "Today's essential reads cover the most important stories from across the news landscape.",
      highlights: [],
    },
    summary:
      "A curated selection of today's most significant news stories.",
    commentaries: partials.commentaries?.section || [],
    international: partials.international?.section || [],
    politics: partials.politics?.section || [],
    business: partials.business?.section || [],
    tech: partials.tech?.section || [],
    sport: partials.sport?.section || [],
    culture: partials.culture?.section || [],
    wildCard: partials.wildCard?.section || [],
    entertainment: partials.entertainment?.section || [],
    science: partials.science?.section || [],
    lifestyle: partials.lifestyle?.section || [],
  };

  try {
    const { plan: dedupedPlan, removed } = deduplicatePlanSections(plan);
    if (removed.length > 0) {
      console.log("[llm/finalize] Removed duplicate stories", {
        removed: removed.slice(0, 5),
        total: removed.length,
      });
    }
    plan = dedupedPlan;

    // Generate final overview/summary/highlights AFTER deduplication
    const allSelectedArticles: NewsletterSectionItem[] = [
      ...plan.commentaries,
      ...plan.international,
      ...plan.politics,
      ...plan.business,
      ...plan.tech,
      ...plan.sport,
      ...plan.culture,
      ...plan.wildCard,
      ...plan.entertainment,
      ...plan.science,
      ...plan.lifestyle,
    ];

    const finalOverview = await generateLLMFinalOverview(
      allSelectedArticles,
      plan
    );

    // Update plan with final overview
    plan.essentialReads.overview = finalOverview.overview;
    plan.essentialReads.highlights = finalOverview.highlights;
    plan.summary = finalOverview.summary;

    const highlightLinks = new Set(
      finalOverview.highlights.map((item) => normalizeArticleUrl(item.link))
    );

    const filterSection = (
      items: NewsletterSectionItem[]
    ): NewsletterSectionItem[] =>
      items.filter(
        (item) => !highlightLinks.has(normalizeArticleUrl(item.link))
      );

    plan.commentaries = filterSection(plan.commentaries);
    plan.international = filterSection(plan.international);
    plan.politics = filterSection(plan.politics);
    plan.business = filterSection(plan.business);
    plan.tech = filterSection(plan.tech);
    plan.sport = filterSection(plan.sport);
    plan.culture = filterSection(plan.culture);
    plan.entertainment = filterSection(plan.entertainment);
    plan.science = filterSection(plan.science);
    plan.lifestyle = filterSection(plan.lifestyle);

    await saveNewsletterPlanStage(id, {
      plan,
      aiMetadata: finalOverview.aiMetadata,
      summaryText: finalOverview.summary,
      emailSubject: EMAIL_CONFIG.defaultSubject(getDateString()),
    });

    return {
      step: "finalize",
      message: "Newsletter plan generated",
      sendId: id,
      totalTopics: topics.length,
      totalArticles: topics.reduce((sum, t) => sum + t.items.length, 0),
      totalPublishers: new Set(topics.map((t) => t.publisher)).size,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[llm/finalize] Finalization failed, using fallback plan", {
      error: message,
      sendId: id,
    });

    // Fallback: create a basic plan from partials without LLM calls
    const fallbackPlan: LLMNewsletterPlan = {
      essentialReads: {
        overview:
          "Today's essential reads cover the most important stories from across the news landscape.",
        highlights: [],
      },
      summary: `Curated newsletter with ${
        Object.keys(partials).length
      } processed topics.`,
      commentaries: partials.commentaries?.section || [],
      international: partials.international?.section || [],
      politics: partials.politics?.section || [],
      business: partials.business?.section || [],
      tech: partials.tech?.section || [],
      sport: partials.sport?.section || [],
      culture: partials.culture?.section || [],
      wildCard: partials.wildCard?.section || [],
      entertainment: partials.entertainment?.section || [],
      science: partials.science?.section || [],
      lifestyle: partials.lifestyle?.section || [],
    };

    // Select some highlights from the processed sections
    const allArticles = [
      ...fallbackPlan.commentaries,
      ...fallbackPlan.international,
      ...fallbackPlan.politics,
      ...fallbackPlan.business,
      ...fallbackPlan.tech,
      ...fallbackPlan.sport,
      ...fallbackPlan.culture,
      ...fallbackPlan.entertainment,
      ...fallbackPlan.science,
      ...fallbackPlan.lifestyle,
    ];
    fallbackPlan.essentialReads.highlights = allArticles.slice(0, 4);

    await saveNewsletterPlanStage(id, {
      plan: fallbackPlan,
      aiMetadata: {
        model: "fallback",
        usedFallback: true,
        fallbackReason: `Finalization failed: ${message}`,
      },
      summaryText: fallbackPlan.summary,
      emailSubject: EMAIL_CONFIG.defaultSubject(getDateString()),
    });

    return {
      step: "finalize",
      message: "Newsletter plan generated (fallback)",
      sendId: id,
      totalTopics: topics.length,
      totalArticles: topics.reduce((sum, t) => sum + t.items.length, 0),
      totalPublishers: new Set(topics.map((t) => t.publisher)).size,
    };
  }
}

/**
 * Run the full LLM planning stage for a job: process every unprocessed topic
 * and then finalize the plan. Used by the single worker script.
 */
export async function completeLLMPlanning(
  sendId: string
): Promise<Extract<LLMPlanningStepResult, { step: "finalize" }>> {
  const { job, topics } = await loadLLMJobOrThrow(sendId);

  if (job.status === "success") {
    throw new LLMTopicProcessingError(
      400,
      `Newsletter job ${sendId} is already completed`
    );
  }
  if (!isAllTopicsProcessed(job, topics)) {
    let remaining = getNextTopicToProcess(job, topics);
    while (remaining) {
      await processTopicWithLLM({ sendId, topic: remaining });
      const refreshed = await getNewsletterJob(sendId);
      if (!refreshed) {
        throw new LLMTopicProcessingError(
          404,
          `Newsletter job ${sendId} disappeared during planning`
        );
      }
      remaining = getNextTopicToProcess(refreshed, deserializeTopics(refreshed.topics ?? []));
    }
  }

  return finalizeNewsletterPlan(sendId);
}