import { generateNewsletterPlanPreview } from "@/lib/llm";
import {
  buildHtml,
  buildText,
  type FormattedArticles,
} from "@/lib/email-render";

// Re-export client-safe render helpers so existing server-side callers
// can keep importing from this module.
export * from "@/lib/email-render";

type PlanGenerationResult = {
  plan: LLMNewsletterPlan;
  metadata: FormattedArticles["aiMetadata"];
};

const collectUniqueArticles = (
  topics: TopicNewsGroup[]
): ProcessedNewsItem[] => {
  const seenLinks = new Set<string>();
  const uniqueArticles: ProcessedNewsItem[] = [];

  for (const group of topics) {
    for (const item of group.items) {
      if (seenLinks.has(item.link)) {
        continue;
      }
      seenLinks.add(item.link);
      uniqueArticles.push(item);
    }
  }

  uniqueArticles.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return uniqueArticles;
};

const finalizeFormattedArticles = (
  topics: TopicNewsGroup[],
  uniqueArticles: ProcessedNewsItem[],
  planResult: PlanGenerationResult
): FormattedArticles => {
  const totalTopics = topics.length;
  const totalArticles = uniqueArticles.length;
  const totalPublishers = new Set(topics.map((group) => group.publisher)).size;

  const formatted: FormattedArticles = {
    plan: planResult.plan,
    html: "",
    text: "",
    totalTopics,
    totalArticles,
    totalPublishers,
    aiMetadata: planResult.metadata,
  };

  formatted.html = buildHtml(formatted);
  formatted.text = buildText(formatted);

  return formatted;
};

export const formatArticlesWithoutLLM = async (
  topics: TopicNewsGroup[],
  fallbackReason = "Preview mode without Groq"
): Promise<FormattedArticles> => {
  const uniqueArticles = collectUniqueArticles(topics);
  const planResult = generateNewsletterPlanPreview(
    uniqueArticles,
    fallbackReason
  );

  return finalizeFormattedArticles(topics, uniqueArticles, planResult);
};