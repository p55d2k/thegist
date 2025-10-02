/**
 * Article preprocessing utilities for deduplication and clustering.
 * All algorithms are free and run locally (no external API calls).
 */

// ============================================================================
// URL Normalization & Deduplication
// ============================================================================

/**
 * Normalize a URL to a canonical form for deduplication.
 * - Remove tracking parameters (utm_*, fbclid, etc.)
 * - Force HTTPS
 * - Remove www. prefix
 * - Remove trailing slashes
 * - Remove fragments (#)
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Force HTTPS
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }

    // Remove www. prefix
    if (parsed.hostname.startsWith("www.")) {
      parsed.hostname = parsed.hostname.slice(4);
    }

    // Remove common tracking parameters
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "msclkid",
      "_ga",
      "mc_cid",
      "mc_eid",
    ];

    trackingParams.forEach((param) => {
      parsed.searchParams.delete(param);
    });

    // Remove fragment
    parsed.hash = "";

    // Get the normalized URL and remove trailing slash
    let normalized = parsed.toString();
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch (error) {
    // If URL parsing fails, return trimmed original
    return url.trim();
  }
}

/**
 * Remove exact duplicate articles based on normalized URLs.
 * Keeps the first occurrence (earliest by index or pubDate).
 */
export function dedupeByUrl<T extends { link: string; pubDate: Date }>(
  items: T[]
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  // Sort by pubDate (newest first) to prefer fresher content
  const sorted = [...items].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime()
  );

  for (const item of sorted) {
    const normalized = normalizeUrl(item.link);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(item);
    }
  }

  return unique;
}

// ============================================================================
// Title Similarity (Levenshtein Distance)
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings.
 * Returns the minimum number of single-character edits.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Strip common RSS title prefixes and suffixes:
 * - Publisher names: "BBC:", "CNN -", "Al Jazeera |", etc.
 * - Dates: "Jan 1, 2024", "2024-01-01", etc.
 * - Locations in brackets: "[UK]", "[VIDEO]", etc.
 * - Common patterns: "LIVE:", "BREAKING:", "UPDATE:", etc.
 */
function stripTitlePrefixSuffix(title: string): string {
  let cleaned = title;

  // Strip common publisher prefixes (case-insensitive)
  const publisherPrefixes = [
    /^BBC:\s*/i,
    /^CNN\s*-\s*/i,
    /^NPR\s*-\s*/i,
    /^Al Jazeera\s*[:|]\s*/i,
    /^The Guardian\s*-\s*/i,
    /^Reuters\s*-\s*/i,
    /^AP News\s*-\s*/i,
    /^Bloomberg\s*-\s*/i,
    /^Financial Times\s*-\s*/i,
  ];

  for (const pattern of publisherPrefixes) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Strip common prefixes
  const commonPrefixes = [
    /^LIVE:\s*/i,
    /^BREAKING:\s*/i,
    /^UPDATE:\s*/i,
    /^EXCLUSIVE:\s*/i,
    /^VIDEO:\s*/i,
    /^WATCH:\s*/i,
    /^READ:\s*/i,
    /^ANALYSIS:\s*/i,
    /^OPINION:\s*/i,
  ];

  for (const pattern of commonPrefixes) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Strip brackets with content at start: [VIDEO], [UK], etc.
  cleaned = cleaned.replace(/^\[[^\]]+\]\s*/g, "");

  // Strip dates at the end: "... - Jan 1, 2024", "... (2024-01-01)"
  cleaned = cleaned.replace(/\s*[-–—]\s*\w+\s+\d{1,2},?\s+\d{4}$/i, "");
  cleaned = cleaned.replace(/\s*\(\d{4}-\d{2}-\d{2}\)$/i, "");

  // Strip publisher name at the end: "... - BBC", "... | CNN"
  cleaned = cleaned.replace(/\s*[-–—|]\s*\w+\s*$/i, "");

  return cleaned.trim();
}

/**
 * Normalize a title for comparison:
 * - Strip prefixes/suffixes
 * - Lowercase
 * - Remove punctuation
 * - Remove common stop words
 * - Trim whitespace
 */
function normalizeTitle(title: string): string {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "as",
    "is",
    "was",
    "are",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
  ]);

  // First strip prefixes/suffixes
  let cleaned = stripTitlePrefixSuffix(title);

  // Then normalize
  return cleaned
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // Remove punctuation
    .split(/\s+/)
    .filter((word) => word.length > 0 && !stopWords.has(word))
    .join(" ")
    .trim();
}

/**
 * Calculate Jaccard similarity (word overlap) between two titles.
 * Returns ratio of shared words to total unique words.
 */
function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(/\s+/));
  const wordsB = new Set(normalizeTitle(b).split(/\s+/));

  const intersection = new Set(Array.from(wordsA).filter((x) => wordsB.has(x)));
  const union = new Set([...Array.from(wordsA), ...Array.from(wordsB)]);

  if (union.size === 0) return 0.0;
  return intersection.size / union.size;
}

/**
 * Check if one title is a substring/containment of another.
 * E.g., "Trump wins" is contained in "Trump wins election in landslide"
 */
function substringContainment(a: string, b: string): number {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);

  if (normA.length === 0 || normB.length === 0) return 0.0;

  const wordsA = normA.split(/\s+/).filter((w) => w.length > 2);
  const wordsB = normB.split(/\s+/).filter((w) => w.length > 2);

  if (wordsA.length === 0 || wordsB.length === 0) return 0.0;

  // Check if shorter title's words are mostly in longer title
  const [shorter, longer] =
    wordsA.length < wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  const longerSet = new Set(longer);

  const matchCount = shorter.filter((w) => longerSet.has(w)).length;
  return matchCount / shorter.length;
}

/**
 * Generate character n-grams from a string.
 */
function getNGrams(text: string, n: number): Set<string> {
  const grams = new Set<string>();
  if (text.length < n) {
    grams.add(text);
    return grams;
  }

  for (let i = 0; i <= text.length - n; i++) {
    grams.add(text.substring(i, i + n));
  }
  return grams;
}

/**
 * Calculate n-gram similarity (character-level overlap).
 * Useful for detecting typos and variations.
 */
function nGramSimilarity(a: string, b: string, n: number = 3): number {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);

  if (normA === normB) return 1.0;
  if (normA.length === 0 || normB.length === 0) return 0.0;

  const gramsA = getNGrams(normA, n);
  const gramsB = getNGrams(normB, n);

  const intersection = new Set(Array.from(gramsA).filter((x) => gramsB.has(x)));
  const union = new Set([...Array.from(gramsA), ...Array.from(gramsB)]);

  if (union.size === 0) return 0.0;
  return intersection.size / union.size;
}

/**
 * Calculate multi-level similarity score between two titles (0 to 1).
 * Combines multiple similarity metrics:
 * - Exact match after normalization
 * - Word overlap (Jaccard)
 * - Character n-grams
 * - Levenshtein distance
 *
 * Returns weighted average, prioritizing word-level similarity.
 */
export function titleSimilarity(a: string, b: string): number {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);

  // Perfect match
  if (normA === normB) return 1.0;
  if (normA.length === 0 || normB.length === 0) return 0.0;

  // Calculate multiple similarity metrics
  const jaccard = jaccardSimilarity(a, b); // Word overlap
  const ngram = nGramSimilarity(a, b, 3); // Character trigrams

  // Levenshtein (character-level edit distance)
  const distance = levenshteinDistance(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  const levenshtein = 1 - distance / maxLen;

  // Weighted combination:
  // - Word overlap (Jaccard) is most important for news titles
  // - N-grams help catch typos and variations
  // - Levenshtein provides baseline character similarity
  const combined = jaccard * 0.6 + ngram * 0.25 + levenshtein * 0.15;

  return Math.min(1.0, combined);
}

/**
 * Extract quoted phrases from text.
 * Direct quotes are unique identifiers for same story.
 * E.g., '"I will not resign" appears in multiple articles about same event.
 */
function extractQuotes(text: string): Set<string> {
  const quotes = text.match(/["']([^"']{10,})["']/g) || [];
  const normalized = new Set<string>();

  for (const quote of quotes) {
    // Remove quotes and normalize
    const clean = quote.replace(/["']/g, "").toLowerCase().trim();
    if (clean.length >= 10) {
      normalized.add(clean);
    }
  }

  return normalized;
}

/**
 * Extract location entities from text.
 * Patterns: "in Gaza", "near Moscow", "at the White House"
 */
function extractLocations(text: string): Set<string> {
  const patterns = [
    /\b(?:in|at|near|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g,
    /\b(?:in|at)\s+the\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g,
  ];

  const locations = new Set<string>();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const location = match[1].toLowerCase();
      if (location.length >= 3) {
        locations.add(location);
      }
    }
  }

  return locations;
}

/**
 * Calculate temporal proximity boost for articles published close together.
 * Breaking news often published simultaneously across outlets.
 */
function temporalBoost(dateA: Date, dateB: Date): number {
  const hoursDiff =
    Math.abs(dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60);

  if (hoursDiff < 2) return 1.15; // Same story breaking simultaneously
  if (hoursDiff < 6) return 1.08; // Recent updates
  if (hoursDiff < 24) return 1.0; // Same day
  return 0.95; // Slight penalty for old vs new
}

/**
 * Extract numeric entities from text (deaths, scores, prices, ages, etc.).
 * Numbers are strong signals for matching same stories.
 */
function extractNumbers(text: string): Set<string> {
  // Match numbers with context: "5 dead", "$100", "3-2", "50%", etc.
  const patterns = [
    /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:dead|killed|injured|people|million|billion|percent|%)/gi,
    /\$\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:million|billion|k))?/gi,
    /\b\d+-\d+\b/g, // Scores: "3-2", "10-5"
    /\b\d+(?:,\d{3})+\b/g, // Large numbers: "1,000", "50,000"
  ];

  const numbers = new Set<string>();
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach((m) => numbers.add(m.toLowerCase().trim()));
    }
  }

  return numbers;
}

/**
 * Extract key entities/keywords from text (names, places, events).
 * Heuristic: capitalized words that aren't common words.
 */
function extractKeywords(text: string): Set<string> {
  const commonWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "as",
    "is",
    "was",
    "are",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "should",
    "could",
    "may",
    "might",
    "must",
    "can",
    "says",
    "said",
  ]);

  // Extract capitalized words (likely proper nouns)
  const words = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];

  const keywords = new Set<string>();
  for (const word of words) {
    const normalized = word.toLowerCase();
    if (!commonWords.has(normalized) && word.length >= 3) {
      keywords.add(normalized);
    }
  }

  return keywords;
}

/**
 * Calculate keyword overlap between two texts.
 */
function keywordSimilarity(textA: string, textB: string): number {
  const keywordsA = extractKeywords(textA);
  const keywordsB = extractKeywords(textB);

  if (keywordsA.size === 0 && keywordsB.size === 0) return 0;

  const intersection = new Set(
    Array.from(keywordsA).filter((x) => keywordsB.has(x))
  );
  const union = new Set([...Array.from(keywordsA), ...Array.from(keywordsB)]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Calculate combined similarity using multiple signals.
 * AGGRESSIVE: Designed to catch same stories with different angles.
 */
export function articleSimilarity(
  titleA: string,
  descA: string,
  titleB: string,
  descB: string,
  dateA?: Date,
  dateB?: Date
): number {
  // Signal 1: Title similarity (basic)
  const titleSim = titleSimilarity(titleA, titleB);

  // If titles are very similar, trust that immediately
  if (titleSim >= 0.6) return titleSim; // LOWERED from 0.65

  // Signal 2: Substring containment (one title subset of other)
  const containment = substringContainment(titleA, titleB);
  if (containment >= 0.7) {
    // LOWERED from 0.75
    // If 70%+ of shorter title's words appear in longer, likely same story
    return Math.max(titleSim, containment * 0.9); // INCREASED weight
  }

  // Signal 3: Keyword overlap (entities, proper nouns)
  const keywordSim = keywordSimilarity(
    titleA + " " + descA,
    titleB + " " + descB
  );

  // Signal 4: Numeric entities (deaths, scores, prices)
  const numbersA = extractNumbers(titleA + " " + descA);
  const numbersB = extractNumbers(titleB + " " + descB);
  let numberSim = 0;
  if (numbersA.size > 0 && numbersB.size > 0) {
    const intersection = new Set(
      Array.from(numbersA).filter((x) => numbersB.has(x))
    );
    const union = new Set([...Array.from(numbersA), ...Array.from(numbersB)]);
    numberSim = union.size > 0 ? intersection.size / union.size : 0;
  }

  // Signal 5: Quoted phrases (NEW - very strong signal)
  const quotesA = extractQuotes(titleA + " " + descA);
  const quotesB = extractQuotes(titleB + " " + descB);
  let quoteSim = 0;
  if (quotesA.size > 0 && quotesB.size > 0) {
    const intersection = new Set(
      Array.from(quotesA).filter((x) => quotesB.has(x))
    );
    const union = new Set([...Array.from(quotesA), ...Array.from(quotesB)]);
    quoteSim = union.size > 0 ? intersection.size / union.size : 0;
  }

  // Signal 6: Location entities (NEW)
  const locsA = extractLocations(titleA + " " + descA);
  const locsB = extractLocations(titleB + " " + descB);
  let locSim = 0;
  if (locsA.size > 0 && locsB.size > 0) {
    const intersection = new Set(Array.from(locsA).filter((x) => locsB.has(x)));
    const union = new Set([...Array.from(locsA), ...Array.from(locsB)]);
    locSim = union.size > 0 ? intersection.size / union.size : 0;
  }

  // Early exit: If same quote found, VERY likely same story
  if (quoteSim >= 0.5) {
    return Math.max(titleSim, quoteSim * 0.95);
  }

  // If same numbers AND keyword overlap, likely same story
  if (numberSim >= 0.5 && keywordSim >= 0.4) {
    return Math.max(titleSim, (numberSim + keywordSim) / 2);
  }

  // If keywords overlap significantly, likely same story
  if (keywordSim >= 0.5) {
    return Math.max(titleSim, keywordSim * 0.85);
  }

  // Signal 7: Description similarity (IMPROVED fallback)
  const descSim = descA && descB ? jaccardSimilarity(descA, descB) : 0;

  // If titles dissimilar (<0.3) but descriptions match heavily (>0.5), trust description
  if (titleSim < 0.3 && descSim > 0.5) {
    return descSim * 0.75; // Boost description weight significantly
  }

  // Final weighted combination (UPDATED weights with new signals)
  // Containment gets highest weight (25%), then Title (20%), Keywords (20%), etc.
  let baseSim =
    containment * 0.25 + // Increased from 15%
    titleSim * 0.2 + // Decreased from 45%
    keywordSim * 0.2 + // Decreased from 25%
    numberSim * 0.15 + // Increased from 10%
    quoteSim * 0.1 + // NEW
    locSim * 0.05 + // NEW
    descSim * 0.05; // Same

  // Signal 8: Temporal boost (NEW - multiplier)
  if (dateA && dateB) {
    const boost = temporalBoost(dateA, dateB);
    baseSim = Math.min(1.0, baseSim * boost);
  }

  return baseSim;
}

// ============================================================================
// Article Clustering
// ============================================================================

export interface ArticleCluster<T> {
  representative: T;
  members: T[];
  averageSimilarity: number;
}

export interface ClusterOptions {
  /** Minimum similarity threshold (0-1) to group articles */
  similarityThreshold?: number;
  /** Maximum cluster size (prevent mega-clusters) */
  maxClusterSize?: number;
  /** Prefer articles from these publishers as representatives */
  preferredPublishers?: Set<string>;
  /** Use graph-based clustering instead of greedy (catches transitive similarities) */
  useGraphClustering?: boolean;
  /** Cluster within topic groups first (prevents false positives across categories) */
  topicAware?: boolean;
}

/**
 * Find connected components in an undirected graph using DFS.
 * Each component represents articles that are transitively similar.
 */
function findConnectedComponents(
  graph: Map<number, Set<number>>,
  nodeCount: number
): number[][] {
  const visited = new Set<number>();
  const components: number[][] = [];

  function dfs(node: number, component: number[]): void {
    visited.add(node);
    component.push(node);

    const neighbors = graph.get(node);
    if (neighbors) {
      Array.from(neighbors).forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          dfs(neighbor, component);
        }
      });
    }
  }

  for (let i = 0; i < nodeCount; i++) {
    if (!visited.has(i)) {
      const component: number[] = [];
      dfs(i, component);
      components.push(component);
    }
  }

  return components;
}

/**
 * Graph-based clustering using connected components.
 * MUCH BETTER than greedy for catching transitive similarities.
 *
 * Example: A-B similarity 0.35, B-C similarity 0.35, A-C similarity 0.25
 * Greedy: Creates 2 clusters {A,B} and {C}
 * Graph: Creates 1 cluster {A,B,C} because B connects them
 */
function graphBasedClustering<
  T extends {
    title: string;
    description: string;
    pubDate: Date;
    publisher: string;
    link: string;
  }
>(
  items: T[],
  threshold: number,
  preferredPublishers: Set<string>
): ArticleCluster<T>[] {
  if (items.length === 0) return [];

  // Build similarity graph
  const graph = new Map<number, Set<number>>();

  console.log(
    `[preprocess] Building similarity graph for ${items.length} articles (threshold: ${threshold})...`
  );

  // O(n²) - compute all pairwise similarities
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const sim = articleSimilarity(
        items[i].title,
        items[i].description || "",
        items[j].title,
        items[j].description || "",
        items[i].pubDate,
        items[j].pubDate
      );

      if (sim >= threshold) {
        // Add edge in both directions
        if (!graph.has(i)) graph.set(i, new Set());
        if (!graph.has(j)) graph.set(j, new Set());
        graph.get(i)!.add(j);
        graph.get(j)!.add(i);
      } else if (sim >= threshold - 0.1) {
        // Debug: log near-misses
        console.log(
          `[preprocess] Near-miss similarity ${sim.toFixed(3)} between:`
        );
        console.log(`  "${items[i].title}" (${items[i].publisher})`);
        console.log(`  "${items[j].title}" (${items[j].publisher})`);
      }
    }
  }

  console.log(
    `[preprocess] Graph built with ${graph.size} nodes and ${
      Array.from(graph.values()).reduce((sum, s) => sum + s.size, 0) / 2
    } edges`
  );

  // Find connected components (clusters)
  const components = findConnectedComponents(graph, items.length);

  console.log(`[preprocess] Found ${components.length} connected components`);

  // Convert components to clusters
  const clusters: ArticleCluster<T>[] = [];

  for (const component of components) {
    const members = component.map((i) => items[i]);

    // Choose best representative: preferred publisher + freshest
    let representative = members[0];
    for (const member of members) {
      const currentPreferred = preferredPublishers.has(
        representative.publisher
      );
      const memberPreferred = preferredPublishers.has(member.publisher);

      if (memberPreferred && !currentPreferred) {
        representative = member;
      } else if (memberPreferred === currentPreferred) {
        // Both preferred or both not - choose fresher
        if (member.pubDate.getTime() > representative.pubDate.getTime()) {
          representative = member;
        }
      }
    }

    // Calculate average similarity
    let totalSim = 0;
    let count = 0;
    for (const member of members) {
      const sim = articleSimilarity(
        member.title,
        member.description || "",
        representative.title,
        representative.description || "",
        member.pubDate,
        representative.pubDate
      );
      totalSim += sim;
      count++;
    }

    clusters.push({
      representative,
      members,
      averageSimilarity: count > 0 ? totalSim / count : 1.0,
    });

    // Debug: log clusters with multiple members
    if (members.length > 1) {
      console.log(`[preprocess] Cluster with ${members.length} articles:`);
      console.log(
        `  Representative: "${representative.title}" (${representative.publisher})`
      );
      console.log(
        `  Average similarity: ${(count > 0 ? totalSim / count : 1.0).toFixed(
          3
        )}`
      );
      members.slice(1, 4).forEach((m, idx) => {
        console.log(`  Member ${idx + 1}: "${m.title}" (${m.publisher})`);
      });
      if (members.length > 4) {
        console.log(`  ... and ${members.length - 4} more`);
      }
    }
  }

  return clusters;
}

/**
 * Cluster articles by title and description similarity.
 * Supports both greedy and graph-based clustering, plus topic-aware grouping.
 *
 * OPTIONS:
 * - useGraphClustering: true = graph-based (catches transitive), false = greedy (faster)
 * - topicAware: true = cluster within topics first (prevents cross-category false positives)
 */
export function clusterArticles<
  T extends {
    title: string;
    description: string;
    pubDate: Date;
    publisher: string;
    link: string;
    topic?: string;
  }
>(items: T[], options: ClusterOptions = {}): ArticleCluster<T>[] {
  const {
    similarityThreshold = 0.15, // LOWERED from 0.2 for even more aggressive clustering
    maxClusterSize = 20,
    preferredPublishers = new Set(),
    useGraphClustering = true, // DEFAULT: Use graph-based
    topicAware = true, // DEFAULT: Cluster within topics first
  } = options;

  if (items.length === 0) return [];

  // TOPIC-AWARE CLUSTERING: Cluster within topic groups first
  if (topicAware) {
    console.log("[preprocess] Using topic-aware clustering...");

    // Group articles by topic
    const topicGroups = new Map<string, T[]>();
    for (const item of items) {
      const topic = item.topic || "general";
      if (!topicGroups.has(topic)) {
        topicGroups.set(topic, []);
      }
      topicGroups.get(topic)!.push(item);
    }

    console.log(`[preprocess] Clustered into ${topicGroups.size} topic groups`);

    // Cluster each topic group separately
    const allClusters: ArticleCluster<T>[] = [];
    topicGroups.forEach((articles, topic) => {
      console.log(
        `[preprocess] Clustering ${articles.length} articles in topic "${topic}"`
      );

      const topicClusters = useGraphClustering
        ? graphBasedClustering(
            articles,
            similarityThreshold,
            preferredPublishers
          )
        : greedyClustering(
            articles,
            similarityThreshold,
            maxClusterSize,
            preferredPublishers
          );

      // Type assertion needed due to generic constraints
      allClusters.push(...(topicClusters as ArticleCluster<T>[]));
    });

    return allClusters;
  }

  // NON-TOPIC-AWARE: Cluster all articles together
  if (useGraphClustering) {
    console.log("[preprocess] Using graph-based clustering...");
    return graphBasedClustering(
      items,
      similarityThreshold,
      preferredPublishers
    );
  } else {
    console.log("[preprocess] Using greedy clustering...");
    return greedyClustering(
      items,
      similarityThreshold,
      maxClusterSize,
      preferredPublishers
    );
  }
}

/**
 * Original greedy clustering algorithm (kept for comparison).
 */
function greedyClustering<
  T extends {
    title: string;
    description: string;
    pubDate: Date;
    publisher: string;
    link: string;
  }
>(
  items: T[],
  similarityThreshold: number,
  maxClusterSize: number,
  preferredPublishers: Set<string>
): ArticleCluster<T>[] {
  if (items.length === 0) return [];

  // Sort by pubDate (newest first) and preferred publishers
  const sorted = [...items].sort((a, b) => {
    // Prefer articles from preferred publishers
    const aPreferred = preferredPublishers.has(a.publisher) ? 1 : 0;
    const bPreferred = preferredPublishers.has(b.publisher) ? 1 : 0;
    if (aPreferred !== bPreferred) return bPreferred - aPreferred;

    // Then sort by freshness
    return b.pubDate.getTime() - a.pubDate.getTime();
  });

  const clusters: ArticleCluster<T>[] = [];

  for (const item of sorted) {
    let bestCluster: ArticleCluster<T> | null = null;
    let bestSimilarity = 0;

    // Find the best matching cluster
    for (const cluster of clusters) {
      if (cluster.members.length >= maxClusterSize) continue;

      // Use combined title + description similarity WITH temporal boost
      const similarity = articleSimilarity(
        item.title,
        item.description || "",
        cluster.representative.title,
        cluster.representative.description || "",
        item.pubDate,
        cluster.representative.pubDate
      );

      if (similarity > bestSimilarity && similarity >= similarityThreshold) {
        bestSimilarity = similarity;
        bestCluster = cluster;
      }
    }

    if (bestCluster) {
      // Add to existing cluster
      bestCluster.members.push(item);

      // Recalculate average similarity
      const totalSim = bestCluster.members.reduce(
        (sum, member) =>
          sum +
          articleSimilarity(
            member.title,
            member.description || "",
            bestCluster!.representative.title,
            bestCluster!.representative.description || "",
            member.pubDate,
            bestCluster!.representative.pubDate
          ),
        0
      );
      bestCluster.averageSimilarity = totalSim / bestCluster.members.length;

      // Optionally update representative if new item is from preferred publisher
      if (
        preferredPublishers.has(item.publisher) &&
        !preferredPublishers.has(bestCluster.representative.publisher)
      ) {
        // Swap representative
        const oldRep = bestCluster.representative;
        bestCluster.representative = item;
        // Replace item in members with old rep
        const idx = bestCluster.members.indexOf(item);
        if (idx !== -1) {
          bestCluster.members[idx] = oldRep;
        }
      }
    } else {
      // Create new cluster
      clusters.push({
        representative: item,
        members: [item],
        averageSimilarity: 1.0,
      });
    }
  }

  return clusters;
}

/**
 * Merge similar clusters after initial clustering.
 * Sometimes greedy clustering creates separate clusters for similar stories.
 * This pass merges clusters whose representatives are similar.
 */
function mergeSimilarClusters<
  T extends { title: string; description: string; pubDate: Date }
>(
  clusters: ArticleCluster<T>[],
  mergeThreshold: number = 0.45 // LOWERED to 0.45 for VERY aggressive merging
): ArticleCluster<T>[] {
  if (clusters.length <= 1) return clusters;

  const merged: ArticleCluster<T>[] = [];
  const used = new Set<number>();

  for (let i = 0; i < clusters.length; i++) {
    if (used.has(i)) continue;

    const current = clusters[i];
    const mergedCluster: ArticleCluster<T> = {
      representative: current.representative,
      members: [...current.members],
      averageSimilarity: current.averageSimilarity,
    };

    // Try to merge with other clusters
    for (let j = i + 1; j < clusters.length; j++) {
      if (used.has(j)) continue;

      const other = clusters[j];
      const similarity = articleSimilarity(
        current.representative.title,
        current.representative.description || "",
        other.representative.title,
        other.representative.description || "",
        current.representative.pubDate,
        other.representative.pubDate
      );

      if (similarity >= mergeThreshold) {
        // Merge other cluster into current
        mergedCluster.members.push(...other.members);
        used.add(j);
      }
    }

    merged.push(mergedCluster);
  }

  return merged;
}

/**
 * Extract only representative articles from clusters.
 */
export function getRepresentatives<T>(clusters: ArticleCluster<T>[]): T[] {
  return clusters.map((cluster) => cluster.representative);
}

// ============================================================================
// Pre-clustering by Section Hints (Fast Path)
// ============================================================================

export interface PreClusteredArticles<T> {
  /** Articles with confirmed section hints (no clustering needed) */
  preClustered: Map<NewsletterSectionHint, T[]>;
  /** Articles with ambiguous hints (need full clustering) */
  needsClustering: T[];
}

/**
 * Pre-cluster articles by section hints when they're unambiguous.
 * This is a fast path that avoids expensive similarity calculations
 * for articles we already know belong to a specific section.
 *
 * An article is "confirmed" if it has exactly ONE section hint that
 * matches a known section (commentaries, business-tech, politics, international, wildcard).
 *
 * Example:
 * - "cnn-opinion" has sectionHints: ["commentaries", "politics"] → needs clustering (ambiguous)
 * - "st-opinion" has sectionHints: ["commentaries"] → pre-clustered as commentaries
 * - "bbc-news" has sectionHints: ["international"] → pre-clustered as international
 */
export function preClusterByHints<
  T extends { sectionHints: NewsletterSectionHint[] }
>(items: T[]): PreClusteredArticles<T> {
  const preClustered = new Map<NewsletterSectionHint, T[]>([
    ["commentaries", []],
    ["international", []],
    ["politics", []],
    ["business", []],
    ["tech", []],
    ["sport", []],
    ["culture", []],
    ["wildcard", []],
  ]);
  const needsClustering: T[] = [];

  for (const item of items) {
    const hints = item.sectionHints || [];

    // Filter to only known section hints (excluding "commentaries" dupes, etc.)
    const validHints = hints.filter((hint) =>
      [
        "commentaries",
        "international",
        "politics",
        "business",
        "tech",
        "sport",
        "culture",
        "wildcard",
      ].includes(hint)
    );

    // If exactly one valid hint, pre-cluster it
    if (validHints.length === 1) {
      const hint = validHints[0];
      preClustered.get(hint)!.push(item);
    } else {
      // Multiple or no valid hints → needs full clustering
      needsClustering.push(item);
    }
  }

  const preClusteredCount = Array.from(preClustered.values()).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  console.log(
    `[preprocess] Pre-clustered ${preClusteredCount} articles by hints, ${needsClustering.length} need full clustering`
  );

  // Log distribution
  preClustered.forEach((articles, hint) => {
    if (articles.length > 0) {
      console.log(`[preprocess]   ${hint}: ${articles.length} articles`);
    }
  });

  return { preClustered, needsClustering };
}

// ============================================================================
// Preprocessing Pipeline
// ============================================================================

export interface PreprocessStats {
  originalCount: number;
  afterDedupeCount: number;
  clusterCount: number;
  representativeCount: number;
  reductionPercent: number;
  processingTimeMs: number;
  preClusteredCount?: number;
}

/**
 * Full preprocessing pipeline with pre-clustering optimization:
 * 1. Dedupe by URL
 * 2. Pre-cluster by unambiguous section hints (fast path)
 * 3. Cluster remaining articles by title similarity
 * 4. Extract representatives
 */
export function preprocessArticles<
  T extends {
    title: string;
    description: string;
    pubDate: Date;
    publisher: string;
    link: string;
    sectionHints: NewsletterSectionHint[];
  }
>(
  items: T[],
  options: ClusterOptions = {}
): {
  representatives: T[];
  clusters: ArticleCluster<T>;
  stats: PreprocessStats;
  preClustered?: Map<NewsletterSectionHint, T[]>;
} {
  const startTime = Date.now();

  // Step 1: Dedupe by URL
  const deduped = dedupeByUrl(items);

  // Step 2: Pre-cluster by unambiguous section hints (OPTIMIZATION)
  const { preClustered, needsClustering } = preClusterByHints(deduped);

  // Step 3: Cluster remaining ambiguous articles by title similarity
  const initialClusters = clusterArticles(needsClustering, options);

  // Step 4: Merge similar clusters (second pass)
  const mergedClusters = mergeSimilarClusters(initialClusters, 0.5); // LOWERED from 0.65

  // Step 5: Extract representatives from clustered articles
  const clusteredRepresentatives = getRepresentatives(mergedClusters);

  // Step 6: Combine pre-clustered articles with clustered representatives
  // Pre-clustered articles don't need further deduplication since they're already
  // from distinct feeds with clear section assignments
  const allRepresentatives = [
    ...clusteredRepresentatives,
    ...Array.from(preClustered.values()).flat(),
  ];

  const processingTimeMs = Date.now() - startTime;

  const preClusteredCount = Array.from(preClustered.values()).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  const stats: PreprocessStats = {
    originalCount: items.length,
    afterDedupeCount: deduped.length,
    clusterCount: mergedClusters.length,
    representativeCount: allRepresentatives.length,
    reductionPercent:
      items.length > 0
        ? Math.round(
            ((items.length - allRepresentatives.length) / items.length) * 100
          )
        : 0,
    processingTimeMs,
    preClusteredCount,
  };

  console.log(
    `[preprocess] Pipeline complete: ${items.length} → ${deduped.length} (deduped) → ${allRepresentatives.length} (final)`
  );
  console.log(
    `[preprocess]   Pre-clustered: ${preClusteredCount}, Clustered: ${clusteredRepresentatives.length}`
  );

  return {
    representatives: allRepresentatives,
    clusters: mergedClusters as any, // Type simplification for export
    stats,
    preClustered,
  };
}

// ============================================================================
// In-Memory Cache (Simple TTL Cache)
// ============================================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class SimpleCache<T> {
  private cache = new Map<string, CacheEntry<T>>();

  set(key: string, value: T, ttlMs: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  clear(): void {
    this.cache.clear();
  }

  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => this.cache.delete(key));
  }
}

// Singleton cache for preprocessed articles (TTL: 30 minutes)
export const articleCache = new SimpleCache<ProcessedNewsItem[]>();

// Cleanup expired entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => articleCache.cleanup(), 5 * 60 * 1000);
}
