// Gemini AI configuration constants
export const GEMINI_CONFIG = {
  maxInputArticles: 60,
  defaultModel: "gemini-2.5-flash",
} as const;

export const SECTION_LIMITS: Record<
  keyof Omit<GeminiNewsletterPlan, "essentialReads" | "summary">,
  number
> = {
  commentaries: 7,
  international: 3,
  politics: 3,
  businessAndTech: 3,
  wildCard: 1,
} as const;

export const SECTION_HINT_MAP: Record<
  keyof Omit<GeminiNewsletterPlan, "essentialReads" | "summary">,
  NewsletterSectionHint
> = {
  commentaries: "commentaries",
  international: "international",
  politics: "politics",
  businessAndTech: "business-tech",
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
} as const;

export const SECTION_TOKEN_MAP: Record<
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
} as const;
