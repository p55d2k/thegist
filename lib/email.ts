import { getGreeting, getTime, getTimeBasedGreeting } from "@/lib/date";

export interface FormattedArticles {
  html: string;
  text: string;
  totalTopics: number;
  totalArticles: number;
  totalPublishers: number;
}

const stripHtml = (value: string): string =>
  value.replace(/<[^>]*>/g, "").trim();

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

const buildHtmlSections = (topics: TopicNewsGroup[]): string => {
  if (topics.length === 0) {
    return `<div class="empty-state">
      <p>No fresh commentary pieces were available across your sources in the last 24 hours. We'll keep listening for the next update!</p>
    </div>`;
  }

  return topics
    .map((group) => {
      const publisher = escapeHtml(group.publisher);
      const topic = escapeHtml(group.topic);
      const cards = group.items
        .map((article) => {
          const cleanDescription = truncate(stripHtml(article.description));
          const formattedDate = formatDate(article.pubDate);
          const title = escapeHtml(article.title);
          const description = escapeHtml(cleanDescription);
          const link = escapeHtml(article.link);

          const imageSrc = article.imageUrl
            ? escapeHtml(article.imageUrl)
            : null;

          const imageMarkup = imageSrc
            ? `<div class="article-image">
                <img src="${imageSrc}" alt="${title}" width="260" height="160" style="display:block;width:100%;height:auto;border-radius:12px 12px 0 0;object-fit:cover;" />
              </div>`
            : "";

          return `<article class="article-card">
              ${imageMarkup}
              <div class="article-content">
                <h3>${title}</h3>
                <p>${description}</p>
                <a class="cta" href="${link}">Read full story</a>
                <div class="meta">Published ${formattedDate} · ${escapeHtml(
            article.source
          )}</div>
              </div>
            </article>`;
        })
        .join("");

      return `<section class="topic-section">
        <div class="topic-header">
          <span class="publisher-tag">${publisher}</span>
          <h2>${topic}</h2>
        </div>
        <div class="card-grid">${cards}</div>
      </section>`;
    })
    .join("");
};

const buildTextSections = (topics: TopicNewsGroup[]): string => {
  if (topics.length === 0) {
    return "No fresh commentary pieces were available across your sources in the last 24 hours.";
  }

  return topics
    .map((group) => {
      const entries = group.items
        .map((article, index) => {
          const cleanDescription = truncate(stripHtml(article.description));
          return `${index + 1}. ${article.title}
${cleanDescription}
${article.link}`;
        })
        .join("\n\n");

      const heading = `${group.publisher.toUpperCase()} • ${group.topic.toUpperCase()}`;
      return `${heading}\n${entries}`;
    })
    .join("\n\n");
};

export const formatArticles = (topics: TopicNewsGroup[]): FormattedArticles => {
  const totalArticles = topics.reduce(
    (sum, group) => sum + group.items.length,
    0
  );

  const publisherCount = new Set(topics.map((group) => group.publisher)).size;

  return {
    html: buildHtmlSections(topics),
    text: buildTextSections(topics),
    totalTopics: topics.length,
    totalArticles,
    totalPublishers: publisherCount,
  };
};

export const formatRawBody = (
  formattedArticles: FormattedArticles,
  id: string
): string => {
  const intro = `${getTimeBasedGreeting()} Here are ${
    formattedArticles.totalArticles
  } curated commentaries from ${
    formattedArticles.totalTopics
  } topic feeds across ${formattedArticles.totalPublishers} publishers.`;

  return `Good ${getGreeting()}!\n\n${intro}\n\n${
    formattedArticles.text
  }\n\nBest Regards,\nZK's ${getTime()} Commentary Newsletter\n\nID: ${id}`;
};

export const formatBody = (
  formattedArticles: FormattedArticles,
  id: string
): string => {
  return `<!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        body {
          margin: 0;
          padding: 16px 0;
          background-color: #f3f4f7;
          font-family: Arial, 'Helvetica Neue', sans-serif;
          color: #2b3142;
        }
        .container {
          max-width: 640px;
          margin: 0 auto;
          padding: 0 20px;
        }
        .newsletter-card {
          background: #ffffff;
          border: 1px solid #e2e6ef;
          border-radius: 18px;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
          padding: 28px 26px;
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
          color: #182033;
        }
        .header p {
          margin: 10px 0 0;
          color: #4a5264;
          font-size: 15px;
          line-height: 1.45;
        }
        .summary {
          display: inline-block;
          padding: 6px 12px;
          margin-top: 14px;
          border-radius: 12px;
          background: #eef1fb;
          color: #3e4b87;
          font-weight: 600;
          font-size: 13px;
        }
        .topic-section {
          margin-top: 24px;
          border-top: 1px solid #edf0f6;
          padding-top: 20px;
        }
        .topic-header {
          margin-bottom: 14px;
        }
        .topic-header h2 {
          margin: 6px 0 0;
          font-size: 18px;
          font-weight: 600;
          color: #1d2536;
        }
        .publisher-tag {
          display: inline-block;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.08em;
          color: #3e4b87;
          text-transform: uppercase;
        }
        .card-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }
        .article-card {
          background: #fafbff;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid #e6e9f4;
        }
        .article-card .article-content {
          padding: 18px 20px 20px;
        }
        .article-card h3 {
          margin: 0 0 8px;
          font-size: 17px;
          line-height: 1.4;
          color: #1d2536;
        }
        .article-card p {
          margin: 0;
          font-size: 14px;
          line-height: 1.55;
          color: #4b5368;
        }
        .cta {
          display: inline-block;
          margin-top: 14px;
          padding: 9px 14px;
          border-radius: 8px;
          background: #3e4b87;
          color: #ffffff !important;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
        }
        .meta {
          margin-top: 10px;
          font-size: 12px;
          color: #6d7488;
        }
        .empty-state {
          background: #f9faff;
          border: 1px dashed #cbd3eb;
          border-radius: 14px;
          padding: 22px;
          text-align: center;
          color: #4a5264;
        }
        .footer {
          margin-top: 28px;
          text-align: center;
          font-size: 13px;
          color: #717a90;
        }
        .footer small {
          display: block;
          margin-top: 8px;
          color: #a2a9c0;
        }
        @media only screen and (max-width: 640px) {
          body {
            padding: 0;
            background: #ffffff;
          }
          .newsletter-card {
            border-radius: 0;
            border: none;
            box-shadow: none;
            padding: 24px 18px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="newsletter-card">
          <div class="header">
            <h1>Good ${getGreeting()}!</h1>
            <p>${getTimeBasedGreeting()} Here's a quick look at today's commentary picks.</p>
            <span class="summary">${
              formattedArticles.totalArticles
            } commentaries · ${formattedArticles.totalTopics} topics · ${
    formattedArticles.totalPublishers
  } sources</span>
          </div>
          ${formattedArticles.html}
          <div class="footer">
            <p>Kind regards,<br/>ZK's ${getTime()} Commentary Newsletter</p>
            <small>ID: ${id}</small>
          </div>
        </div>
      </div>
    </body>
  </html>`;
};
