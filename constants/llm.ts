// LLM configuration constants (Groq)
export const LLM_CONFIG = {
  maxInputArticles: 80,
  defaultModel: "openai/gpt-oss-20b",
  baseUrl: "https://api.groq.com",
} as const;

export const SECTION_LIMITS: Record<
  keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">,
  number
> = {
  commentaries: 15,
  international: 8,
  politics: 8,
  business: 8,
  tech: 8,
  entertainment: 8,
  science: 6,
  lifestyle: 6,
  sport: 6,
  culture: 6,
  wildCard: 3,
} as const;

export const SECTION_HINT_MAP: Record<
  keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">,
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
    keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">,
    readonly RegExp[]
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
  keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">
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
