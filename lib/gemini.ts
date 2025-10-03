import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  GEMINI_CONFIG,
  SECTION_LIMITS,
  SECTION_HINT_MAP,
  SECTION_KEYWORDS,
  SECTION_TOKEN_MAP,
} from "@/constants/gemini";

const MAX_INPUT_ARTICLES = GEMINI_CONFIG.maxInputArticles;
const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? GEMINI_CONFIG.defaultModel;
// Maximum time to wait for Gemini to respond (ms). Can be overridden by env var.
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 12000);
// Number of parallel Gemini calls to race
const PARALLEL_CALL_COUNT = Number(process.env.GEMINI_PARALLEL_CALLS ?? 3);

const normalizeSectionToken = (
  token: string
): keyof Omit<GeminiNewsletterPlan, "essentialReads" | "summary"> | null => {
  const normalized = token.replace(/[^a-z]/gi, "").toLowerCase();
  return SECTION_TOKEN_MAP[normalized] ?? null;
};

type PlanResultMetadata = {
  model: string;
  usedFallback: boolean;
  fallbackReason?: string;
};

type PlanResult = {
  plan: GeminiNewsletterPlan;
  metadata: PlanResultMetadata;
};

type PlanGenerationOptions = {
  topicKey?: keyof Omit<GeminiNewsletterPlan, "essentialReads" | "summary">;
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

const truncate = (value: string, length = 220): string =>
  value.length > length ? `${value.slice(0, length - 1)}…` : value;

const condense = (value: string): string =>
  value.replace(/\s+/g, " ").replace(/[|]/g, "/").trim();

type GeminiArticleRecord = {
  id: string;
  article: ProcessedNewsItem;
};

const serializeArticlesForGemini = (records: GeminiArticleRecord[]): string => {
  const header = "id|slug|topic|publisher|title|summary|hints";

  const rows = records.map(({ id, article }) => {
    const hints = article.sectionHints?.join("+") ?? "";

    return [
      id,
      article.slug,
      article.topic ?? "",
      article.publisher ?? "",
      article.title,
      truncate(stripHtml(article.description), 150),
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
  const cleaned = summary
    ? truncate(stripHtml(summary), 280).replace(/\s+/g, " ").trim()
    : "";

  if (!cleaned) {
    return buildArticleFallbackSummary(article);
  }

  return ensureTerminalPunctuation(cleaned);
};

const createSectionItemFromArticle = (
  article: ProcessedNewsItem,
  summary: string | undefined
): NewsletterSectionItem => {
  const cacheKey = `${article.slug}-${summary ?? ""}`;

  if (articleCache.has(cacheKey)) {
    return articleCache.get(cacheKey)!;
  }

  const item: NewsletterSectionItem = {
    title: article.title,
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

const parseGeminiPipePlan = (
  responseText: string,
  records: GeminiArticleRecord[],
  options?: PlanGenerationOptions
): GeminiNewsletterPlan | null => {
  console.log("[gemini/parse] Raw response length:", responseText.length);
  console.log(
    "[gemini/parse] Raw response (first 500 chars):",
    responseText.substring(0, 500)
  );
  console.log(
    "[gemini/parse] Raw response (last 300 chars):",
    responseText.substring(Math.max(0, responseText.length - 300))
  );

  // Early exit if response is clearly incomplete
  if (
    !responseText.includes("wildCard|") ||
    !responseText.includes("highlight|")
  ) {
    console.warn(
      "[gemini/parse] Response missing required markers (wildCard or highlight)"
    );
    return null;
  }

  const articleById = new Map(
    records.map(({ id, article }) => [id.toLowerCase(), article])
  );
  const unknownIds = new Set<string>();

  const cleaned = responseText
    .replace(/^```[a-zA-Z]*\s*/g, "")
    .replace(/```$/g, "")
    .trim();

  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  console.log("[gemini/parse] Cleaned response has", lines.length, "lines");

  if (lines.length === 0) {
    console.warn("[gemini/parse] No lines found after cleaning");
    return null;
  }

  const targetTopic = options?.topicKey;
  const isTopicMode = Boolean(targetTopic);

  const highlightItems: NewsletterSectionItem[] = [];
  const sectionItems: Record<
    keyof Omit<GeminiNewsletterPlan, "essentialReads" | "summary">,
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

  const usedSectionIds = new Set<string>();
  const usedHighlightIds = new Set<string>();
  const usedIds = new Set<string>();

  let overviewText: string | undefined;
  let summaryText: string | undefined;

  for (const line of lines) {
    const parts = line.split("|");
    if (parts.length < 2) {
      continue;
    }

    const sectionToken = parts[0]?.trim().toLowerCase();
    if (!sectionToken) {
      continue;
    }

    if (sectionToken === "overview" || sectionToken === "summary") {
      const text = parts.slice(1).join("|").trim();
      if (text.length === 0) {
        continue;
      }

      if (sectionToken === "overview") {
        overviewText = ensureTerminalPunctuation(text);
      } else {
        summaryText = ensureTerminalPunctuation(text);
      }
      continue;
    }

    if (parts.length < 3) {
      continue;
    }

    const idToken = parts[1]?.trim().toLowerCase();
    if (!idToken) {
      continue;
    }

    const article = articleById.get(idToken);
    if (!article) {
      unknownIds.add(idToken);
      continue;
    }

    const generatedSummary = parts.slice(2).join("|").trim();

    if (sectionToken === "highlight") {
      if (usedIds.has(idToken)) {
        continue;
      }
      highlightItems.push(
        createSectionItemFromArticle(article, generatedSummary)
      );
      usedHighlightIds.add(idToken);
      usedIds.add(idToken);
      continue;
    }

    const sectionKey = normalizeSectionToken(sectionToken);
    if (!sectionKey) {
      continue;
    }

    if (usedIds.has(idToken)) {
      continue;
    }

    if (sectionItems[sectionKey].length >= SECTION_LIMITS[sectionKey]) {
      continue;
    }

    sectionItems[sectionKey].push(
      createSectionItemFromArticle(article, generatedSummary)
    );
    usedSectionIds.add(idToken);
    usedIds.add(idToken);
  }

  // Validation: Require good coverage across major sections
  const hasCoverage =
    sectionItems.commentaries.length >= 5 &&
    sectionItems.commentaries.length <= SECTION_LIMITS.commentaries &&
    sectionItems.international.length >= 2 &&
    sectionItems.politics.length >= 1 &&
    sectionItems.business.length >= 2 &&
    sectionItems.tech.length >= 1 &&
    sectionItems.wildCard.length >= 1 &&
    highlightItems.length >= 4;

  const totalArticles =
    sectionItems.commentaries.length +
    sectionItems.international.length +
    sectionItems.politics.length +
    sectionItems.business.length +
    sectionItems.tech.length +
    sectionItems.sport.length +
    sectionItems.culture.length +
    sectionItems.entertainment.length +
    sectionItems.science.length +
    sectionItems.lifestyle.length +
    sectionItems.wildCard.length;

  // Also require minimum total article count for a rich newsletter
  const hasMinimumTotal = totalArticles >= 16;

  if (!isTopicMode) {
    if (!hasCoverage || !hasMinimumTotal) {
      console.warn("Gemini plan coverage insufficient", {
        counts: {
          commentaries: sectionItems.commentaries.length,
          international: sectionItems.international.length,
          politics: sectionItems.politics.length,
          business: sectionItems.business.length,
          tech: sectionItems.tech.length,
          sport: sectionItems.sport.length,
          culture: sectionItems.culture.length,
          entertainment: sectionItems.entertainment.length,
          science: sectionItems.science.length,
          lifestyle: sectionItems.lifestyle.length,
          wildCard: sectionItems.wildCard.length,
          highlights: highlightItems.length,
          total: totalArticles,
        },
        unknownIds: Array.from(unknownIds),
        validation: {
          commentariesOk:
            sectionItems.commentaries.length >= 5 &&
            sectionItems.commentaries.length <= SECTION_LIMITS.commentaries,
          internationalOk: sectionItems.international.length >= 2,
          politicsOk: sectionItems.politics.length >= 1,
          businessOk: sectionItems.business.length >= 2,
          techOk: sectionItems.tech.length >= 1,
          wildCardOk: sectionItems.wildCard.length >= 1,
          highlightsOk: highlightItems.length >= 4,
          totalOk: hasMinimumTotal,
        },
      });
      return null;
    }
  } else if (targetTopic) {
    const topicCount = sectionItems[targetTopic].length;
    if (topicCount === 0) {
      console.warn("Gemini topic plan missing required section", {
        topic: targetTopic,
        counts: {
          section: topicCount,
          highlights: highlightItems.length,
        },
        unknownIds: Array.from(unknownIds),
      });
      return null;
    }
  }

  console.log("✓ Gemini plan parsed successfully", {
    counts: {
      commentaries: sectionItems.commentaries.length,
      international: sectionItems.international.length,
      politics: sectionItems.politics.length,
      business: sectionItems.business.length,
      tech: sectionItems.tech.length,
      sport: sectionItems.sport.length,
      culture: sectionItems.culture.length,
      entertainment: sectionItems.entertainment.length,
      science: sectionItems.science.length,
      lifestyle: sectionItems.lifestyle.length,
      wildCard: sectionItems.wildCard.length,
      highlights: highlightItems.length,
      total: totalArticles,
    },
  });

  return {
    essentialReads: {
      overview:
        overviewText ??
        "Today's essential reads spotlight standout commentary, global developments, and market signals.",
      highlights: highlightItems.slice(0, 4),
    },
    commentaries: sectionItems.commentaries,
    international: sectionItems.international,
    politics: sectionItems.politics,
    business: sectionItems.business,
    tech: sectionItems.tech,
    sport: sectionItems.sport,
    culture: sectionItems.culture,
    wildCard: sectionItems.wildCard.slice(0, SECTION_LIMITS.wildCard),
    entertainment: sectionItems.entertainment,
    science: sectionItems.science,
    lifestyle: sectionItems.lifestyle,
    summary:
      summaryText ??
      "A concise mix of commentary, geopolitics, policy, markets, tech, and one wildcard piece to stretch your thinking.",
  };
};

const RESPONSE_TEMPLATE = [
  "overview|Today's key themes in 1-2 sentences",
  "summary|What readers will get in 1-2 sentences",
  "highlight|a001|1-2 vivid sentences",
  "highlight|a002|1-2 vivid sentences",
  "highlight|a003|1-2 vivid sentences",
  "highlight|a004|1-2 vivid sentences",
  "commentaries|a005|1-2 vivid sentences",
  "commentaries|a006|1-2 vivid sentences",
  "commentaries|a007|1-2 vivid sentences",
  "commentaries|a008|1-2 vivid sentences",
  "commentaries|a009|1-2 vivid sentences",
  "international|a010|1-2 vivid sentences",
  "international|a011|1-2 vivid sentences",
  "international|a012|1-2 vivid sentences",
  "politics|a013|1-2 vivid sentences",
  "politics|a014|1-2 vivid sentences",
  "business|a015|1-2 vivid sentences",
  "business|a016|1-2 vivid sentences",
  "business|a017|1-2 vivid sentences",
  "tech|a018|1-2 vivid sentences",
  "tech|a019|1-2 vivid sentences",
  "sport|a020|1-2 vivid sentences",
  "culture|a021|1-2 vivid sentences",
  "entertainment|a022|1-2 vivid sentences",
  "science|a023|1-2 vivid sentences",
  "lifestyle|a024|1-2 vivid sentences",
  "wildCard|a025|1-2 vivid sentences explaining why this is wildcard-worthy",
].join("\n");

const buildPlanPrompt = (dataset: string): string =>
  [
    "Plan newsletter from: id|slug|topic|publisher|title|summary|hints",
    "",
    "TARGET SELECTION (aim for 20-25 total articles):",
    "- 4 highlights (top/breaking stories)",
    "- 5-7 commentaries (opinion/analysis pieces)",
    "- 2-3 articles for: international, business",
    "- 2 articles for: politics, tech",
    "- 1-2 articles for: sport, culture, entertainment, science, lifestyle",
    "- 1 wildcard (surprising/unique story)",
    "",
    "SELECTION CRITERIA:",
    "- Prioritize diverse publishers (max 3-4 articles per publisher)",
    "- Prefer recent, newsworthy, impactful stories",
    "- Balance hard news with analysis and human interest",
    "- Summaries must be specific and vivid, not generic",
    "",
    "OUTPUT FORMAT (use exact article IDs from dataset):",
    "overview|Brief 1-2 sentence overview of today's key themes",
    "summary|What readers will get from this newsletter in 1-2 sentences",
    "highlight|<id>|1-2 vivid sentences",
    "commentaries|<id>|1-2 vivid sentences",
    "international|<id>|1-2 vivid sentences",
    "politics|<id>|1-2 vivid sentences",
    "business|<id>|1-2 vivid sentences",
    "tech|<id>|1-2 vivid sentences",
    "sport|<id>|1-2 vivid sentences",
    "culture|<id>|1-2 vivid sentences",
    "entertainment|<id>|1-2 vivid sentences",
    "science|<id>|1-2 vivid sentences",
    "lifestyle|<id>|1-2 vivid sentences",
    "wildCard|<id>|1-2 vivid sentences explaining why this is wildcard-worthy",
    "",
    "Example output:",
    RESPONSE_TEMPLATE,
    "",
    "Dataset:",
    dataset,
  ].join("\n");

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
  options?: PlanGenerationOptions
): PlanResult => {
  const targetTopic = options?.topicKey;

  const sortedArticles = [...articles].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
  );

  if (targetTopic) {
    const pool = sortedArticles.map((article) =>
      createSectionItemFromArticle(article, undefined)
    );
    const usedLinks = new Set<string>();
    const sectionItems = fillSectionFromPool(targetTopic, pool, usedLinks);
    const highlights = sectionItems.slice(0, Math.min(4, sectionItems.length));

    const overview = sectionItems.length
      ? `Fallback selection for ${targetTopic} featuring ${
          sectionItems.length
        } article${sectionItems.length === 1 ? "" : "s"}.`
      : `No suitable articles available for ${targetTopic}.`;

    const summary = sectionItems.length
      ? `Curated ${sectionItems.length} ${targetTopic} article${
          sectionItems.length === 1 ? "" : "s"
        } without Gemini assistance.`
      : `Unable to assemble a ${targetTopic} section without Gemini.`;

    const plan: GeminiNewsletterPlan = {
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
  }

  const pool = sortedArticles.map((article) =>
    createSectionItemFromArticle(article, undefined)
  );
  const usedLinks = new Set<string>();

  const commentaries = fillSectionFromPool("commentaries", pool, usedLinks);
  const international = fillSectionFromPool("international", pool, usedLinks);
  const politics = fillSectionFromPool("politics", pool, usedLinks);
  const business = fillSectionFromPool("business", pool, usedLinks);
  const tech = fillSectionFromPool("tech", pool, usedLinks);
  const sport = fillSectionFromPool("sport", pool, usedLinks);
  const culture = fillSectionFromPool("culture", pool, usedLinks);
  const wildCard = fillSectionFromPool("wildCard", pool, usedLinks);
  const entertainment = fillSectionFromPool("entertainment", pool, usedLinks);
  const science = fillSectionFromPool("science", pool, usedLinks);
  const lifestyle = fillSectionFromPool("lifestyle", pool, usedLinks);

  const overviewSegments: string[] = [];
  if (commentaries.length) {
    overviewSegments.push(`${commentaries.length} fresh commentaries`);
  }
  if (international.length) {
    overviewSegments.push(`${international.length} global updates`);
  }
  if (politics.length) {
    overviewSegments.push(`${politics.length} political insights`);
  }
  if (business.length) {
    overviewSegments.push(`${business.length} business moves`);
  }
  if (tech.length) {
    overviewSegments.push(`${tech.length} tech updates`);
  }
  if (sport.length) {
    overviewSegments.push(`${sport.length} sports highlights`);
  }
  if (culture.length) {
    overviewSegments.push(`${culture.length} cultural pieces`);
  }

  const overview =
    overviewSegments.length > 0
      ? `Today's essential reads cover ${overviewSegments.join(", ")}.`
      : "Today's essential reads are light—consider spotlighting one standout analysis.";

  const highlightPool = [
    ...commentaries.slice(0, 2),
    ...international.slice(0, 1),
    ...politics.slice(0, 1),
    ...business.slice(0, 1),
    ...tech.slice(0, 1),
  ];

  const highlights = highlightPool.slice(0, 4);

  const uniquePublishers = new Set(
    [
      ...commentaries,
      ...international,
      ...politics,
      ...business,
      ...tech,
      ...sport,
      ...culture,
      ...wildCard,
    ].map((item) => item.publisher)
  );

  const summary = `Curated ${
    commentaries.length +
    international.length +
    politics.length +
    business.length +
    tech.length +
    sport.length +
    culture.length +
    wildCard.length
  } pieces across ${
    uniquePublishers.size
  } publishers without Gemini assistance.`;

  const plan: GeminiNewsletterPlan = {
    essentialReads: {
      overview,
      highlights,
    },
    commentaries,
    international,
    politics,
    business,
    tech,
    sport,
    culture,
    wildCard,
    entertainment,
    science,
    lifestyle,
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

  const plan: GeminiNewsletterPlan = {
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

export const generateNewsletterPlanPreview = (
  articles: ProcessedNewsItem[],
  fallbackReason = "Preview mode without Gemini"
): PlanResult => buildPreviewPlan(articles, fallbackReason);

// Helper to make parallel racing Gemini calls - returns first valid response
const makeFastGeminiCall = async (
  model: any,
  prompt: string,
  articleRecords: GeminiArticleRecord[],
  timeoutMs: number,
  options?: PlanGenerationOptions
): Promise<{ rawText: string; parsed: GeminiNewsletterPlan }> => {
  const calls = Array.from({ length: PARALLEL_CALL_COUNT }, (_, i) =>
    model
      .generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      })
      .then((result: any) => ({ result, index: i }))
  );

  // Race all calls and return first successful parsed response
  return Promise.race(
    calls.map((p) =>
      p.then(async ({ result }: { result: any }) => {
        const rawText = result.response.text();
        const parsed = parseGeminiPipePlan(rawText, articleRecords, options);
        if (!parsed) throw new Error("Invalid plan");
        return { rawText, parsed };
      })
    )
  );
};

// Helper to make streaming Gemini call with early parsing
const makeStreamingGeminiCall = async (
  model: any,
  prompt: string,
  articleRecords: GeminiArticleRecord[],
  options?: PlanGenerationOptions
): Promise<{ rawText: string; parsed: GeminiNewsletterPlan }> => {
  const result = await model.generateContentStream({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  let rawText = "";
  let attemptedParse = false;

  for await (const chunk of result.stream) {
    rawText += chunk.text();

    // Try parsing once we have sufficient markers indicating completeness
    if (
      !attemptedParse &&
      rawText.includes("wildCard|") &&
      rawText.includes("highlight|") &&
      rawText.includes("commentaries|")
    ) {
      attemptedParse = true;
      const parsed = parseGeminiPipePlan(rawText, articleRecords, options);
      if (parsed) {
        return { rawText, parsed };
      }
    }
  }

  // Final parse attempt after stream completes
  const parsed = parseGeminiPipePlan(rawText, articleRecords, options);
  if (!parsed) {
    throw new Error("Invalid plan after streaming completed");
  }
  return { rawText, parsed };
};

/**
 * Smart sampling strategy for pre-clustered articles.
 * Instead of sending ALL articles to Gemini, we intelligently sample
 * from each section based on limits, reducing input size dramatically.
 *
 * Strategy:
 * - Commentaries: Send top 15 (need to pick 5-7)
 * - International: Send top 8 (need to pick 2-3)
 * - Politics: Send top 8 (need to pick 2-3)
 * - Business-Tech: Send top 8 (need to pick 2-3)
 * - Wildcard: Send top 5 (need to pick 1)
 *
 * This reduces input from ~60 articles to ~44 articles, but more importantly,
 * ensures each section has enough candidates without overwhelming Gemini.
 */
const smartSamplePreClusteredArticles = (
  preClustered: Map<string, ProcessedNewsItem[]> | undefined,
  ambiguousArticles: ProcessedNewsItem[]
): ProcessedNewsItem[] => {
  if (!preClustered || preClustered.size === 0) {
    // No pre-clustering, return all articles sorted by date
    return [...ambiguousArticles].sort(
      (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
    );
  }

  const samplingLimits: Record<string, number> = {
    commentaries: 20,
    international: 10,
    politics: 10,
    business: 10,
    tech: 10,
    sport: 7,
    culture: 7,
    wildcard: 5,
    entertainment: 10,
    science: 7,
    lifestyle: 7,
  };

  const sampled: ProcessedNewsItem[] = [];

  // Sample from each pre-clustered section
  preClustered.forEach((articles, hint) => {
    const limit = samplingLimits[hint] || 5;
    const sorted = [...articles].sort(
      (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
    );
    sampled.push(...sorted.slice(0, limit));
  });

  // Add ambiguous articles (these went through full clustering)
  const sortedAmbiguous = [...ambiguousArticles].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
  );
  sampled.push(...sortedAmbiguous);

  console.log(
    `[gemini] Smart sampling: ${sampled.length} articles from pre-clustered + ambiguous`
  );
  preClustered.forEach((articles, hint) => {
    const limit = samplingLimits[hint] || 5;
    const sampleCount = Math.min(articles.length, limit);
    if (sampleCount > 0) {
      console.log(
        `[gemini]   ${hint}: ${sampleCount} of ${articles.length} articles`
      );
    }
  });
  console.log(
    `[gemini]   ambiguous: ${sortedAmbiguous.length} articles (post-clustering)`
  );

  return sampled;
};

export const generateNewsletterPlan = async (
  articles: ProcessedNewsItem[],
  preClustered?: Map<string, ProcessedNewsItem[]>,
  options?: PlanGenerationOptions
): Promise<PlanResult> => {
  // Gemini accepts articles directly; if preClustered is not provided or
  // empty, smartSamplePreClusteredArticles will fall back to using the full
  // articles list. There is no separate preprocessing endpoint in the
  // current pipeline.

  if (articles.length === 0) {
    return buildFallbackPlan(
      articles,
      "No articles available to summarise",
      options
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return buildFallbackPlan(
      articles,
      "Missing GEMINI_API_KEY environment variable",
      options
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: DEFAULT_MODEL,
    generationConfig: {
      temperature: 0.45,
      topP: 0.7,
      maxOutputTokens: 4096,
      responseMimeType: "text/plain",
    },
  });

  // OPTIMIZATION: Smart sampling from pre-clustered articles
  // This dramatically reduces input size while maintaining quality
  const sampledArticles = smartSamplePreClusteredArticles(
    preClustered,
    articles
  );

  const sortedArticles = [...sampledArticles].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
  );

  const limitedArticles = sortedArticles.slice(0, MAX_INPUT_ARTICLES);
  const articleRecords: GeminiArticleRecord[] = limitedArticles.map(
    (article, index) => ({
      id: `a${String(index + 1).padStart(3, "0")}`,
      article,
    })
  );

  const serializedDataset = serializeArticlesForGemini(articleRecords);
  const prompt = buildPlanPrompt(serializedDataset);

  try {
    // Helper to apply a timeout to any promise
    const withTimeout = async <T>(p: Promise<T>, ms: number): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error("Gemini request timed out"));
        }, ms);

        p.then((v) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(v);
        }).catch((err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        });
      });

    let rawText = "";
    let parsedPlan: GeminiNewsletterPlan | null = null;

    try {
      // Try parallel racing calls first (fastest approach)
      const parallelResult = await withTimeout(
        makeFastGeminiCall(
          model,
          prompt,
          articleRecords,
          GEMINI_TIMEOUT_MS,
          options
        ),
        GEMINI_TIMEOUT_MS
      );
      rawText = parallelResult.rawText;
      parsedPlan = parallelResult.parsed;
      console.log("[gemini/call] ✓ Parallel racing succeeded");
    } catch (parallelError) {
      console.log(
        "[gemini/call] Parallel racing failed, trying streaming:",
        parallelError instanceof Error ? parallelError.message : parallelError
      );

      // Fallback to streaming approach
      try {
        const streamingResult = await withTimeout(
          makeStreamingGeminiCall(model, prompt, articleRecords, options),
          GEMINI_TIMEOUT_MS
        );
        rawText = streamingResult.rawText;
        parsedPlan = streamingResult.parsed;
        console.log("[gemini/call] ✓ Streaming approach succeeded");
      } catch (streamingError) {
        console.error(
          "[gemini/call] Streaming also failed:",
          streamingError instanceof Error
            ? streamingError.message
            : streamingError
        );
        throw streamingError;
      }
    }

    console.log("[gemini/call] Full raw response:");
    console.log("=".repeat(80));
    console.log(rawText);
    console.log("=".repeat(80));

    if (!rawText || rawText.trim().length === 0) {
      throw new Error("Empty response from Gemini");
    }

    if (!parsedPlan) {
      console.error(
        "[gemini/call] Parsing failed - response received but validation failed"
      );
      return buildFallbackPlan(
        articles,
        "Gemini response missing required sections or failed validation",
        options
      );
    }

    console.log("[gemini/call] ✓ Successfully generated and parsed plan");

    return {
      plan: parsedPlan,
      metadata: {
        model: DEFAULT_MODEL,
        usedFallback: false,
      },
    };
  } catch (error) {
    console.error("Gemini generation failed", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      model: DEFAULT_MODEL,
      articlesCount: limitedArticles.length,
    });
    return buildFallbackPlan(
      articles,
      error instanceof Error ? error.message : "Unknown Gemini error",
      options
    );
  }
};
