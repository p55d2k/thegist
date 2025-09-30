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

const makeSummary = (article: ProcessedNewsItem): string =>
  truncate(stripHtml(article.description));

const toSectionItem = (article: ProcessedNewsItem): NewsletterSectionItem => ({
  title: article.title,
  summary: makeSummary(article),
  link: article.link,
  publisher: article.publisher,
  topic: article.topic,
  slug: article.slug,
  source: article.source,
  pubDate: article.pubDate.toISOString(),
  sectionHints: article.sectionHints,
});

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

const findArticle = (
  candidate: Partial<NewsletterSectionItem>,
  articleByLink: Map<string, ProcessedNewsItem>,
  articleBySlug: Map<string, ProcessedNewsItem>,
  articleByTitle: Map<string, ProcessedNewsItem>
): ProcessedNewsItem | undefined => {
  if (candidate.link) {
    const normalized = normalizeUrl(candidate.link);
    const byLink = articleByLink.get(normalized);
    if (byLink) {
      return byLink;
    }
  }

  if (candidate.slug) {
    const bySlug = articleBySlug.get(candidate.slug);
    if (bySlug) {
      return bySlug;
    }
  }

  if (candidate.title) {
    const key = candidate.title.trim().toLowerCase();
    const byTitle = articleByTitle.get(key);
    if (byTitle) {
      return byTitle;
    }
  }

  return undefined;
};

const resolveSectionItems = (
  rawItems: unknown,
  section: keyof typeof SECTION_LIMITS,
  articleByLink: Map<string, ProcessedNewsItem>,
  articleBySlug: Map<string, ProcessedNewsItem>,
  articleByTitle: Map<string, ProcessedNewsItem>,
  usedLinks: Set<string>
): NewsletterSectionItem[] => {
  const entries = Array.isArray(rawItems)
    ? rawItems
    : rawItems && typeof rawItems === "object"
    ? [rawItems]
    : [];

  if (entries.length === 0) {
    return [];
  }

  const limit = SECTION_LIMITS[section];
  const resolved: NewsletterSectionItem[] = [];

  for (const entry of entries) {
    if (resolved.length >= limit) {
      break;
    }

    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const candidate = entry as Partial<NewsletterSectionItem>;
    const article = findArticle(
      candidate,
      articleByLink,
      articleBySlug,
      articleByTitle
    );

    if (!article) {
      continue;
    }

    const linkKey = normalizeUrl(article.link);
    if (usedLinks.has(linkKey)) {
      continue;
    }

    usedLinks.add(linkKey);

    const summary = (candidate.summary ?? makeSummary(article)).trim();

    resolved.push({
      title: article.title,
      summary,
      link: article.link,
      publisher: article.publisher,
      topic: article.topic,
      slug: article.slug,
      source: article.source,
      pubDate: article.pubDate.toISOString(),
      sectionHints: article.sectionHints,
    });
  }

  return resolved;
};

const fillSectionFromPool = (
  section: keyof typeof SECTION_LIMITS,
  pool: NewsletterSectionItem[],
  usedLinks: Set<string>
): NewsletterSectionItem[] => {
  const limit = SECTION_LIMITS[section];
  const preferredHint = SECTION_HINT_MAP[section];
  const selected: NewsletterSectionItem[] = [];

  const take = (matcher: (item: NewsletterSectionItem) => boolean) => {
    for (const item of pool) {
      if (selected.length >= limit) {
        break;
      }
      const linkKey = normalizeUrl(item.link);
      if (usedLinks.has(linkKey)) {
        continue;
      }
      if (!matcher(item)) {
        continue;
      }
      usedLinks.add(linkKey);
      selected.push(item);
    }
  };

  take((item) => item.sectionHints?.includes(preferredHint) ?? false);

  if (selected.length < limit) {
    take(() => true);
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
  const pool = sortedArticles.map(toSectionItem);
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

const sanitizePlan = (
  candidate: unknown,
  articles: ProcessedNewsItem[]
): GeminiNewsletterPlan | null => {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const planCandidate = candidate as Partial<GeminiNewsletterPlan>;
  if (!planCandidate.essentialReads || !planCandidate.commentaries) {
    return null;
  }

  const articleByLink = new Map<string, ProcessedNewsItem>();
  const articleBySlug = new Map<string, ProcessedNewsItem>();
  const articleByTitle = new Map<string, ProcessedNewsItem>();

  for (const article of articles) {
    articleByLink.set(normalizeUrl(article.link), article);
    articleBySlug.set(article.slug, article);
    articleByTitle.set(article.title.trim().toLowerCase(), article);
  }

  const usedLinks = new Set<string>();

  const commentaries = resolveSectionItems(
    planCandidate.commentaries,
    "commentaries",
    articleByLink,
    articleBySlug,
    articleByTitle,
    usedLinks
  );
  const international = resolveSectionItems(
    planCandidate.international,
    "international",
    articleByLink,
    articleBySlug,
    articleByTitle,
    usedLinks
  );
  const politics = resolveSectionItems(
    planCandidate.politics,
    "politics",
    articleByLink,
    articleBySlug,
    articleByTitle,
    usedLinks
  );
  const businessAndTech = resolveSectionItems(
    planCandidate.businessAndTech,
    "businessAndTech",
    articleByLink,
    articleBySlug,
    articleByTitle,
    usedLinks
  );
  const wildCard = resolveSectionItems(
    planCandidate.wildCard,
    "wildCard",
    articleByLink,
    articleBySlug,
    articleByTitle,
    usedLinks
  );

  const highlightEntries = Array.isArray(
    planCandidate.essentialReads?.highlights
  )
    ? planCandidate.essentialReads?.highlights
    : [];

  const highlights = (highlightEntries ?? [])
    .map((item) => {
      if (typeof item !== "object" || !item) {
        return undefined;
      }
      const article = findArticle(
        item as Partial<NewsletterSectionItem>,
        articleByLink,
        articleBySlug,
        articleByTitle
      );
      if (!article) {
        return undefined;
      }
      const candidateSummary = (() => {
        const rawSummary = (item as NewsletterSectionItem).summary;
        if (typeof rawSummary === "string" && rawSummary.trim().length > 0) {
          return rawSummary.trim();
        }
        const rawDescription = (item as { description?: string }).description;
        if (
          typeof rawDescription === "string" &&
          rawDescription.trim().length > 0
        ) {
          return truncate(stripHtml(rawDescription));
        }
        return makeSummary(article);
      })();
      return {
        title: article.title,
        summary: candidateSummary,
        link: article.link,
        publisher: article.publisher,
        topic: article.topic,
        slug: article.slug,
        source: article.source,
        pubDate: article.pubDate.toISOString(),
        sectionHints: article.sectionHints,
      } satisfies NewsletterSectionItem;
    })
    .filter((value): value is NewsletterSectionItem => !!value);

  const overviewText = planCandidate.essentialReads?.overview?.trim();
  const summaryText = planCandidate.summary?.trim();

  const hasCoverage =
    commentaries.length >= 3 &&
    international.length >= 1 &&
    politics.length >= 1 &&
    businessAndTech.length >= 1 &&
    wildCard.length >= 1;

  if (!hasCoverage) {
    return null;
  }

  const plan: GeminiNewsletterPlan = {
    essentialReads: {
      overview:
        overviewText && overviewText.length > 0
          ? overviewText
          : "Today's essential reads spotlight standout commentary, global developments, and market signals.",
      highlights:
        highlights.length > 0
          ? highlights.slice(0, 4)
          : [
              ...commentaries.slice(0, 2),
              ...international.slice(0, 1),
              ...businessAndTech.slice(0, 1),
            ].slice(0, 4),
    },
    commentaries,
    international,
    politics,
    businessAndTech,
    wildCard: wildCard.slice(0, SECTION_LIMITS.wildCard),
    summary:
      summaryText && summaryText.length > 0
        ? summaryText
        : "A concise mix of commentary, geopolitics, policy, markets, and one wildcard piece to stretch your thinking.",
  };

  return plan;
};

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
      temperature: 0.6,
      topP: 0.8,
      maxOutputTokens: 131072,
    },
  });

  const sortedArticles = [...articles].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
  );

  const limitedArticles = sortedArticles.slice(0, MAX_INPUT_ARTICLES);
  const dataset = limitedArticles.map((article) => ({
    title: article.title,
    description: truncate(stripHtml(article.description), 300),
    link: article.link,
    publisher: article.publisher,
    topic: article.topic,
    slug: article.slug,
    source: article.source,
    pubDate: article.pubDate.toISOString(),
    sectionHints: article.sectionHints,
  }));

  const instructions = `You are an editorial assistant for a daily newsletter. Organise the provided articles into the following sections:\n\n- essentialReads: overview + 3-4 highlight items\n- commentaries: top 5-7 opinion/analysis pieces\n- international: top 2-3 global headlines\n- politics: top 2-3 policy/governance stories\n- businessAndTech: top 2-3 market, business, or technology updates\n- wildCard: exactly 1 unexpected or contrarian piece\n- summary: closing paragraph summarising the mix\n\nGuidelines:\n- Use only the articles provided in the dataset.\n- Prefer newer pieces (higher pubDate) when in doubt.\n- Do not repeat the same article across multiple sections except essential highlights.\n- Provide concise summaries (max 2 sentences).\n- Preserve publisher/topic context to help the reader understand the angle.\n- Return valid JSON only.\n- Honour provided sectionHints when selecting items where possible.`;

  try {
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${instructions}\n\nDataset:\n${JSON.stringify(
                dataset,
                null,
                2
              )}`,
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

    // Sometimes Gemini responses include markdown code blocks or extra text
    // Try to extract just the JSON part
    let jsonText = rawText.trim();

    // Remove markdown code block markers if present
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    // Find JSON object boundaries if there's extra text
    const jsonStart = jsonText.indexOf("{");
    const jsonEnd = jsonText.lastIndexOf("}");

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
    }

    console.log("Extracted JSON text:", jsonText);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
      console.log("Successfully parsed JSON on first attempt");
    } catch (jsonError) {
      console.log("First JSON parse failed, attempting to fix common issues");
      console.log(
        "JSON error:",
        jsonError instanceof Error ? jsonError.message : jsonError
      );
      console.log(
        "Problematic JSON text (first 500 chars):",
        jsonText.substring(0, 500)
      );

      // Try to fix common JSON issues and parse again
      let fixedJson = jsonText
        .replace(/,\s*}/g, "}") // Remove trailing commas
        .replace(/,\s*]/g, "]") // Remove trailing commas in arrays
        .replace(/'/g, '"') // Replace single quotes with double quotes
        .replace(/([{,]\s*)(\w+):/g, '$1"$2":'); // Quote unquoted keys

      try {
        parsed = JSON.parse(fixedJson);
        console.log("Successfully parsed JSON after fixing");
      } catch (secondError) {
        console.error("JSON parsing failed for Gemini response:", {
          rawText:
            rawText.substring(0, 500) + (rawText.length > 500 ? "..." : ""),
          extractedJson:
            jsonText.substring(0, 500) + (jsonText.length > 500 ? "..." : ""),
          fixedJson:
            fixedJson.substring(0, 500) + (fixedJson.length > 500 ? "..." : ""),
          fullLength: rawText.length,
          originalError: jsonError,
          secondError: secondError,
        });
        throw new Error(
          `Invalid JSON response from Gemini: ${
            jsonError instanceof Error
              ? jsonError.message
              : "Unknown JSON error"
          }`
        );
      }
    }
    const sanitisedPlan = sanitizePlan(parsed, limitedArticles);

    if (!sanitisedPlan) {
      return buildFallbackPlan(
        articles,
        "Gemini response missing required sections or failed validation"
      );
    }

    return {
      plan: sanitisedPlan,
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
