// Gemini AI configuration constants
export const GEMINI_CONFIG = {
  maxInputArticles: 80,
  defaultModel: "gemini-2.5-flash-lite",
} as const;

export const SECTION_LIMITS: Record<
  keyof Omit<GeminiNewsletterPlan, "essentialReads" | "summary">,
  number
> = {
  commentaries: 7,
  international: 3,
  politics: 3,
  business: 3,
  tech: 3,
  entertainment: 3,
  science: 2,
  lifestyle: 2,
  sport: 2,
  culture: 2,
  wildCard: 1,
} as const;

export const SECTION_HINT_MAP: Record<
  keyof Omit<GeminiNewsletterPlan, "essentialReads" | "summary">,
  NewsletterSectionHint
> = {
  commentaries: "commentaries",
  international: "international",
  politics: "politics",
  business: "business",
  tech: "tech",
  entertainment: "entertainment",
  science: "science",
  lifestyle: "lifestyle",
  sport: "sport",
  culture: "culture",
  wildCard: "wildcard",
} as const;

export const SECTION_KEYWORDS: Partial<
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
  business: [
    /business/i,
    /market/i,
    /econom/i,
    /finance/i,
    /industry/i,
    /stock/i,
    /shares/i,
    /revenue/i,
    /earnings/i,
    /investor/i,
  ],
  tech: [
    /tech/i,
    /technology/i,
    /software/i,
    /ai/i,
    /artificial intelligence/i,
    /machine learning/i,
    /startup/i,
    /app/i,
    /device/i,
    /cyber/i,
    /crypto/i,
  ],
  entertainment: [
    /entertainment/i,
    /celebrity/i,
    /hollywood/i,
    /movie/i,
    /film/i,
    /tv/i,
    /television/i,
    /music/i,
    /award/i,
    /streaming/i,
  ],
  science: [
    /science/i,
    /scientist/i,
    /research/i,
    /discovery/i,
    /study/i,
    /experiment/i,
    /innovation/i,
    /breakthrough/i,
  ],
  lifestyle: [
    /lifestyle/i,
    /health/i,
    /wellness/i,
    /fitness/i,
    /travel/i,
    /food/i,
    /fashion/i,
    /home/i,
    /family/i,
  ],
  sport: [
    /sport/i,
    /football/i,
    /basketball/i,
    /soccer/i,
    /tennis/i,
    /cricket/i,
    /athlete/i,
    /championship/i,
    /tournament/i,
  ],
  culture: [
    /culture/i,
    /arts?/i,
    /music/i,
    /film/i,
    /movie/i,
    /entertainment/i,
    /celebrity/i,
    /book/i,
    /literature/i,
  ],
  wildCard: [/science/i, /feature/i, /trend/i, /lifestyle/i, /health/i],
} as const;

export const SECTION_TOKEN_MAP: Record<
  string,
  keyof Omit<GeminiNewsletterPlan, "essentialReads" | "summary">
> = {
  commentaries: "commentaries",
  international: "international",
  politics: "politics",
  business: "business",
  tech: "tech",
  technology: "tech",
  entertainment: "entertainment",
  science: "science",
  lifestyle: "lifestyle",
  sport: "sport",
  sports: "sport",
  culture: "culture",
  wildcard: "wildCard",
  wildcardfeature: "wildCard",
} as const;
