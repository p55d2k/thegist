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
}

interface TopicNewsGroup {
  topic: string;
  slug: string;
  publisher: string;
  items: ProcessedNewsItem[];
}
