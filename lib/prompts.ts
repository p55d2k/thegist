import { SECTION_LIMITS, SECTION_HINT_MAP } from "@/constants/llm";

type PlanGenerationOptions = {
  topicKey: keyof Omit<LLMNewsletterPlan, "essentialReads" | "summary">;
  alreadySelectedTitles?: string[];
};

/**
 * Builds a detailed prompt for ranking articles in a specific newsletter section.
 * The prompt provides context about the newsletter's purpose and structure.
 */
export const buildPlanPrompt = (
  dataset: string,
  options: PlanGenerationOptions
): string => {
  const targetTopic = options.topicKey;
  const alreadySelectedTitles = options.alreadySelectedTitles;
  const sectionLimit = SECTION_LIMITS[targetTopic];
  const sectionHint = SECTION_HINT_MAP[targetTopic];

  const context = `You are helping curate "The Gist" - a daily newsletter that aggregates and organizes the most important news and commentary from multiple publishers into thematic sections.

The newsletter covers:
- Commentaries: Opinion pieces and analysis (5-7 articles)
- International: Global news and events (2-3 articles)
- Politics: Government, policy, and elections (2-3 articles)
- Business: Markets, economy, and industry (2-3 articles)
- Tech: Technology, AI, and innovation (2-3 articles)
- Sport: Sports news and events (2-3 articles)
- Culture: Arts, literature, and cultural events (2-3 articles)
- Entertainment: Celebrities, movies, TV, music (1-2 articles)
- Science: Research, discoveries, and breakthroughs (1-2 articles)
- Lifestyle: Health, travel, food, fashion (1-2 articles)
- Wildcard: Special features or trending topics (1 article)

Your task is to select the most relevant articles for the "${targetTopic}" section, focusing on impact, timeliness, credibility, uniqueness, and engagement.`;

  let prompt = [
    context,
    "",
    `Rank the most relevant ${targetTopic} articles by: impact, timeliness, credibility, uniqueness, engagement.`,
    "",
    `Format: ${targetTopic}|<id>|brief_summary`,
    `Example: ${targetTopic}|a001|Apple announces revolutionary AI breakthrough.`,
    "",
    `Rules: exact format only, rank best to worst, ${sectionLimit} articles maximum, 1 sentence summaries max 50 words (only if original description inadequate), avoid duplicate topics.`,
    "",
    "DATASET:",
    dataset,
  ].join("\n");

  if (alreadySelectedTitles && alreadySelectedTitles.length > 0) {
    const titlesList = alreadySelectedTitles
      .map((title, i) => `${i + 1}. ${title}`)
      .join("\n");
    prompt = [
      context,
      "",
      `Rank the most relevant ${targetTopic} articles by: impact, timeliness, credibility, uniqueness, engagement.`,
      "",
      `IMPORTANT: Avoid articles about topics already covered in other sections. Recent selected articles from other sections (sample):`,
      titlesList,
      "",
      `Format: ${targetTopic}|<id>|brief_summary`,
      `Example: ${targetTopic}|a001|Apple announces revolutionary AI breakthrough.`,
      "",
      `Rules: exact format only, rank best to worst, ${sectionLimit} articles maximum, 1 sentence summaries max 50 words (only if original description inadequate), avoid duplicate topics.`,
      "",
      "DATASET:",
      dataset,
    ].join("\n");
  }

  return prompt;
};

/**
 * Builds a simplified prompt for ranking articles in a specific newsletter section.
 * Used for faster processing with less detailed requirements.
 */
export const buildSimplePlanPrompt = (
  dataset: string,
  options: PlanGenerationOptions
): string => {
  const targetTopic = options.topicKey;
  const alreadySelectedTitles = options.alreadySelectedTitles;
  const sectionLimit = SECTION_LIMITS[targetTopic];

  const context = `You are curating articles for "The Gist" newsletter, which organizes daily news into thematic sections. Select the top articles for the "${targetTopic}" section based on importance and relevance.`;

  let prompt = [
    context,
    "",
    `Rank top ${targetTopic} articles by importance.`,
    `Format: ${targetTopic}|<id>|brief summary`,
    `Rules: no extra text, one per line, up to ${sectionLimit} articles, avoid duplicate topics. Only generate summaries if original description is inadequate.`,
    "",
    "Dataset:",
    dataset,
  ].join("\n");

  if (alreadySelectedTitles && alreadySelectedTitles.length > 0) {
    const titlesList = alreadySelectedTitles
      .map((title, i) => `${i + 1}. ${title}`)
      .join("\n");
    prompt = [
      context,
      "",
      `Rank top ${targetTopic} articles by importance.`,
      "",
      `IMPORTANT: Avoid articles about topics already covered in other sections. Recent selected articles from other sections (sample):`,
      titlesList,
      "",
      `Format: ${targetTopic}|<id>|brief summary`,
      `Rules: no extra text, one per line, up to ${sectionLimit} articles, avoid duplicate topics. Only generate summaries if original description is inadequate.`,
      "",
      "Dataset:",
      dataset,
    ].join("\n");
  }

  return prompt;
};

/**
 * Builds a prompt for generating newsletter overview, summary, and highlights.
 * Provides context about the newsletter's structure and audience.
 */
export const buildOverviewPrompt = (serializedDataset: string): string => {
  const context = `You are the editor of "The Gist" - a daily newsletter that curates the most essential news and commentary from multiple publishers.

The newsletter organizes articles into sections: Commentaries, International, Politics, Business, Tech, Sport, Culture, Entertainment, Science, Lifestyle, and Wildcard.

Your task is to create a compelling overview that captures the key themes and most important stories of the day, appealing to educated readers interested in current events, analysis, and diverse perspectives.`;

  return [
    context,
    "",
    "Generate newsletter overview, summary, highlights from selected articles.",
    "",
    "Format:",
    "OVERVIEW: [2-3 sentence overview]",
    "SUMMARY: [1 sentence summary]",
    "HIGHLIGHTS: [top 4 article IDs, e.g., a001,a002,a003,a004]",
    "",
    "Dataset:",
    serializedDataset,
  ].join("\n");
};

/**
 * System prompt for newsletter overview generation.
 */
export const OVERVIEW_SYSTEM_PROMPT =
  "Newsletter editor: create compelling overviews focusing on key themes and important stories. Write in an engaging, journalistic style that highlights the day's most significant developments and provides context for readers.";
