# The Gist

A Next.js-based newsletter application that aggregates, deduplicates, and emails curated commentaries from multiple publishers. The app fetches opinion pieces, deduplicates and organizes them into thematic sections using AI, and sends personalized email digests to subscribers.

## Features

- **AI-Powered Curation**: Uses Groq's Gemma 2 9B Instruct model to intelligently organize articles into thematic sections (commentaries, international news, politics, business, tech, sport, culture, entertainment, science, lifestyle, and a wildcard piece).
- **Incremental Topic Processing**: Processes one topic per API call for better fault tolerance and progress tracking.
- **Idempotent Partial Storage**: Newsletter plans are stored incrementally, allowing safe re-processing of individual topics.
- **Multi-Publisher Aggregation**: Pulls commentary feeds from ChannelNewsAsia, CNN, The Guardian, BBC, NPR, and Al Jazeera.
- **Smart Filtering**: Keeps only commentary articles (based on per-feed rules) from the last 24 hours, limits to the 10 most recent articles per RSS feed, and drops duplicates across sources.
- **Section-Based Organization**: Articles are categorized into Commentaries (5-7 pieces), International (2-3), Politics (2-3), Business (2-3), Tech (2-3), Sport (2-3), Culture (2-3), Entertainment (1-2), Science (1-2), Lifestyle (1-2), and one Wildcard.
- **Email Delivery**: Sends a responsive HTML newsletter with optional imagery plus a plaintext fallback.
- **Email Preview**: Preview the newsletter HTML and plaintext content before sending via a dedicated page.
- **Background Processing**: Newsletter generation and sending happens asynchronously to avoid timeouts.
  (On Vercel this uses the `waitUntil` API to run processing after the response is returned.)
- **API-Driven**: Provides RESTful endpoints for news aggregation and newsletter sending.
- **Image Support**: Extracts and includes article images from RSS feeds where available.
- **Subscriber Management**: Firebase-powered subscription system with email validation and storage.
- **Modern UI**: Responsive landing page with animated components and newsletter subscription form.
- **Dynamic Recipient Lists**: Automatically fetches active subscribers from Firestore instead of static lists.

## Tech Stack

- **Framework**: Next.js 14 with TypeScript
- **AI**: Groq openai/gpt-oss-20b (via Groq SDK) for newsletter planning and curation
- **Database**: Firebase/Firestore for subscriber management and partial plan storage
- **Styling**: Tailwind CSS with Framer Motion animations
- **Email**: Nodemailer with Gmail SMTP
- **RSS Parsing**: xml2js
- **HTTP Client**: Axios
- **Testing**: Vitest with comprehensive API endpoint testing
- **Runtime**: Bun (recommended for development)
- **Architecture**: Modular API design with topic-based processing and orchestration

## Testing

Run the test suite:

```bash
bun run test
```

The test suite includes:

- **News helpers**: Article deduplication and summarization tests
- **LLM API**: Topic-based processing, incremental processing, and partial storage tests targeting the Groq-backed Gemma route
- **Mocked dependencies**: Firebase Firestore and Groq chat completion mocks for reliable testing

## Installation

### Prerequisites

Before setting up the project, you'll need to create accounts and obtain API keys:

1. **Groq Account**: Sign up at [console.groq.com](https://console.groq.com/signup) to get an API key with access to the Gemma 2 9B Instruct model.
2. **Firebase Project**: Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com/) with Firestore enabled.
3. **Gmail Account**: Set up a Gmail account with 2FA enabled to generate an app password for email sending.

### Setup Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/p55d2k/zk-newsletter.git
   cd zk-newsletter
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Set up environment variables:

   Copy the example file and fill in your credentials:

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your actual values. See the [Environment Variables](#environment-variables) section below for details on each variable.

4. Run tests to verify setup:

   ```bash
   bun run test
   ```

5. Start the development server:

   ```bash
   bun run dev
   ```

   The app will be available at `http://localhost:3000`.

### Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Email Configuration
GOOGLE_USER_EMAIL=your-gmail@gmail.com
GOOGLE_APP_PASSWORD=your-app-password

# Groq Configuration
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=openai/gpt-oss-20b
GROQ_TIMEOUT_MS=12000

# Firebase Configuration
FIREBASE_API_KEY=your-firebase-api-key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your-sender-id
FIREBASE_APP_ID=your-app-id
FIREBASE_MEASUREMENT_ID=your-measurement-id

# API Security
NEWSLETTER_JOB_TOKEN=your-shared-secret-token
```

**Getting API Keys:**

- **Groq**: Visit [console.groq.com/keys](https://console.groq.com/keys) after signing up to generate an API key.
- **Firebase**: Go to Project Settings > General > Your apps in the Firebase console to get the config values.
- **Gmail App Password**: Enable 2FA on your Gmail account, then generate an app password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).

**Security Note**: Never commit `.env.local` to version control. The `.env.example` file shows the required structure without sensitive data.

## Usage

### Development

Start the development server:

```bash
bun run dev
```

The app will be available at `http://localhost:3000`.

### Email Preview

Visit `http://localhost:3000/email-preview` to preview the newsletter content and styling before sending.
Note: the preview page renders the newsletter using a local fallback planner (no external LLM calls) to avoid making external AI requests during preview.

### Email Status Dashboard

Visit `http://localhost:3000/status` to monitor newsletter email delivery:

- **Recent Sends**: View the last 20 email sends with their status (pending, success, failed)
- **Search by ID**: Look up specific send attempts using the send ID returned by the newsletter API
- **Detailed Information**: For each send, see:
  - Send status and timestamps
  - Recipient count and delivery success rate
  - Article summary (count of articles, topics, publishers)
  - NodeMailer response details (message ID, accepted/rejected recipients)
  - Error messages for failed sends
- **Auto-refresh**: Automatically refreshes pending sends every 30 seconds

The status page helps verify email delivery after getting a 200 response from the newsletter API, providing confidence that emails were actually sent successfully.

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

Continues news collection for an active newsletter job. Requires the `NEWSLETTER_JOB_TOKEN` bearer token and an active job started by `/api/start-newsletter`. Processes a batch of RSS sources and appends them to the existing job.

**Query Parameters:**

- `persist` (required): Must be `true` to enable persistence
- `sources` (optional): Number of RSS sources to process per batch (default: 12, recommended: 5)

**Response (Success):**

```json
{
  "message": "Appended 5 sources (25/105)",
  "count": 45,
  "persisted": true,
  "sendId": "a1b2c3d4",
  "totalRecipients": 150,
  "pendingRecipients": 150,
  "batchSize": 50,
  "jobStatus": "news-collecting",
  "processedSources": 25,
  "remainingSources": 80,
  "totalSources": 105,
  "batchSources": 5,
  "batchArticles": 23,
  "appendedArticles": 23,
  "totalArticles": 45,
  "totalTopics": 8,
  "totalPublishers": 6,
  "sourcesPerRun": 5
}
```

**Response (No Active Job):**

```json
{
  "error": "No active newsletter job found. Start a job with /api/start-newsletter first."
}
```

**Response (Collection Complete):**

```json
{
  "message": "Completed news collection job: processed 5 sources this run",
  "count": 120,
  "persisted": true,
  "sendId": "a1b2c3d4",
  "totalRecipients": 150,
  "pendingRecipients": 150,
  "batchSize": 50,
  "jobStatus": "news-ready",
  "processedSources": 105,
  "remainingSources": 0,
  "totalSources": 105,
  "batchSources": 5,
  "batchArticles": 15,
  "appendedArticles": 15,
  "totalArticles": 120,
  "totalTopics": 11,
  "totalPublishers": 8,
  "sourcesPerRun": 5
}
```

#### POST `/api/start-newsletter`

Starts a new newsletter job by creating an initial job record with subscribers. Requires the `NEWSLETTER_JOB_TOKEN` bearer token. This endpoint should be called once daily to begin the newsletter process.

**Response:**

```json
{
  "message": "Newsletter job started",
  "sendId": "a1b2c3d4",
  "totalRecipients": 150,
  "jobStatus": "news-collecting"
}
```

If a newsletter job is already in progress, returns:

```json
{
  "error": "Newsletter job already in progress",
  "sendId": "existing-job-id",
  "jobStatus": "news-collecting"
}
```

#### POST `/api/subscribe`

Handles newsletter subscription requests. Validates email format and stores active subscribers in Firestore.

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Response:**

```json
{
  "message": "Successfully subscribed!",
  "alreadyExists": false
}
```

#### POST `/api/llm`

Formats a staged newsletter job via Groq Gemma. Requires the `NEWSLETTER_JOB_TOKEN` bearer token.

The `/api/llm` endpoint processes newsletter topics incrementally. On each call without a specific topic, it processes one topic at a time, prioritizing jobs with partial LLM work. Once all topics for a job are processed, it finalizes the newsletter plan using a heuristic approach and sets the job status to "ready-to-send".

**Query Parameters:**

- `topic` (optional): Process only this topic (commentaries, international, politics, business, tech, sport, culture, entertainment, science, lifestyle, wildCard)
- `limit` (optional): Max articles per topic (default: uses SECTION_LIMITS)
- `extra` (optional): Additional candidate articles from other topics (default: 5)
- `force` (optional): Force re-processing of already processed topics

**Request Body:**

```json
{
  "sendId": "optional-job-id"
}
```

**Response (Incremental Processing - Default):**

When no `topic` is specified, the endpoint processes the next unprocessed topic for the job. If all topics are processed, it finalizes the newsletter plan.

```json
{
  "message": "Topic processed",
  "sendId": "a1b2c3d4",
  "topic": "commentaries",
  "articlesUsed": 5,
  "candidatesFetched": 10
}
```

Or when complete:

```json
{
  "message": "Newsletter plan generated",
  "sendId": "a1b2c3d4",
  "totalTopics": 7,
  "totalArticles": 18,
  "totalPublishers": 6
}
```

Provide `{ "sendId": "..." }` to target a specific job, or omit the body to automatically claim the oldest `news-ready` job. Saves rendered HTML, plain text, and AI metadata back to Firestore.

#### POST `/api/send-newsletter`

Sends the next batch (or batches) of recipients for a staged job. Requires the `NEWSLETTER_JOB_TOKEN` bearer header. Provide `{ "sendId": "..." }` and optional `maxBatches` to control processing, or omit the body to automatically claim the oldest job that is ready to send. Updates Firestore with progress and halts on failures so the cron can retry.

**Response:**

```json
{
  "message": "Batch processed",
  "sendId": "a1b2c3d4",
  "batchesProcessed": 1,
  "remainingRecipients": 75,
  "totalRecipients": 200,
  "successfulRecipients": 125,
  "failedRecipients": 0,
  "nodeMailerResponse": {
    "messageId": "<abc123@gmail.com>",
    "accepted": ["user1@example.com"],
    "rejected": []
  }
}
```

> Note: preprocessing has been removed. `/api/news` should be followed by `/api/llm` to generate a newsletter plan.

#### GET `/api/status`

Checks the delivery status of newsletter emails. Can retrieve recent sends or check a specific send ID.

**Query Parameters:**

- `id` (optional): Specific send ID to check
- `limit` (optional): Number of recent sends to retrieve (default: 20)

**Response for specific ID:**

```json
{
  "status": {
    "id": "a1b2c3d4",
    "startedAt": "2024-01-01T10:00:00Z",
    "completedAt": "2024-01-01T10:01:30Z",
    "status": "success",
    "totalRecipients": 10,
    "successfulRecipients": 10,
    "failedRecipients": 0,
    "nodeMailerResponse": {
      "messageId": "<abc123@gmail.com>",
      "accepted": ["user1@example.com", "user2@example.com"],
      "rejected": []
    },
    "articlesSummary": {
      "totalArticles": 5,
      "totalTopics": 3,
      "totalPublishers": 2
    }
  }
}
```

**Response for recent sends:**

```json
{
  "recentSends": [...],
  "count": 20
}
```

### Automation with GitHub Actions

Newsletter delivery is orchestrated by the `Send Daily Newsletter` workflow in `.github/workflows/newsletter.yml`. It runs every day at **06:30 UTC** and can also be triggered manually from the GitHub Actions tab.

#### Required secrets

Configure these repository secrets before enabling the scheduler:

- `NEWSLETTER_API_BASE_URL` – Fully qualified base URL for the deployed app (for example, `https://thegist.vercel.app`).
- `NEWSLETTER_JOB_TOKEN` – Shared bearer token used to authenticate requests to protected newsletter endpoints.

#### Optional repository variables

You can fine-tune the automation loop by adding repository variables. Leave them unset to fall back to script defaults.

- `NEWSLETTER_SOURCES_PER_RUN` – RSS sources processed per `/api/news` call (default: 10).
- `NEWSLETTER_MAX_NEWS_RUNS` – Safety cap for news collection iterations (default: 80).
- `NEWSLETTER_MAX_LLM_RUNS` – Safety cap for LLM processing iterations (default: 150).
- `NEWSLETTER_MAX_SEND_RUNS` – Safety cap for email sending iterations (default: 50).
- `NEWSLETTER_SEND_MAX_BATCHES` – Email batches processed per `/api/send-newsletter` call (default: 10).
- `NEWSLETTER_REQUEST_TIMEOUT_MS`, `NEWSLETTER_NEWS_DELAY_MS`, `NEWSLETTER_LLM_DELAY_MS`, `NEWSLETTER_SEND_DELAY_MS`, `NEWSLETTER_STATUS_DELAY_MS` – Request timeout and polling delays in milliseconds.
- `NEWSLETTER_SEND_ID` (workflow input) – Resume an existing job when triggering the workflow manually.

#### What the workflow does

- Checks out the repository and installs dependencies with Node.js 20.
- Executes `node scripts/send-newsletter.js`, which:
  - Starts or resumes a newsletter job.
  - Collects news batches until RSS ingestion completes.
  - Drives `/api/llm` until the newsletter plan is finished.
  - Sends email batches until all recipients are processed.
  - Verifies the final delivery status via `/api/status` and exits non-zero if anything fails.

#### Manual and local execution

- **Manual GitHub run** – Use the "Run workflow" button and optionally supply an existing `sendId`.
- **Local testing** – Run the script with Node.js 20+ after exporting the required environment variables:

  ```bash
  export NEWSLETTER_API_BASE_URL="https://your-production-domain"
  export NEWSLETTER_JOB_TOKEN="super-secret-token"
  node scripts/send-newsletter.js
  ```

The script logs each phase, retries transient errors, and exits with a non-zero status if the newsletter fails to send.

### Testing the pipeline with curl

Run the dev server locally (`bun run dev`) and export your token before testing:

```bash
export NEWSLETTER_JOB_TOKEN=your-shared-token
```

Start a new newsletter job:

```bash
curl --request POST "http://localhost:3000/api/start-newsletter" \
  --header "Authorization: Bearer ${NEWSLETTER_JOB_TOKEN}"
```

Continue news collection (repeat until all sources processed):

```bash
curl --request GET "http://localhost:3000/api/news?persist=true&sources=5" \
  --header "Authorization: Bearer ${NEWSLETTER_JOB_TOKEN}"
```

Generate the newsletter plan (repeat until plan is complete):

```bash
curl --request POST "http://localhost:3000/api/llm" \
  --header "Authorization: Bearer ${NEWSLETTER_JOB_TOKEN}"
```

Send newsletter batches (repeat until all emails sent):

```bash
curl --request POST "http://localhost:3000/api/send-newsletter" \
  --header "Authorization: Bearer ${NEWSLETTER_JOB_TOKEN}"
```

Check delivery status:

```bash
curl --request GET "http://localhost:3000/api/status?id=YOUR_SEND_ID" \
  --header "Authorization: Bearer ${NEWSLETTER_JOB_TOKEN}"
```

### Customization

- **RSS Feeds**: Modify topics and URLs in `constants/links.ts`.
- **Email Templates**: Update styling and layout in `lib/email.ts`.
- **AI Planning**: Customize Groq prompt templates and section logic in `lib/llm.ts`.
- **Date/Time Utilities**: Customize greetings and formatting in `lib/date.ts`.
- **Landing Page**: Modify the homepage design and content in `app/page.tsx`.
- **Subscription Flow**: Customize the subscription component in `components/NewsletterSubscription.tsx`.
- **Database Schema**: Extend subscriber data structure in `lib/firestore.ts`.
- **Brand Assets**: Use `public/logo.svg` for light backgrounds and `public/logo-dark.svg` for dark backgrounds.

## Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Commit changes: `git commit -am 'Add your feature'`.
4. Push to the branch: `git push origin feature/your-feature`.
5. Submit a pull request.

## License

This project is licensed under the [MIT License](LICENSE).

## Notes

- The app uses a user-agent header to mimic browser requests for RSS feeds.
- Emails are sent with no-cache headers to ensure fresh content.
- AI curation falls back to heuristic selection if Groq requests fail.
- For production deployment, consider using Vercel or Railway for Next.js hosting with Firebase integration.
