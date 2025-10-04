interface RSSItem {
  title: string[];
  description: string[];
  link: string[];
  pubDate?: string[];
  guid?: string[];
}

interface ProcessedNewsItem {
  title: string;
  description: string;
  link: string;
  pubDate: Date;
  source: string;
  publisher: string;
  topic: string;
  slug: string;
  imageUrl?: string;
  sectionHints: NewsletterSectionHint[];
}

interface NewsItem {
  title: string[] | string;
  description: string[] | string;
  link: string[] | string;
}

interface TopicLink {
  publisher: string;
  topic: string;
  slug: string;
  url: string;
  commentaryPrefix?: string;
  sectionHints?: NewsletterSectionHint[];
  // Optional richer metadata to improve UI and planner signals
  description?: string;
  region?: string; // e.g. 'US', 'INT', 'ASIA'
  language?: string; // e.g. 'en', 'es'
  tags?: string[];
}

interface TopicNewsGroup {
  topic: string;
  slug: string;
  publisher: string;
  sectionHints: NewsletterSectionHint[];
  items: ProcessedNewsItem[];
}

type NewsletterSectionHint =
  | "commentaries"
  | "international"
  | "politics"
  | "business"
  | "tech"
  | "sport"
  | "culture"
  | "wildcard"
  | "entertainment"
  | "science"
  | "lifestyle";

interface NewsletterSectionItem {
  title: string;
  summary: string;
  link: string;
  publisher: string;
  topic: string;
  slug: string;
  source: string;
  pubDate: string;
  sectionHints: NewsletterSectionHint[];
}

interface LLMNewsletterPlan {
  essentialReads: {
    overview: string;
    highlights: NewsletterSectionItem[];
  };
  commentaries: NewsletterSectionItem[];
  international: NewsletterSectionItem[];
  politics: NewsletterSectionItem[];
  business: NewsletterSectionItem[];
  tech: NewsletterSectionItem[];
  sport: NewsletterSectionItem[];
  culture: NewsletterSectionItem[];
  wildCard: NewsletterSectionItem[];
  entertainment: NewsletterSectionItem[];
  science: NewsletterSectionItem[];
  lifestyle: NewsletterSectionItem[];
  summary: string;
}
