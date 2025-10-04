import {
  SECTION_LIMITS,
  SECTION_HINT_MAP,
  SECTION_TOKEN_MAP,
} from "@/constants/llm";
import {
  getNewsletterJob,
  getNextNewsletterJobNeedingLLM,
  type NewsletterJob,
  type SerializedTopicNewsGroup,
} from "@/lib/firestore";
import { generateNewsletterPlan } from "@/lib/llm";
import { db } from "@/lib/firebase";
import { doc, runTransaction } from "firebase/firestore";

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
        "Newsletter job is missing topics. Run /api/news?persist=true first."
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
  topicKey: LLMTopicKey,
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
    throw new LLMTopicProcessingError(
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

const persistLLMTopicPartial = async (
  sendId: string,
  topic: LLMTopicKey,
  record: LLMTopicPartialRecord,
  force: boolean
): Promise<void> => {
  const ref = doc(db, SEND_COLLECTION, sendId);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) {
      throw new LLMTopicProcessingError(
        404,
        `Newsletter job ${sendId} not found`
      );
    }

    const data = snapshot.data() as NewsletterJob & {
      aiPartial?: Record<string, LLMTopicPartialRecord>;
    };
    const existing = data.aiPartial?.[topic];

    if (existing && !force) {
      throw new LLMTopicAlreadyProcessedError(existing);
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

  const planResult = await generateNewsletterPlan(
    allTopicArticles,
    preClustered,
    {
      topicKey: normalizedTopic,
      alreadySelectedTitles:
        limitedSelectedTitles.length > 0 ? limitedSelectedTitles : undefined,
    }
  );

  const sectionItems = planResult.plan[normalizedTopic].slice(
    0,
    SECTION_LIMITS[normalizedTopic]
  ); // Take top N ranked articles based on section limits
  if (sectionItems.length === 0) {
    throw new LLMTopicProcessingError(
      500,
      `Groq returned no articles for topic ${normalizedTopic}`
    );
  }

  const record: LLMTopicPartialRecord = {
    topic: normalizedTopic,
    updatedAt: new Date().toISOString(),
    section: sectionItems,
    articlesUsed: sectionItems.length,
    candidatesFetched: allTopicArticles.length,
    aiMetadata: planResult.metadata,
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
