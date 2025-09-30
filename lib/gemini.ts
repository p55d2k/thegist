import { GoogleGenerativeAI } from "@google/generative-ai";

const MAX_INPUT_ARTICLES = 60;
const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const SECTION_LIMITS: Record<
  keyof Omit<GeminiNewsletterPlan, "essentialReads" | "summary">,
  number
> = {
  commentaries: 7,
  international: 3,
  politics: 3,
  businessAndTech: 3,
  wildCard: 1,
};

const SECTION_HINT_MAP: Record<
  keyof Omit<GeminiNewsletterPlan, "essentialReads" | "summary">,
  NewsletterSectionHint
> = {
  commentaries: "commentaries",
  international: "international",
  politics: "politics",
  businessAndTech: "business-tech",
  wildCard: "wildcard",
};

const SECTION_KEYWORDS: Partial<
  Record<
    keyof Omit<GeminiNewsletterPlan, "essentialReads" | "summary">,
    RegExp[]
  >
> = {
  commentaries: [
    /opinion/i,
    /analysis/i,
    /commentary/i,
    /column/i,
    /editorial/i,
    /perspective/i,
  ],
  international: [
    /world/i,
    /global/i,
    /asia/i,
    /middle east/i,
    /europe/i,
    /africa/i,
    /latin america/i,
    /international/i,
  ],
  politics: [
    /politic/i,
    /government/i,
    /policy/i,
    /election/i,
    /congress/i,
    /parliament/i,
    /white house/i,
    /senate/i,
  ],
  businessAndTech: [
    /business/i,
    /market/i,
    /econom/i,
    /startup/i,
    /tech/i,
    /technology/i,
    /finance/i,
    /industry/i,
  ],
  wildCard: [/culture/i, /science/i, /sport/i, /arts?/i, /feature/i, /trend/i],
};

const SECTION_TOKEN_MAP: Record<
  string,
  keyof Omit<GeminiNewsletterPlan, "essentialReads" | "summary">
> = {
  commentaries: "commentaries",
  international: "international",
  politics: "politics",
  businessandtech: "businessAndTech",
  businessandtechnology: "businessAndTech",
  business: "businessAndTech",
  wildcard: "wildCard",
  wildcardfeature: "wildCard",
};

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
  const header = "id|slug|date|topic|publisher|title|summary|hints";

  const rows = records.map(({ id, article }) => {
    const hints = article.sectionHints?.join("+") ?? "";

    return [
      id,
      article.slug,
      article.pubDate.toISOString(),
      article.topic ?? "",
      article.publisher ?? "",
      article.title,
      truncate(stripHtml(article.description), 200),
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
): NewsletterSectionItem => ({
  title: article.title,
  summary: formatModelSummary(summary, article),
  link: article.link,
  publisher: article.publisher,
  topic: article.topic,
  slug: article.slug,
  source: article.source,
  pubDate: article.pubDate.toISOString(),
  sectionHints: article.sectionHints,
});

const parseGeminiPipePlan = (
  responseText: string,
  records: GeminiArticleRecord[]
): GeminiNewsletterPlan | null => {
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

  if (lines.length === 0) {
    return null;
  }

  const highlightItems: NewsletterSectionItem[] = [];
  const sectionItems: Record<
    keyof Omit<GeminiNewsletterPlan, "essentialReads" | "summary">,
    NewsletterSectionItem[]
  > = {
    commentaries: [],
    international: [],
    politics: [],
    businessAndTech: [],
    wildCard: [],
  };

  const usedSectionIds = new Set<string>();
  const usedHighlightIds = new Set<string>();

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
      if (usedHighlightIds.has(idToken)) {
        continue;
      }
      highlightItems.push(
        createSectionItemFromArticle(article, generatedSummary)
      );
      usedHighlightIds.add(idToken);
      continue;
    }

    const sectionKey = normalizeSectionToken(sectionToken);
    if (!sectionKey) {
      continue;
    }

    if (usedSectionIds.has(idToken)) {
      continue;
    }

    if (sectionItems[sectionKey].length >= SECTION_LIMITS[sectionKey]) {
      continue;
    }

    sectionItems[sectionKey].push(
      createSectionItemFromArticle(article, generatedSummary)
    );
    usedSectionIds.add(idToken);
  }

  const hasCoverage =
    sectionItems.commentaries.length >= 5 &&
    sectionItems.commentaries.length <= SECTION_LIMITS.commentaries &&
    sectionItems.international.length >= 2 &&
    sectionItems.politics.length >= 2 &&
    sectionItems.businessAndTech.length >= 2 &&
    sectionItems.wildCard.length === 1 &&
    highlightItems.length >= 4;

  if (!hasCoverage) {
    console.warn("Gemini plan coverage insufficient", {
      counts: {
        commentaries: sectionItems.commentaries.length,
        international: sectionItems.international.length,
        politics: sectionItems.politics.length,
        businessAndTech: sectionItems.businessAndTech.length,
        wildCard: sectionItems.wildCard.length,
        highlights: highlightItems.length,
      },
      unknownIds: Array.from(unknownIds),
    });
    return null;
  }

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
    businessAndTech: sectionItems.businessAndTech,
    wildCard: sectionItems.wildCard.slice(0, SECTION_LIMITS.wildCard),
    summary:
      summaryText ??
      "A concise mix of commentary, geopolitics, policy, markets, and one wildcard piece to stretch your thinking.",
  };
};

const RESPONSE_TEMPLATE = [
  "overview|Today's key themes in 1-2 sentences",
  "summary|What readers will get in 1-2 sentences",
  "highlight|a001|1-2 vivid sentences (replace a001 with real article IDs)",
  "commentaries|a001|1-2 vivid sentences",
  "international|a002|1-2 vivid sentences",
  "politics|a003|1-2 vivid sentences",
  "businessAndTech|a004|1-2 vivid sentences",
  "wildCard|a005|1-2 vivid sentences",
].join("\n");

const buildPlanPrompt = (dataset: string): string =>
  [
    "You are planning a current-affairs newsletter from dataset lines (id|slug|date|topic|publisher|title|summary|hints).",
    "Always refer to articles by their id (first column).",
    "Generate 1-2 sentence summaries that are vivid, accurate, and grounded in the supplied facts. Refresh descriptions even when text exists, but do not invent details.",
    "Do not rely solely on the hints column; infer sections from publisher, geography, and headline context.",
    "Strictly output one decision per line using the pipe format shown below. Avoid markdown fences, bullet lists, or extra commentary.",
    "Provide exactly 4 highlight lines, 5-7 commentaries, 2-3 international, 2-3 politics, 2-3 businessAndTech, and exactly 1 wildCard. Never repeat an article id across sections except that highlights may feature items already assigned to a section.",
    "Format example (replace placeholders with real ids and text):",
    RESPONSE_TEMPLATE,
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
  fallbackReason: string
): PlanResult => {
  const sortedArticles = [...articles].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
  );
  const pool = sortedArticles.map((article) =>
    createSectionItemFromArticle(article, undefined)
  );
  const usedLinks = new Set<string>();

  const commentaries = fillSectionFromPool("commentaries", pool, usedLinks);
  const international = fillSectionFromPool("international", pool, usedLinks);
  const politics = fillSectionFromPool("politics", pool, usedLinks);
  const businessAndTech = fillSectionFromPool(
    "businessAndTech",
    pool,
    usedLinks
  );
  const wildCard = fillSectionFromPool("wildCard", pool, usedLinks);

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
  if (businessAndTech.length) {
    overviewSegments.push(`${businessAndTech.length} business & tech moves`);
  }

  const overview =
    overviewSegments.length > 0
      ? `Today's essential reads cover ${overviewSegments.join(", ")}.`
      : "Today's essential reads are light—consider spotlighting one standout analysis.";

  const highlightPool = [
    ...commentaries.slice(0, 2),
    ...international.slice(0, 1),
    ...politics.slice(0, 1),
    ...businessAndTech.slice(0, 1),
  ];

  const highlights = highlightPool.slice(0, 4);

  const uniquePublishers = new Set(
    [
      ...commentaries,
      ...international,
      ...politics,
      ...businessAndTech,
      ...wildCard,
    ].map((item) => item.publisher)
  );

  const summary = `Curated ${
    commentaries.length +
    international.length +
    politics.length +
    businessAndTech.length +
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
    businessAndTech,
    wildCard,
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

export const generateNewsletterPlanFallback = (
  articles: ProcessedNewsItem[],
  fallbackReason = "Fallback planner invoked"
): PlanResult => buildFallbackPlan(articles, fallbackReason);

export const generateNewsletterPlan = async (
  articles: ProcessedNewsItem[]
): Promise<PlanResult> => {
  if (articles.length === 0) {
    return buildFallbackPlan(articles, "No articles available to summarise");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return buildFallbackPlan(
      articles,
      "Missing GEMINI_API_KEY environment variable"
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

  const sortedArticles = [...articles].sort(
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
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
    });

    if (!result.response) {
      throw new Error("No response from Gemini API");
    }

    const rawText = result.response.text();
    console.log("Gemini raw response:", rawText);
    console.log("Gemini raw response length:", rawText.length);
    console.log(
      "Gemini raw response (first 200 chars):",
      rawText.substring(0, 200)
    );

    if (!rawText || rawText.trim().length === 0) {
      throw new Error("Empty response from Gemini");
    }

    const parsedPlan = parseGeminiPipePlan(rawText, articleRecords);

    if (!parsedPlan) {
      return buildFallbackPlan(
        articles,
        "Gemini response missing required sections or failed validation"
      );
    }

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
      error instanceof Error ? error.message : "Unknown Gemini error"
    );
  }
};
