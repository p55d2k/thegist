# ZK Daily Intelligence Brief

A Next.js-based newsletter application that aggregates and emails curated commentaries from a curated list of publishers. The app fetches opinion pieces, groups them by topics, and sends personalized email digests to subscribers.

## Features

- **AI-Powered Curation**: Uses Google Gemini AI to intelligently organize articles into thematic sections (commentaries, international news, politics, business & tech, and a wildcard piece).
- **Multi-Publisher Aggregation**: Pulls commentary feeds from ChannelNewsAsia, CNN, The Guardian, BBC, NPR, and Al Jazeera.
- **Smart Filtering**: Keeps only commentary articles (based on per-feed rules) from the last 24 hours and drops duplicates across sources.
- **Section-Based Organization**: Articles are categorized into Commentaries (5-7 pieces), International (2-3), Politics (2-3), Business & Tech (2-3), and one Wildcard.
- **Email Delivery**: Sends a responsive HTML newsletter with optional imagery plus a plaintext fallback.
- **Email Preview**: Preview the newsletter HTML and plaintext content before sending via a dedicated page.
- **Background Processing**: Newsletter generation and sending happens asynchronously to avoid timeouts.
- **API-Driven**: Provides RESTful endpoints for news aggregation and newsletter sending.
- **Image Support**: Extracts and includes article images from RSS feeds where available.

## Tech Stack

- **Framework**: Next.js 14 with TypeScript
- **AI**: Google Gemini 2.5 Flash for newsletter planning and curation
- **Styling**: Tailwind CSS (for potential frontend, though this is API-focused)
- **Email**: Nodemailer with Gmail SMTP
- **RSS Parsing**: xml2js
- **HTTP Client**: Axios
- **Runtime**: Bun (recommended for development)

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/p55d2k/zk-newsletter.git
   cd zk-newsletter
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Set up environment variables. Create a `.env.local` file in the root directory:

   ```env
   GOOGLE_USER_EMAIL=your-gmail@gmail.com
   GOOGLE_APP_PASSWORD=your-app-password
   GEMINI_API_KEY=your-gemini-api-key
   ```

   - `GOOGLE_USER_EMAIL`: Your Gmail address for sending emails.
   - `GOOGLE_APP_PASSWORD`: Generate an app password from Google Account settings (enable 2FA first).
   - `GEMINI_API_KEY`: Your Google Gemini API key for AI-powered curation.

4. Configure recipients in `app/constants/recipients.ts`:
   ```typescript
   export const recipients = [
     "recipient1@example.com",
     "recipient2@example.com",
     // Add more emails
   ];
   ```

## Usage

### Development

Start the development server:

```bash
bun run dev
```

The app will be available at `http://localhost:3000`.

### Email Preview

Visit `http://localhost:3000/email-preview` to preview the newsletter content and styling before sending.

### Gemini Testing

Visit `http://localhost:3000/gemini-test` to test Gemini API configurations and debug newsletter generation.

### Building and Running

Build the project:

```bash
bun run build
```

Start the production server:

```bash
bun run start
```

### API Endpoints

#### GET `/api/news`

Fetches and aggregates commentary articles from all configured RSS feeds.

**Response:**

```json
{
  "message": "Retrieved X commentary items across Y topic feeds",
  "count": 123,
  "topics": [
    {
      "topic": "Latest",
      "slug": "cna-latest",
      "publisher": "Channel NewsAsia",
      "sectionHints": ["international", "politics", "business-tech"],
      "items": [
        {
          "title": "Article Title",
          "description": "Article description...",
          "link": "https://...",
          "pubDate": "2025-09-29T10:00:00.000Z",
          "source": "ChannelNewsAsia",
          "publisher": "ChannelNewsAsia",
          "topic": "Latest",
          "slug": "cna-latest",
          "sectionHints": ["international"],
          "imageUrl": "https://..." // optional
        }
      ]
    }
  ],
  "news": [...] // flattened array
}
```

#### GET `/api/newsletter`

Triggers the newsletter sending process. Fetches commentaries, uses AI to organize them into sections, formats them, and emails to recipients. Processing happens in the background.

**Response:**

```json
{
  "message": "Newsletter generation and sending started",
  "summary": {
    "totalArticles": 5,
    "totalTopics": 3,
    "totalPublishers": 2
  }
}
```

#### GET `/api/gemini-test`

Tests available Gemini models and API connectivity.

#### POST `/api/gemini-debug`

Debugs newsletter generation with different dataset sizes.

#### POST `/api/gemini-config-test`

Tests different Gemini configuration options.

### Customization

- **RSS Feeds**: Modify topics and URLs in `app/constants/links.ts`.
- **Email Templates**: Update styling and layout in `lib/email.ts`.
- **AI Planning**: Customize Gemini prompts and section logic in `lib/gemini.ts`.
- **Date/Time Utilities**: Customize greetings and formatting in `lib/date.ts`.

## Environment Variables

- `GOOGLE_USER_EMAIL`: Gmail address for sending emails.
- `GOOGLE_APP_PASSWORD`: Gmail app password.
- `GEMINI_API_KEY`: Google Gemini API key for AI curation.
- `GEMINI_MODEL`: Optional, defaults to "gemini-2.5-flash".

## Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Commit changes: `git commit -am 'Add your feature'`.
4. Push to the branch: `git push origin feature/your-feature`.
5. Submit a pull request.

## License

This project is private and not licensed for public use.

## Notes

- Ensure Gmail account has 2FA enabled for app passwords.
- The app uses a user-agent header to mimic browser requests for RSS feeds.
- Emails are sent with no-cache headers to ensure fresh content.
- Newsletter generation uses background processing to avoid cron timeouts.
- AI curation falls back to heuristic selection if Gemini API fails.
- For production deployment, consider using a service like Vercel or Railway for Next.js hosting.
