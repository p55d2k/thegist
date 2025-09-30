import {
  generateNewsletterPlan,
  generateNewsletterPlanFallback,
} from "@/lib/gemini";
import { getGreeting, getTimeBasedGreeting } from "@/lib/date";

export interface FormattedArticles {
  plan: GeminiNewsletterPlan;
  html: string;
  text: string;
  totalTopics: number;
  totalArticles: number;
  totalPublishers: number;
  aiMetadata: {
    model: string;
    usedFallback: boolean;
    fallbackReason?: string;
  };
}

const SECTION_COPY: Record<
  keyof Omit<GeminiNewsletterPlan, "essentialReads" | "summary">,
  { title: string; subtitle: string }
> = {
  commentaries: {
    title: "Commentaries",
    subtitle: "Top 5-7 analysis pieces offering sharp perspective.",
  },
  international: {
    title: "International main news",
    subtitle: "Top 2-3 global developments to monitor.",
  },
  politics: {
    title: "Politics",
    subtitle: "Top 2-3 policy, governance or campaign moves.",
  },
  businessAndTech: {
    title: "Business & tech",
    subtitle: "Top 2-3 market, corporate or technology signals.",
  },
  wildCard: {
    title: "Wild card / special",
    subtitle: "One contrarian or unexpected read to stretch thinking.",
  },
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
  decodeHtmlEntities(
    value
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );

const truncate = (value: string, length = 220): string =>
  value.length > length ? `${value.slice(0, length - 1)}…` : value;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);

const formatMeta = (item: NewsletterSectionItem): string => {
  const formattedDate = formatDate(new Date(item.pubDate));
  return `${escapeHtml(item.publisher)} · ${escapeHtml(
    item.topic
  )} · ${escapeHtml(formattedDate)}`;
};

const renderHighlightCard = (
  item: NewsletterSectionItem,
  index: number
): string => {
  return `<article style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin-bottom: 12px;">
    <span style="font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">#${
      index + 1
    }</span>
    <h3 style="font-size: 16px; font-weight: 500; line-height: 1.5; color: #1e293b; margin: 12px 0;">${escapeHtml(
      item.title
    )}</h3>
    <p style="font-size: 14px; line-height: 1.5; color: #64748b; margin: 12px 0;">${escapeHtml(
      truncate(stripHtml(item.summary), 200)
    )}</p>
    <a style="display: inline-block; border-radius: 6px; background-color: #1e293b; padding: 8px 16px; font-size: 14px; font-weight: 500; color: #ffffff; text-decoration: none; margin: 12px 0;" href="${escapeHtml(
      item.link
    )}">Read more</a>
    <div style="font-size: 12px; color: #64748b; margin-top: 12px;">${formatMeta(
      item
    )}</div>
  </article>`;
};

const renderSectionCards = (items: NewsletterSectionItem[]): string =>
  items
    .map(
      (
        item
      ) => `<article style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
        <h3 style="font-size: 16px; font-weight: 500; line-height: 1.5; color: #1e293b; margin: 0 0 12px 0;">${escapeHtml(
          item.title
        )}</h3>
        <p style="font-size: 14px; line-height: 1.5; color: #64748b; margin: 0 0 12px 0;">${escapeHtml(
          truncate(stripHtml(item.summary))
        )}</p>
        <a style="display: inline-block; border-radius: 6px; background-color: #1e293b; padding: 8px 16px; font-size: 14px; font-weight: 500; color: #ffffff; text-decoration: none; margin: 12px 0;" href="${escapeHtml(
          item.link
        )}">Open story</a>
        <div style="font-size: 12px; color: #64748b; margin-top: 12px;">${formatMeta(
          item
        )}</div>
    </article>`
    )
    .join("");

const renderSection = (
  key: keyof typeof SECTION_COPY,
  items: NewsletterSectionItem[]
): string => {
  if (items.length === 0) {
    return "";
  }

  const { title, subtitle } = SECTION_COPY[key];

  return `<section style="margin-bottom: 32px; border-top: 1px solid #e2e8f0; padding-top: 32px;">
    <div style="margin-bottom: 16px;">
      <h2 style="font-size: 16px; font-weight: 600; color: #1e293b; margin: 0 0 8px 0;">${escapeHtml(
        title
      )}</h2>
      <p style="font-size: 14px; color: #64748b; margin: 0;">${escapeHtml(
        subtitle
      )}</p>
    </div>
    <div>${renderSectionCards(items)}</div>
  </section>`;
};

const renderWildCard = (items: NewsletterSectionItem[]): string => {
  if (items.length === 0) {
    return "";
  }

  const [item] = items;

  return `<section style="margin-bottom: 32px; border-top: 1px solid #e2e8f0; padding-top: 32px;">
    <div style="margin-bottom: 16px;">
      <h2 style="font-size: 16px; font-weight: 600; color: #1e293b; margin: 0 0 8px 0;">${escapeHtml(
        SECTION_COPY.wildCard.title
      )}</h2>
      <p style="font-size: 14px; color: #64748b; margin: 0;">${escapeHtml(
        SECTION_COPY.wildCard.subtitle
      )}</p>
    </div>
    <article style="background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 24px;">
      <h3 style="font-size: 16px; font-weight: 500; line-height: 1.5; color: #1e293b; margin: 0 0 12px 0;">${escapeHtml(
        item.title
      )}</h3>
      <p style="font-size: 14px; line-height: 1.5; color: #64748b; margin: 0 0 12px 0;">${escapeHtml(
        truncate(stripHtml(item.summary), 260)
      )}</p>
      <a style="display: inline-block; border-radius: 6px; background-color: #1e293b; padding: 8px 16px; font-size: 14px; font-weight: 500; color: #ffffff; text-decoration: none; margin: 12px 0;" href="${escapeHtml(
        item.link
      )}">Explore the wildcard</a>
      <div style="font-size: 12px; color: #64748b; margin-top: 12px;">${formatMeta(
        item
      )}</div>
    </article>
  </section>`;
};

const buildHtml = (formatted: FormattedArticles): string => {
  const {
    plan: {
      essentialReads,
      commentaries,
      international,
      politics,
      businessAndTech,
      wildCard,
      summary,
    },
    totalArticles,
    totalTopics,
    totalPublishers,
    aiMetadata,
  } = formatted;

  const aiBadge = aiMetadata.usedFallback
    ? `Structured with heuristics${
        aiMetadata.fallbackReason
          ? ` (${escapeHtml(aiMetadata.fallbackReason)})`
          : ""
      }`
    : `AI-assisted via ${escapeHtml(aiMetadata.model)}`;

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        /* Email-safe styles */
        body {
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }
        .email-container {
          max-width: 680px;
          margin: 0 auto;
          padding: 0 24px;
        }
        .summary-separator {
          opacity: 0.6;
        }
        @media only screen and (max-width: 640px) {
          .email-container {
            padding-left: 16px !important;
            padding-right: 16px !important;
          }
        }
      </style>
    </head>
    <body style="background-color: #f8fafc; padding: 40px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #0f172a; margin: 0;">
      <div class="email-container">
        <main style="overflow: hidden; border-radius: 12px; border: 1px solid #e2e8f0; background-color: #ffffff; padding: 32px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
          <header style="margin-bottom: 32px; text-align: center;">
            <h1 style="font-size: 30px; font-weight: 600; letter-spacing: -0.025em; color: #0f172a; margin: 0 0 16px 0;">
              Good ${getGreeting()}!
            </h1>
            <p style="font-size: 14px; line-height: 1.5; color: #64748b; margin: 0 0 16px 0;">
              ${getTimeBasedGreeting()} Let's dive into today's essential reads.
            </p>
            <div style="display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; border-radius: 6px; border: 1px solid #e2e8f0; background-color: #f8fafc; padding: 4px 12px; font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">
              <span>${totalArticles} articles</span>
              <span class="summary-separator" style="color: #94a3b8;">•</span>
              <span>${totalTopics} topics</span>
              <span class="summary-separator" style="color: #94a3b8;">•</span>
              <span>${totalPublishers} publishers</span>
            </div>
          </header>
          
          <div style="margin-bottom: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background-color: #f8fafc; padding: 16px; font-size: 14px; line-height: 1.5; color: #334155;">
            ${escapeHtml(summary)}
          </div>
          
          <section style="margin-bottom: 32px;">
            <div style="margin-bottom: 16px;">
              <h2 style="font-size: 16px; font-weight: 600; color: #1e293b; margin: 0 0 8px 0;">Today's essential reads</h2>
              <p style="font-size: 14px; color: #64748b; margin: 0;">${escapeHtml(
                essentialReads.overview
              )}</p>
            </div>
            <div>
              ${essentialReads.highlights
                .map((item, index) => renderHighlightCard(item, index))
                .join("")}
            </div>
          </section>
          
          ${renderSection("commentaries", commentaries)}
          ${renderSection("international", international)}
          ${renderSection("politics", politics)}
          ${renderSection("businessAndTech", businessAndTech)}
          ${renderWildCard(wildCard)}
          
          <footer style="margin-top: 32px; text-align: center; font-size: 14px; color: #64748b;">
            <p style="margin: 0 0 16px 0;">With appreciation,<br/>ZK Daily Intelligence Team</p>
            <span style="display: inline-block; border-radius: 6px; border: 1px solid #e2e8f0; background-color: #f8fafc; padding: 4px 12px; font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">
              ${aiBadge}
            </span>
          </footer>
        </main>
      </div>
    </body>
  </html>`;
};

const buildText = (formatted: FormattedArticles): string => {
  const {
    plan: {
      essentialReads,
      commentaries,
      international,
      politics,
      businessAndTech,
      wildCard,
      summary,
    },
    totalArticles,
    totalTopics,
    totalPublishers,
    aiMetadata,
  } = formatted;

  const sectionToText = (
    title: string,
    items: NewsletterSectionItem[],
    label: string
  ): string => {
    if (items.length === 0) {
      return "";
    }

    const heading = `${title.toUpperCase()} (${label})`;
    const entries = items
      .map((item, index) => {
        const description = truncate(stripHtml(item.summary));
        return `${index + 1}. ${item.title}\n${description}\n${item.link}`;
      })
      .join("\n\n");

    return `${heading}\n${entries}`;
  };

  const highlights = essentialReads.highlights
    .map((item, index) => {
      const description = truncate(stripHtml(item.summary));
      return `${index + 1}. ${item.title} — ${description} (${item.link})`;
    })
    .join("\n");

  const textSections = [
    `SUMMARY\n${summary}`,
    `TODAY'S ESSENTIAL READS\n${essentialReads.overview}\n\nHighlights:\n${highlights}`,
    sectionToText("Commentaries", commentaries, "Top 5-7"),
    sectionToText("International main news", international, "Top 2-3"),
    sectionToText("Politics", politics, "Top 2-3"),
    sectionToText("Business & tech", businessAndTech, "Top 2-3"),
    sectionToText("Wild card / special", wildCard, "1 unexpected"),
    `Totals: ${totalArticles} articles · ${totalTopics} topics · ${totalPublishers} publishers` +
      (aiMetadata.usedFallback
        ? `\nStructured with heuristics${
            aiMetadata.fallbackReason ? ` (${aiMetadata.fallbackReason})` : ""
          }`
        : `\nAI-assisted via ${aiMetadata.model}`),
  ].filter(Boolean);

  return textSections.join("\n\n");
};

type PlanGenerationResult = {
  plan: GeminiNewsletterPlan;
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

export const formatArticles = async (
  topics: TopicNewsGroup[]
): Promise<FormattedArticles> => {
  const uniqueArticles = collectUniqueArticles(topics);
  const planResult = await generateNewsletterPlan(uniqueArticles);

  return finalizeFormattedArticles(topics, uniqueArticles, planResult);
};

export const formatArticlesWithoutGemini = async (
  topics: TopicNewsGroup[],
  fallbackReason = "Preview mode without Gemini"
): Promise<FormattedArticles> => {
  const uniqueArticles = collectUniqueArticles(topics);
  const planResult = generateNewsletterPlanFallback(
    uniqueArticles,
    fallbackReason
  );

  return finalizeFormattedArticles(topics, uniqueArticles, planResult);
};

export const formatRawBody = (
  formattedArticles: FormattedArticles,
  id: string
): string => {
  const intro = `${getTimeBasedGreeting()} We've curated ${
    formattedArticles.plan.commentaries.length +
    formattedArticles.plan.international.length +
    formattedArticles.plan.politics.length +
    formattedArticles.plan.businessAndTech.length +
    formattedArticles.plan.wildCard.length
  } standout pieces today.`;

  return `Good ${getGreeting()}!\n\n${intro}\n\n${
    formattedArticles.text
  }\n\nBest regards,\nZK Daily Intelligence Team\n${
    formattedArticles.aiMetadata.usedFallback
      ? `Structured with heuristics${
          formattedArticles.aiMetadata.fallbackReason
            ? ` (${formattedArticles.aiMetadata.fallbackReason})`
            : ""
        }\n`
      : `AI-assisted via ${formattedArticles.aiMetadata.model}\n`
  }ID: ${id}`;
};

export const formatBody = (
  formattedArticles: FormattedArticles,
  id: string
): string => {
  const html = buildHtml(formattedArticles);
  return html.replace(
    "</footer>",
    `<small style="display:block;margin-top:12px;color:#b3bad0;">ID: ${escapeHtml(
      id
    )}</small></footer>`
  );
};
