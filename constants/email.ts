// Email configuration constants
export const EMAIL_CONFIG = {
  smtp: {
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
  },
  from: (userEmail: string) => `"The Gist" <${userEmail}>`,
  defaultSubject: (dateString: string) => `The Gist | ${dateString}`,
} as const;

// Email content constants
export const EMAIL_CONTENT = {
  truncateLength: 220,
  summaryTruncateLength: 200,
  wildCardTruncateLength: 260,
  dateLocale: "en-SG" as const,
  dateOptions: {
    dateStyle: "medium" as const,
    timeStyle: "short" as const,
  },
} as const;

// HTML entity mappings for email processing
export const HTML_ENTITIES = {
  named: {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  },
} as const;
