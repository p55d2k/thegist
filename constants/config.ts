// General application constants
export const APP_CONFIG = {
  name: "The Gist",
  tagline: "The essential news brief",
  description: "News for people who don't read the news",
  email: "zknewsletter@gmail.com",
  github: "https://github.com/p55d2k/thegist",
} as const;

// Cache control headers
export const CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store",
} as const;

// User agent for RSS fetching
export const USER_AGENT = "Mozilla/5.0" as const;

// Time constants
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Email regex pattern
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Default limits
export const DEFAULT_LIMITS = {
  recentSends: 20,
  batchSize: 50,
  maxBatches: 1,
  rssArticlesPerFeed: 10, // Limit articles fetched per RSS feed to reduce processing
  newsSourcesPerRun: 10,
} as const;
