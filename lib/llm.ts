import Groq from "groq-sdk";

import {
  LLM_CONFIG,
  SECTION_LIMITS,
  SECTION_HINT_MAP,
  SECTION_KEYWORDS,
  SECTION_TOKEN_MAP,
} from "@/constants/llm";

const MAX_INPUT_ARTICLES = LLM_CONFIG.maxInputArticles;
const DEFAULT_MODEL = process.env.GROQ_MODEL ?? LLM_CONFIG.defaultModel;
// Maximum time to wait for the LLM to respond (ms). Can be overridden by env var.
const LLM_TIMEOUT_MS = Number(process.env.GROQ_TIMEOUT_MS ?? 20000);

const PLAN_SECTION_SEQUENCE: Array<
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

type GroqClient = InstanceType<typeof Groq>;
type GroqChatCompletion = Awaited<
  ReturnType<GroqClient["chat"]["completions"]["create"]>
>;

let cachedGroqClient: GroqClient | null = null;
let cachedGroqApiKey: string | null = null;

const getGroqClient = (apiKey: string): GroqClient => {
  if (!cachedGroqClient || cachedGroqApiKey !== apiKey) {
    cachedGroqClient = new Groq({ apiKey, baseURL: LLM_CONFIG.baseUrl });
    cachedGroqApiKey = apiKey;
  }
  return cachedGroqClient;
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(timeoutMessage)),
      timeoutMs
    );
  });

  try {
    return (await Promise.race([promise, timeoutPromise])) as T;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const normalizeSectionToken = (
  token: string
): keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary"> | null => {
  const normalized = token.replace(/[^a-z]/gi, "").toLowerCase();
  return SECTION_TOKEN_MAP[normalized] ?? null;
};

const parseRateLimitType = (errorMessage: string): string => {
  const lowerMessage = errorMessage.toLowerCase();

  // Check for specific rate limit types from Groq API
  if (
    lowerMessage.includes("requests per minute") ||
    lowerMessage.includes("rpm")
  ) {
    return "RPM (Requests per Minute)";
  }
  if (
    lowerMessage.includes("requests per hour") ||
    lowerMessage.includes("rph")
  ) {
    return "RPH (Requests per Hour)";
  }
  if (
    lowerMessage.includes("tokens per minute") ||
    lowerMessage.includes("tpm")
  ) {
    return "TPM (Tokens per Minute)";
  }
  if (lowerMessage.includes("tokens per day") || lowerMessage.includes("tpd")) {
    return "TPD (Tokens per Day)";
  }
  if (
    lowerMessage.includes("tokens per hour") ||
    lowerMessage.includes("tph")
  ) {
    return "TPH (Tokens per Hour)";
  }

  // Fallback for generic rate limit messages
  if (lowerMessage.includes("rate limit")) {
    return "Unknown Rate Limit";
  }

  return "Rate Limit";
};

type PlanResultMetadata = {
  model: string;
  usedFallback: boolean;
  fallbackReason?: string;
};

type PlanResult = {
  plan: LLMNewsletterPlan;
  metadata: PlanResultMetadata;
};

type PlanGenerationOptions = {
  topicKey: keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">;
  alreadySelectedTitles?: string[];
};

const decodeHtmlEntities = (value: string): string => {
  const namedEntities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return value.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (_, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        const codePoint = Number.parseInt(entity.slice(2), 16);
        return Number.isNaN(codePoint) ? _ : String.fromCodePoint(codePoint);
      }
      if (entity.startsWith("#")) {
        const codePoint = Number.parseInt(entity.slice(1), 10);
        return Number.isNaN(codePoint) ? _ : String.fromCodePoint(codePoint);
      }
      return namedEntities[entity] ?? _;
    }
  );
};

const stripHtml = (value: string): string =>
  decodeHtmlEntities(value.replace(/<[^>]*>/g, "").trim());

const truncate = (value: string, length = 100): string =>
  value.length > length ? `${value.slice(0, length - 1)}…` : value;

const condense = (value: string): string =>
  value.replace(/\s+/g, " ").replace(/[|]/g, "/").trim();

type LLMArticleRecord = {
  id: string;
  article: ProcessedNewsItem;
};

const serializeArticlesForLLM = (records: LLMArticleRecord[]): string => {
  const header = "id|slug|topic|publisher|title|summary|hints";

  const rows = records.map(({ id, article }) => {
    const hints = article.sectionHints?.join("+") ?? "";

    return [
      id,
      article.slug,
      article.topic ?? "",
      article.publisher ?? "",
      article.title,
      truncate(stripHtml(article.description), 100),
      hints,
    ]
      .map((cell) => condense(cell))
      .join("|");
  });

  return [header, ...rows].join("\n");
};

const ensureTerminalPunctuation = (value: string): string => {
  if (!value) {
    return value;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  const last = trimmed.slice(-1);
  return ".?!".includes(last) ? trimmed : `${trimmed}.`;
};

const buildArticleFallbackSummary = (article: ProcessedNewsItem): string => {
  const description = stripHtml(article.description ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (description.length > 0) {
    const sentences = description
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);

    if (sentences.length > 0) {
      const combined = sentences.slice(0, 2).join(" ");
      return ensureTerminalPunctuation(truncate(combined, 280));
    }
  }

  const publisher = article.publisher ? `${article.publisher}: ` : "";
  return ensureTerminalPunctuation(
    truncate(`${publisher}${article.title}`, 200)
  );
};

// Cache for article section items to avoid recreating identical items
const articleCache = new Map<string, NewsletterSectionItem>();

const formatModelSummary = (
  summary: string | undefined,
  article: ProcessedNewsItem
): string => {
  // First, try to use the original article description/summary from the RSS feed
  const originalDescription = article.description?.trim();
  if (originalDescription && originalDescription.length > 10) {
    // Use original summary if it's substantial enough
    const cleaned = truncate(stripHtml(originalDescription), 280)
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length > 20) {
      // Ensure it's not just a short snippet
      return ensureTerminalPunctuation(cleaned);
    }
  }

  // Fall back to generated summary if available
  const cleaned = summary
    ? truncate(stripHtml(summary), 280).replace(/\s+/g, " ").trim()
    : "";

  if (cleaned && cleaned.length > 10) {
    return ensureTerminalPunctuation(cleaned);
  }

  // Final fallback to constructed summary
  return buildArticleFallbackSummary(article);
};

const createSectionItemFromArticle = (
  article: ProcessedNewsItem,
  summary: string | undefined
): NewsletterSectionItem => {
  const cacheKey = `${article.slug}-${summary ?? ""}`;

  if (articleCache.has(cacheKey)) {
    return articleCache.get(cacheKey)!;
  }

  const cleanedTitle = condense(article.title);

  const item: NewsletterSectionItem = {
    title: cleanedTitle,
    summary: formatModelSummary(summary, article),
    link: article.link,
    publisher: article.publisher,
    topic: article.topic,
    slug: article.slug,
    source: article.source,
    pubDate: article.pubDate.toISOString(),
    sectionHints: article.sectionHints,
  };

  articleCache.set(cacheKey, item);
  return item;
};

const parseLLMPipePlan = (
  responseText: string,
  articleRecords: LLMArticleRecord[],
  options: PlanGenerationOptions
): LLMNewsletterPlan | null => {
  const targetTopic = options.topicKey;

  const lines = responseText.split("\n").map((line) => line.trim());
  const articleById = new Map(
    articleRecords.map((record) => [record.id, record.article])
  );
  const unknownIds = new Set<string>();

  const sectionItems: Record<
    keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">,
    NewsletterSectionItem[]
  > = {
    commentaries: [],
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
  };

  const usedIds = new Set<string>();
  let validLinesFound = 0;

  for (const line of lines) {
    // Skip empty lines and lines that don't look like our format
    if (!line || !line.includes("|")) {
      continue;
    }

    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 3) {
      continue;
    }

    const sectionToken = parts[0]?.toLowerCase();
    const idToken = parts[1]?.toLowerCase();

    if (!sectionToken || !idToken) {
      continue;
    }

    const article = articleById.get(idToken);
    if (!article) {
      unknownIds.add(idToken);
      continue;
    }

    const generatedSummary = parts.slice(2).join("|").trim();
    // Allow empty summaries if the original article has a good description
    const hasOriginalDescription =
      article.description?.trim() && article.description.trim().length > 20;

    if (!generatedSummary && !hasOriginalDescription) {
      continue; // Skip if no summary provided and no original description
    }

    const sectionKey = normalizeSectionToken(sectionToken);
    if (!sectionKey || sectionKey !== targetTopic) {
      continue;
    }

    if (usedIds.has(idToken)) {
      continue;
    }

    // Allow up to 15 ranked articles for the topic
    if (sectionItems[sectionKey].length >= 15) {
      continue;
    }

    sectionItems[sectionKey].push(
      createSectionItemFromArticle(article, generatedSummary || undefined)
    );
    usedIds.add(idToken);
    validLinesFound++;
  }

  console.log(`[llm/parse] Found ${validLinesFound} valid ranking lines`);

  // Validation for topic mode - require at least 3 articles for a valid response
  const topicCount = sectionItems[targetTopic].length;
  if (topicCount < 3) {
    console.warn("LLM topic plan insufficient articles", {
      topic: targetTopic,
      count: topicCount,
      unknownIds: Array.from(unknownIds),
      validLines: validLinesFound,
    });
    return null;
  }

  console.log("✓ LLM plan parsed successfully", {
    topic: targetTopic,
    count: topicCount,
  });

  return {
    essentialReads: {
      overview: `Topic-focused overview for ${targetTopic}`,
      highlights: sectionItems[targetTopic].slice(0, 4),
    },
    commentaries: [],
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
    summary: `Topic-based processing for ${targetTopic}`,
    [targetTopic]: sectionItems[targetTopic],
  } as LLMNewsletterPlan;
};

const buildPlanPrompt = (
  dataset: string,
  options: PlanGenerationOptions
): string => {
  const targetTopic = options.topicKey;
  const alreadySelectedTitles = options.alreadySelectedTitles;

  let prompt = [
    `Rank most relevant ${targetTopic} articles by: impact, timeliness, credibility, uniqueness, engagement.`,
    "",
    `Format: ${targetTopic}|<id>|brief_summary`,
    `Example: ${targetTopic}|a001|Apple announces revolutionary AI breakthrough.`,
    "",
    "Rules: exact format only, rank best to worst, 15 articles, 1 sentence summaries max 50 words (only if original description inadequate), avoid duplicate topics.",
    "",
    "DATASET:",
    dataset,
  ].join("\n");

  if (alreadySelectedTitles && alreadySelectedTitles.length > 0) {
    const titlesList = alreadySelectedTitles
      .map((title, i) => `${i + 1}. ${title}`)
      .join("\n");
    prompt = [
      `Rank most relevant ${targetTopic} articles by: impact, timeliness, credibility, uniqueness, engagement.`,
      "",
      `IMPORTANT: Avoid articles about topics already covered in other sections. Recent selected articles (sample):`,
      titlesList,
      "",
      `Format: ${targetTopic}|<id>|brief_summary`,
      `Example: ${targetTopic}|a001|Apple announces revolutionary AI breakthrough.`,
      "",
      "Rules: exact format only, rank best to worst, 15 articles, 1 sentence summaries max 50 words (only if original description inadequate), avoid duplicate topics.",
      "",
      "DATASET:",
      dataset,
    ].join("\n");
  }

  return prompt;
};

const buildSimplePlanPrompt = (
  dataset: string,
  options: PlanGenerationOptions
): string => {
  const targetTopic = options.topicKey;
  const alreadySelectedTitles = options.alreadySelectedTitles;

  let prompt = [
    `Rank top ${targetTopic} articles by importance.`,
    `Format: ${targetTopic}|<id>|brief summary`,
    "Rules: no extra text, one per line, 5-8 articles, avoid duplicate topics. Only generate summaries if original description is inadequate.",
    "",
    "Dataset:",
    dataset,
  ].join("\n");

  if (alreadySelectedTitles && alreadySelectedTitles.length > 0) {
    const titlesList = alreadySelectedTitles
      .map((title, i) => `${i + 1}. ${title}`)
      .join("\n");
    prompt = [
      `Rank top ${targetTopic} articles by importance.`,
      "",
      `IMPORTANT: Avoid articles about topics already covered in other sections. Recent selected articles (sample):`,
      titlesList,
      "",
      `Format: ${targetTopic}|<id>|brief summary`,
      "Rules: no extra text, one per line, 5-8 articles, avoid duplicate topics. Only generate summaries if original description is inadequate.",
      "",
      "Dataset:",
      dataset,
    ].join("\n");
  }

  return prompt;
};

const normalizeUrl = (url: string): string => {
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

const fillSectionFromPool = (
  section: keyof typeof SECTION_LIMITS,
  pool: NewsletterSectionItem[],
  usedLinks: Set<string>
): NewsletterSectionItem[] => {
  const limit = SECTION_LIMITS[section];
  const preferredHint = SECTION_HINT_MAP[section];
  const keywords = SECTION_KEYWORDS[section] ?? [];

  const scored = pool.map((item) => {
    const context = `${item.topic ?? ""} ${item.title} ${
      item.publisher ?? ""
    }`.toLowerCase();
    const hintScore =
      preferredHint && item.sectionHints?.includes(preferredHint) ? 3 : 0;
    const keywordScore = keywords.some((regex) => regex.test(context)) ? 2 : 0;
    const wildcardBonus =
      section === "wildCard"
        ? item.sectionHints?.includes("wildcard")
          ? 2
          : 1
        : 0;
    const freshness = Number.isFinite(new Date(item.pubDate).getTime())
      ? new Date(item.pubDate).getTime()
      : 0;

    const score = Math.max(1, hintScore + keywordScore + wildcardBonus);

    return { item, score, freshness };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.freshness - a.freshness;
  });

  const selected: NewsletterSectionItem[] = [];

  for (const candidate of scored) {
    if (selected.length >= limit) {
      break;
    }
    const linkKey = normalizeUrl(candidate.item.link);
    if (usedLinks.has(linkKey)) {
      continue;
    }
    usedLinks.add(linkKey);
    selected.push(candidate.item);
  }

  return selected;
};

const buildFallbackPlan = (
  articles: ProcessedNewsItem[],
  fallbackReason: string,
  options: PlanGenerationOptions
): PlanResult => {
  const targetTopic = options.topicKey;

  const sortedArticles = [...articles].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
  );

  // Topic-specific fallback
  const pool = sortedArticles.map((article) =>
    createSectionItemFromArticle(article, undefined)
  );
  const usedLinks = new Set<string>();
  const sectionItems = fillSectionFromPool(targetTopic, pool, usedLinks);
  const highlights = sectionItems.slice(0, Math.min(4, sectionItems.length));

  const topicLabel = String(targetTopic);
  const overview = sectionItems.length
    ? `Fallback selection for ${topicLabel} featuring ${
        sectionItems.length
      } article${sectionItems.length === 1 ? "" : "s"}.`
    : `No suitable articles available for ${topicLabel}.`;

  const summary = sectionItems.length
    ? `Curated ${sectionItems.length} ${topicLabel} article${
        sectionItems.length === 1 ? "" : "s"
      } without Groq assistance.`
    : `Unable to assemble a ${topicLabel} section without Groq.`;

  const plan: LLMNewsletterPlan = {
    essentialReads: {
      overview,
      highlights,
    },
    commentaries: [],
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
    summary,
  };

  plan[targetTopic] = sectionItems;

  return {
    plan,
    metadata: {
      model: "heuristic",
      usedFallback: true,
      fallbackReason,
    },
  };
};

const buildPreviewPlan = (
  articles: ProcessedNewsItem[],
  fallbackReason: string
): PlanResult => {
  const sortedArticles = [...articles].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
  );
  const pool = sortedArticles.map((article) =>
    createSectionItemFromArticle(article, undefined)
  );

  // For preview mode, show all articles in highlights
  const highlights = pool.slice(0, 20);

  const overview = `Preview of ${highlights.length} articles from the mock data.`;

  const summary = `All articles displayed in highlights for preview purposes. In production, articles are organized into themed sections.`;

  const plan: LLMNewsletterPlan = {
    essentialReads: {
      overview,
      highlights,
    },
    commentaries: [],
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
    summary,
  };

  return {
    plan,
    metadata: {
      model: "heuristic",
      usedFallback: true,
      fallbackReason,
    },
  };
};

const selectFallbackHighlights = (
  plan: LLMNewsletterPlan | undefined,
  allSelectedArticles: NewsletterSectionItem[],
  count = 4
): NewsletterSectionItem[] => {
  const highlights: NewsletterSectionItem[] = [];
  const seenLinks = new Set<string>();

  const pushArticle = (article: NewsletterSectionItem | undefined): boolean => {
    if (!article) {
      return false;
    }
    const linkKey = normalizeUrl(article.link);
    if (seenLinks.has(linkKey)) {
      return false;
    }
    seenLinks.add(linkKey);
    highlights.push(article);
    return highlights.length >= count;
  };

  if (plan) {
    for (const section of PLAN_SECTION_SEQUENCE) {
      const items = plan[section] ?? [];
      for (const item of items) {
        if (pushArticle(item)) {
          return highlights;
        }
      }
    }
  }

  for (const article of allSelectedArticles) {
    if (pushArticle(article)) {
      break;
    }
  }

  return highlights.slice(0, count);
};

export const generateFinalOverview = async (
  allSelectedArticles: NewsletterSectionItem[],
  plan?: LLMNewsletterPlan
): Promise<{
  overview: string;
  summary: string;
  highlights: NewsletterSectionItem[];
  aiMetadata: {
    model: string;
    usedFallback: boolean;
    fallbackReason?: string;
  };
}> => {
  if (allSelectedArticles.length === 0) {
    return {
      overview:
        "Today's essential reads cover the most important stories from across the news landscape.",
      summary: "A curated selection of today's most significant news stories.",
      highlights: [],
      aiMetadata: {
        model: "fallback",
        usedFallback: true,
        fallbackReason: "No articles available",
      },
    };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      overview:
        "Today's essential reads cover the most important stories from across the news landscape.",
      summary: `Curated ${allSelectedArticles.length} articles across multiple sections.`,
      highlights: selectFallbackHighlights(plan, allSelectedArticles),
      aiMetadata: {
        model: "fallback",
        usedFallback: true,
        fallbackReason: "Missing GROQ_API_KEY",
      },
    };
  }

  // Create dataset from all selected articles
  const articleRecords: LLMArticleRecord[] = allSelectedArticles.map(
    (article, index) => ({
      id: `a${String(index + 1).padStart(3, "0")}`,
      article: {
        title: article.title,
        description: article.summary,
        link: article.link,
        publisher: article.publisher,
        topic: article.topic,
        slug: article.slug,
        source: article.source,
        pubDate: new Date(article.pubDate),
        sectionHints: article.sectionHints,
      } as ProcessedNewsItem,
    })
  );

  const serializedDataset = serializeArticlesForLLM(articleRecords);

  const prompt = [
    "Generate newsletter overview, summary, highlights from selected articles.",
    "",
    "Format:",
    "OVERVIEW: [2-3 sentence overview]",
    "SUMMARY: [1 sentence summary]",
    "HIGHLIGHTS: [top 4 article IDs, e.g., a001,a002,a003,a004]",
    "",
    "Dataset:",
    serializedDataset,
  ].join("\n");

  const systemPrompt =
    "Newsletter editor: create compelling overviews focusing on key themes and important stories.";

  try {
    const { rawText } = await callLLMCompletion(
      apiKey,
      prompt,
      LLM_TIMEOUT_MS,
      systemPrompt
    );

    // Parse the response
    const lines = rawText.split("\n");
    let overview =
      "Today's essential reads cover the most important stories from across the news landscape.";
    let summary = `Curated ${allSelectedArticles.length} articles across multiple sections.`;
    let highlights: NewsletterSectionItem[] = allSelectedArticles.slice(0, 4);

    type SectionKey = "overview" | "summary" | "highlights";
    const buffers: Record<SectionKey, string[]> = {
      overview: [],
      summary: [],
      highlights: [],
    };

    let currentSection: SectionKey | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const match = line.match(/^(overview|summary|highlights)\s*:\s*(.*)$/i);
      if (match) {
        currentSection = match[1].toLowerCase() as SectionKey;
        const rest = match[2].trim();
        if (rest) {
          buffers[currentSection].push(rest);
        }
        continue;
      }

      if (currentSection) {
        buffers[currentSection].push(line);
      }
    }

    if (buffers.overview.length > 0) {
      overview = ensureTerminalPunctuation(buffers.overview.join(" ").trim());
    }

    if (buffers.summary.length > 0) {
      summary = ensureTerminalPunctuation(buffers.summary.join(" ").trim());
    }

    if (buffers.highlights.length > 0) {
      const highlightText = buffers.highlights.join(" ");
      const highlightIds = Array.from(
        new Set((highlightText.match(/a\d{3}/gi) ?? []).map((id) => id.trim()))
      );

      const highlightArticles: NewsletterSectionItem[] = [];
      for (const id of highlightIds) {
        const record = articleRecords.find(
          (r) => r.id.toLowerCase() === id.toLowerCase()
        );
        if (record) {
          highlightArticles.push(
            createSectionItemFromArticle(record.article, undefined)
          );
        }
      }

      if (highlightArticles.length > 0) {
        highlights = highlightArticles;
      }
    }

    return {
      overview,
      summary,
      highlights,
      aiMetadata: {
        model: DEFAULT_MODEL,
        usedFallback: false,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // If rate limited, fall back to simple processing
    if (message.includes("rate_limit") || message.includes("429")) {
      const limitType = parseRateLimitType(message);
      console.warn(
        `Final overview generation ${limitType} rate limited, using fallback`
      );

      return {
        overview:
          "Today's essential reads cover the most important stories from across the news landscape.",
        summary: `Curated ${allSelectedArticles.length} articles across multiple sections.`,
        highlights: selectFallbackHighlights(plan, allSelectedArticles),
        aiMetadata: {
          model: "fallback",
          usedFallback: true,
          fallbackReason: `${limitType} rate limit exceeded during overview generation`,
        },
      };
    }

    console.error("Final overview generation failed", { error: message });

    return {
      overview:
        "Today's essential reads cover the most important stories from across the news landscape.",
      summary: `Curated ${allSelectedArticles.length} articles across multiple sections.`,
      highlights: selectFallbackHighlights(plan, allSelectedArticles),
      aiMetadata: {
        model: "fallback",
        usedFallback: true,
        fallbackReason: message,
      },
    };
  }
};

const callLLMCompletion = async (
  apiKey: string,
  prompt: string,
  timeoutMs: number,
  systemPrompt?: string
): Promise<{ rawText: string; response: GroqChatCompletion }> => {
  const messages: Array<{ role: "system" | "user"; content: string }> = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  messages.push({ role: "user", content: prompt });

  try {
    const response = await withTimeout(
      getGroqClient(apiKey).chat.completions.create({
        model: DEFAULT_MODEL,
        messages,
        temperature: 0.1, // Lower temperature for more consistent rankings
        top_p: 0.9, // Higher top_p for better diversity while maintaining quality
        max_tokens: 4096, // Increased for potentially longer responses
        frequency_penalty: 0.1, // Slight penalty for repetition
        presence_penalty: 0.1, // Encourage variety in summaries
      }),
      timeoutMs,
      "Groq request timed out"
    );

    const rawText = response.choices?.[0]?.message?.content ?? "";

    if (!rawText.trim()) {
      throw new Error("Groq returned an empty completion");
    }

    return { rawText, response };
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
};

const runSequentialLLMCall = async (
  apiKey: string,
  prompt: string,
  articleRecords: LLMArticleRecord[],
  timeoutMs: number,
  options: PlanGenerationOptions,
  retries = 2,
  systemPrompt?: string
): Promise<{ rawText: string; parsed: LLMNewsletterPlan }> => {
  let lastError: Error | undefined;

  // Try with the detailed prompt first
  for (let attempt = 0; attempt < Math.max(1, retries); attempt += 1) {
    try {
      const { rawText } = await callLLMCompletion(
        apiKey,
        prompt,
        timeoutMs,
        systemPrompt
      );
      const parsed = parseLLMPipePlan(rawText, articleRecords, options);
      if (parsed) {
        console.log(
          `[llm/call] attempt ${attempt + 1} succeeded with ${
            parsed[options.topicKey].length
          } articles`
        );
        return { rawText, parsed };
      }
      // If parsing failed but we got a response, try a simpler prompt on retry
      if (attempt === 0 && retries > 1) {
        console.warn(
          `[llm/call] attempt ${
            attempt + 1
          } parsing failed, trying simpler prompt`
        );
        const simplePrompt = buildSimplePlanPrompt(
          serializeArticlesForLLM(articleRecords),
          options
        );
        const { rawText: simpleRawText } = await callLLMCompletion(
          apiKey,
          simplePrompt,
          timeoutMs,
          systemPrompt
        );
        const simpleParsed = parseLLMPipePlan(
          simpleRawText,
          articleRecords,
          options
        );
        if (simpleParsed) {
          console.log(
            `[llm/call] simple prompt succeeded with ${
              simpleParsed[options.topicKey].length
            } articles`
          );
          return { rawText: simpleRawText, parsed: simpleParsed };
        }
      }
      throw new Error("Invalid plan format");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Check if this is a rate limit error - if so, fail fast and use fallback
      if (message.includes("rate_limit") || message.includes("429")) {
        const limitType = parseRateLimitType(message);
        console.warn(
          `[llm/call] ${limitType} rate limit hit, falling back to heuristic processing`
        );
        throw new Error(`RATE_LIMIT:${limitType}:${message}`);
      }

      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[llm/call] attempt ${attempt + 1} failed: ${lastError.message}`
      );
    }
  }

  throw lastError ?? new Error("Unknown Groq error");
};

/**
 * Smart sampling strategy for pre-clustered articles.
 * Instead of sending ALL articles to the LLM, we intelligently sample
 * from each section based on limits, reducing input size dramatically.
 */
const smartSamplePreClusteredArticles = (
  preClustered: Map<string, ProcessedNewsItem[]> | undefined,
  ambiguousArticles: ProcessedNewsItem[]
): ProcessedNewsItem[] => {
  if (!preClustered || preClustered.size === 0) {
    return [...ambiguousArticles].sort(
      (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
    );
  }

  const samplingLimits: Record<string, number> = {
    commentaries: 25,
    international: 15,
    politics: 15,
    business: 15,
    tech: 15,
    sport: 10,
    culture: 10,
    wildcard: 8,
    entertainment: 12,
    science: 10,
    lifestyle: 10,
  };

  const sampled: ProcessedNewsItem[] = [];
  const sampledArticleKeys = new Set<string>(); // Track sampled articles to avoid duplicates

  preClustered.forEach((articles, hint) => {
    const limit = samplingLimits[hint] || 5;
    const sorted = [...articles].sort(
      (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
    );

    let addedCount = 0;
    for (const article of sorted) {
      if (addedCount >= limit) break;

      const articleKey = `${article.publisher}-${article.slug}`;
      if (!sampledArticleKeys.has(articleKey)) {
        sampled.push(article);
        sampledArticleKeys.add(articleKey);
        addedCount++;
      }
    }

    console.log(`[llm]   ${hint}: ${addedCount}/${articles.length} sampled`);
  });

  // Add ambiguous articles that haven't been sampled yet
  const sortedAmbiguous = [...ambiguousArticles].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
  );

  let ambiguousAdded = 0;
  for (const article of sortedAmbiguous) {
    const articleKey = `${article.publisher}-${article.slug}`;
    if (!sampledArticleKeys.has(articleKey)) {
      sampled.push(article);
      sampledArticleKeys.add(articleKey);
      ambiguousAdded++;
    }
  }

  console.log(
    `[llm] Smart sampling: ${sampled.length} articles (${ambiguousAdded} ambiguous)`
  );

  return sampled;
};

/**
 * Feed-based pre-clustering: Only include articles from feeds that have the relevant sectionHint.
 * This trusts RSS feed categorizations completely, providing richer datasets to the LLM.
 */
const performContentBasedPreClustering = (
  articles: ProcessedNewsItem[]
): Map<string, ProcessedNewsItem[]> => {
  const clustered = new Map<string, ProcessedNewsItem[]>();

  // Initialize clusters for all section types
  Object.keys(SECTION_KEYWORDS).forEach((section) => {
    clustered.set(section, []);
  });
  clustered.set("wildcard", []);

  // Track assignment method for debugging
  const assignmentStats = {
    feedHints: 0,
    unassigned: 0,
  };

  for (const article of articles) {
    const existingHints = article.sectionHints || [];

    if (existingHints.length > 0) {
      // Assign article to ALL sections that match its feed's hints
      for (const hint of existingHints) {
        const normalizedHint = hint.toLowerCase();
        // Map common variations
        const mappedHint =
          normalizedHint === "wildcard" ? "wildCard" : normalizedHint;
        if (clustered.has(mappedHint)) {
          clustered.get(mappedHint)!.push(article);
          assignmentStats.feedHints++;
        }
      }
    } else {
      // No feed hints - leave unassigned
      assignmentStats.unassigned++;
    }
  }

  // Log clustering results
  let totalClustered = 0;
  clustered.forEach((articles, section) => {
    if (articles.length > 0) {
      totalClustered += articles.length;
    }
  });
  console.log(
    `[llm] Pre-clustered: ${totalClustered} articles (${assignmentStats.feedHints} by hints, ${assignmentStats.unassigned} unassigned)`
  );

  return clustered;
};

export const generateNewsletterPlan = async (
  articles: ProcessedNewsItem[],
  preClustered: Map<string, ProcessedNewsItem[]> | undefined,
  options: PlanGenerationOptions
): Promise<PlanResult> => {
  if (articles.length === 0) {
    return buildFallbackPlan(
      articles,
      "No articles available to summarise",
      options
    );
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return buildFallbackPlan(
      articles,
      "Missing GROQ_API_KEY environment variable",
      options
    );
  }

  // Perform content-based pre-clustering if not already pre-clustered
  let finalPreClustered = preClustered;
  if (!preClustered) {
    console.log("[llm] Performing content-based pre-clustering...");
    finalPreClustered = performContentBasedPreClustering(articles);
  }

  // Always in topic mode now
  const targetTopic = options.topicKey;

  let sampledArticles: ProcessedNewsItem[];
  // For ranking, sample up to 20 articles to avoid LLM timeouts
  const rankingLimit = 20;
  const sortedForRanking = [...articles].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
  );
  sampledArticles = sortedForRanking.slice(0, rankingLimit);
  console.log(
    `[llm] Topic mode: sampling ${sampledArticles.length} articles for ranking (from ${articles.length} available)`
  );

  const sortedArticles = [...sampledArticles].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
  );

  const limitedArticles = sortedArticles.slice(0, MAX_INPUT_ARTICLES);
  const articleRecords: LLMArticleRecord[] = limitedArticles.map(
    (article, index) => ({
      id: `a${String(index + 1).padStart(3, "0")}`,
      article,
    })
  );

  const serializedDataset = serializeArticlesForLLM(articleRecords);
  const prompt = buildPlanPrompt(serializedDataset, options);

  const systemPrompt =
    "Expert news curator: identify impactful, timely, credible articles. Prioritize diversity, avoid duplicates. Concise journalistic summaries.";

  try {
    const callResult = await runSequentialLLMCall(
      apiKey,
      prompt,
      articleRecords,
      LLM_TIMEOUT_MS,
      options,
      2,
      systemPrompt
    );

    const { rawText, parsed } = callResult;

    if (!rawText || !rawText.trim()) {
      throw new Error("Empty response from Groq");
    }

    if (!parsed) {
      console.error(
        "[llm/call] Parsing failed - response received but validation failed"
      );
      return buildFallbackPlan(
        articles,
        "Groq response missing required sections or failed validation",
        options
      );
    }

    console.log("[llm/call] ✓ Successfully generated and parsed plan");

    return {
      plan: parsed,
      metadata: {
        model: DEFAULT_MODEL,
        usedFallback: false,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // If rate limited, immediately fall back to heuristic processing
    if (message.startsWith("RATE_LIMIT:")) {
      const parts = message.split(":");
      const limitType = parts.length > 1 ? parts[1] : "Unknown";
      console.warn(
        `[llm/call] ${limitType} rate limit detected, using heuristic fallback`
      );
      return buildFallbackPlan(
        articles,
        `${limitType} rate limit exceeded - using heuristic processing`,
        options
      );
    }

    console.error("Groq generation failed", {
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      model: DEFAULT_MODEL,
      articlesCount: limitedArticles.length,
    });
    return buildFallbackPlan(articles, message, options);
  }
};

export const generateNewsletterPlanPreview = (
  articles: ProcessedNewsItem[],
  fallbackReason = "Preview mode without Groq"
): PlanResult => buildPreviewPlan(articles, fallbackReason);

/**
 * Deduplicates articles across all sections of a newsletter plan.
 * Uses LLM to identify duplicate stories and removes them, keeping the most appropriate version.
 * Note: Essential reads highlights are excluded from deduplication since they are generated after.
 */
export const deduplicateNewsletterPlan = async (
  plan: LLMNewsletterPlan
): Promise<LLMNewsletterPlan> => {
  // Collect all articles from all sections (excluding essential reads highlights)
  const allArticles: Array<{
    article: NewsletterSectionItem;
    section: keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">;
    index: number;
  }> = [];

  const sectionKeys = Object.keys(SECTION_TOKEN_MAP) as Array<
    keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">
  >;

  for (const section of sectionKeys) {
    const sectionArticles = plan[section] || [];
    sectionArticles.forEach((article, index) => {
      allArticles.push({ article, section, index });
    });
  }

  // Essential reads highlights are NOT included in deduplication
  // They are generated after deduplication to avoid conflicts

  if (allArticles.length <= 1) {
    return plan; // No duplicates possible
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("No GROQ_API_KEY available for deduplication, skipping");
    return plan;
  }

  // Create deduplication prompt
  const titlesList = allArticles
    .map((item, i) => `${i + 1}. ${item.article.title}`)
    .join("\n");

  const prompt = `${titlesList}

Identify duplicate stories (same event/person/topic, different headlines).

For each duplicate group, list the numbers and choose ONE to keep (prefer most relevant section/clearest headline).

Format:
DUPLICATES:
1,3,5 -> keep 1
7,8 -> keep 8

Only list actual duplicates. If none, say "NO_DUPLICATES".`;

  try {
    const { rawText } = await callLLMCompletion(
      apiKey,
      prompt,
      LLM_TIMEOUT_MS,
      "You are a news editor identifying duplicate stories across sections."
    );

    if (rawText.includes("NO_DUPLICATES")) {
      console.log("[dedup] No duplicates found");
      return plan;
    }

    // Parse the response to find duplicates to remove
    const duplicatesSection = rawText.split("DUPLICATES:")[1]?.trim();
    if (!duplicatesSection) {
      console.warn("[dedup] Could not parse deduplication response");
      return plan;
    }

    const lines = duplicatesSection.split("\n").filter((line) => line.trim());
    const articlesToRemove = new Set<number>();

    for (const line of lines) {
      const match = line.match(/(\d+(?:,\d+)*)\s*->\s*keep\s*(\d+)/i);
      if (match) {
        const duplicates = match[1]
          .split(",")
          .map((n) => parseInt(n.trim()) - 1); // Convert to 0-based
        const keep = parseInt(match[2]) - 1;

        // Remove all except the one to keep
        duplicates.forEach((idx) => {
          if (idx !== keep && idx >= 0 && idx < allArticles.length) {
            articlesToRemove.add(idx);
          }
        });
      }
    }

    if (articlesToRemove.size === 0) {
      console.log("[dedup] No articles to remove after parsing");
      return plan;
    }

    console.log(`[dedup] Removing ${articlesToRemove.size} duplicate articles`);

    // Create deduplicated plan
    const deduplicatedPlan = { ...plan };

    // Remove duplicates from each section
    for (const section of sectionKeys) {
      const sectionArticles = plan[section] || [];
      deduplicatedPlan[section] = sectionArticles.filter((_, index) => {
        const globalIndex = allArticles.findIndex(
          (item) => item.section === section && item.index === index
        );
        return globalIndex === -1 || !articlesToRemove.has(globalIndex);
      });
    }

    // Essential reads highlights are not deduplicated (generated after deduplication)
    deduplicatedPlan.essentialReads.highlights = plan.essentialReads.highlights;

    return deduplicatedPlan;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // If rate limited, skip deduplication entirely
    if (message.includes("rate_limit") || message.includes("429")) {
      const limitType = parseRateLimitType(message);
      console.warn(
        `[dedup] ${limitType} rate limit hit during deduplication, skipping`
      );
      return plan;
    }

    console.warn("[dedup] Deduplication failed, using original plan:", error);
    return plan;
  }
};
