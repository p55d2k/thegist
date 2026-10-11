# The Gist

[![Live Site](https://img.shields.io/website?down_message=down&label=thegist.zk.is-a.dev&style=flat-square&up_message=live&url=https%3A%2F%2Fthegist.zk.is-a.dev)](https://thegist.zk.is-a.dev)
[![Workflow Status](https://github.com/p55d2k/thegist/actions/workflows/newsletter.yml/badge.svg)](https://github.com/p55d2k/thegist/actions/workflows/newsletter.yml)
[![Tests](https://img.shields.io/badge/tests-vitest-blue?style=flat-square)](#testing)
[![License: MIT](https://img.shields.io/badge/license-MIT-brightgreen?style=flat-square)](LICENSE)

A Next.js 14 TypeScript app that builds and sends a curated newsletter by aggregating RSS feeds, deduplicating items, and using Groq LLMs to plan sections. It includes: a subscription UI, preview pages, staged APIs for collection/planning/sending, and a GitHub Actions workflow to automate delivery.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## Overview

The Gist is an automated newsletter curation system that aggregates commentary from multiple RSS feeds, uses AI to organize content into thematic sections, and delivers personalized email digests to subscribers. Built with Next.js 14, TypeScript, and powered by Groq's LLMs, it features a modern web UI for subscriptions and previews, along with a robust API for staged processing.

The system processes news in batches: collecting articles, deduplicating, planning sections with AI, and sending emails asynchronously. It's designed for reliability with incremental storage and fallback mechanisms.

## Features

- **AI-Powered Curation**: Leverages Groq's openai/gpt-oss-20b model to intelligently categorize articles into sections like commentaries, international news, politics, business, tech, sports, culture, entertainment, science, lifestyle, and a wildcard piece.
- **Multi-Source Aggregation**: Pulls from diverse RSS feeds (ChannelNewsAsia, CNN, The Guardian, BBC, NPR, Al Jazeera) with smart filtering for recent commentary articles.
- **Deduplication & Filtering**: Removes duplicates across sources, limits to 10 recent articles per feed, and focuses on content from the last 24 hours.
- **Incremental Processing**: Processes topics one at a time for fault tolerance, with idempotent storage allowing safe re-processing.
- **Email Delivery**: Sends responsive HTML newsletters with plaintext fallbacks using Nodemailer and Gmail SMTP.
- **Subscription Management**: Firebase-powered subscriber system with email validation and Firestore storage.
- **Preview & Status Dashboard**: Built-in pages to preview newsletter content and monitor delivery status.
- **Automated Workflow**: GitHub Actions runs daily at 08:00 and 16:00 UTC, orchestrating the full pipeline.
- **Modern UI**: Responsive landing page with animations (Framer Motion), subscription forms, and clean design (Tailwind CSS).
- **API-Driven Architecture**: RESTful endpoints for news collection, LLM planning, and email sending.
- **Testing Suite**: Comprehensive Vitest tests for helpers, LLM routes, and subscriptions.
- **Fallback Mechanisms**: Heuristic planning if AI fails, ensuring newsletters are always sent.

## Installation

### Prerequisites

- Node.js 18+ or Bun (recommended for CI compatibility)
- Accounts for Groq, Firebase, and Gmail (for email sending)
- Git

### Setup Steps

1. **Clone the repository**:

   ```bash
   git clone https://github.com/p55d2k/thegist.git
   cd thegist
   ```

2. **Install dependencies**:

   ```bash
   # With Bun (recommended)
   bun install

   # Or with npm
   npm install
   ```

3. **Set up environment variables**:

   Copy the example file and configure:

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your API keys and secrets. Required variables include `GROQ_API_KEY`, `NEWSLETTER_JOB_TOKEN`, Firebase config, etc.

4. **Run tests** (optional, to verify setup):

   ```bash
   bun run test
   ```

5. **Start development server**:

   ```bash
   bun run dev
   ```

   Visit `http://localhost:3000` to see the app.

## Usage

### Development

Run the dev server:

```bash
bun run dev
```

### Building for Production

```bash
bun run build
bun run start
```

### Scripts

Available bun/npm scripts:

- `bun run dev` — Start development server
- `bun run build` — Build for production
- `bun run start` — Start production server
- `bun run lint` — Run ESLint
- `bun run test` — Run Vitest tests
- `bun run test:watch` — Run tests in watch mode
- `bun run ci` — Install and run tests (for CI)

### Previewing Newsletters

- Visit `/email-preview` to see newsletter HTML/plaintext without sending.
- Visit `/status` to monitor recent sends and check delivery status.

### Manual Newsletter Run

Export environment variables and run the automation script (requires Firestore access and a Groq API key):

```bash
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}' # or FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/key.json
export GROQ_API_KEY="your-groq-key"
export GOOGLE_USER_EMAIL="you@gmail.com"
export GOOGLE_APP_PASSWORD="your-app-password"
bun run scripts/send-newsletter.ts
```

The script runs the whole pipeline in-process: starts (or resumes) a job, collects news, plans with the LLM, and sends every batch. Pass `NEWSLETTER_SEND_ID` to resume an existing job at any stage.

## API Reference

The app exposes several API endpoints under `/api/`. Key ones for automation:

The app exposes a few server endpoints under `/api/`:

- `GET /api/latest-newsletter` — Fetch the most recent published newsletter
- `GET /api/status?id=sendId` — Check delivery status
- `POST /api/subscribe` — Handle email subscriptions

The staged pipeline endpoints (`/api/start-newsletter`, `/api/news`, `/api/llm`, `/api/send-newsletter`) have been removed; the worker script (`scripts/send-newsletter.ts`) now runs the whole pipeline in-process. Legacy `/api/preprocess` and `/api/newsletter` return 410 Gone.

## Testing

Run the test suite with Vitest:

```bash
bun run test
```

Tests cover:

- News helpers (deduplication, summarization)
- LLM API routes (topic processing, partial storage)
- Subscription endpoints
- Mocked dependencies (Firebase, Groq)

Configuration in `vitest.config.mts`.

## Deployment

### GitHub Actions Automation

The repository includes a GitHub Actions workflow (`.github/workflows/newsletter.yml`) that runs daily at 08:00 and 16:00 UTC. It automates the full newsletter pipeline in a single worker using Bun.

**Required Secrets**:

- `FIREBASE_SERVICE_ACCOUNT` — service account JSON string (firebase-admin)
- `GROQ_API_KEY`
- `GOOGLE_USER_EMAIL`
- `GOOGLE_APP_PASSWORD`

**Optional**: `GROQ_MODEL`, and `NEWSLETTER_SEND_ID` when dispatching manually to resume a job.

### Manual Deployment

Deploy to Vercel, Railway, or any Node.js host. Ensure environment variables are set in production.

## Contributing

1. Fork the repo.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Make changes and add tests.
4. Commit (`git commit -m 'Add feature'`).
5. Push and open a PR.

Please follow the existing code style and add tests for new features.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Quick status

- Repo runtime: Next.js 14 (app router) with TypeScript.
- CI: GitHub Actions workflow at `.github/workflows/newsletter.yml` that uses Bun to install and run the automation script.
- Tests: Vitest (configured in `vitest.config.mts`).

## Local development

1. Clone the repository:

   ```bash
   git clone https://github.com/p55d2k/thegist.git
   cd thegist
   ```

2. Install dependencies (use Bun if you have it; Node/npm/yarn also work):

   ```bash
   # with Bun (recommended to match CI)
   bun install

   # or with npm
   npm install
   ```

3. Copy example env and edit values:

   ```bash
   cp .env.example .env.local
   # edit .env.local with your credentials
   ```

4. Run the dev server:

   ```bash
   bun run dev
   # or
   npm run dev
   ```

App URL: http://localhost:3000

## Scripts

Scripts in `package.json` (call with `bun run <script>` or `npm run <script>`):

- `dev` — starts Next.js dev server (next dev)
- `build` — builds Next.js app (next build)
- `start` — runs built Next.js app (next start)
- `lint` — runs next lint
- `test` — runs Vitest (`vitest run`)

Use Bun in CI as configured, but local developers can use npm/yarn if preferred.

## Environment variables

Create a `.env.local` with the keys from `.env.example`. Important ones used by the codebase:

- GROQ_API_KEY — API key for Groq SDK (used by `lib/llm.ts`)
- GROQ_MODEL — model id (default: `openai/gpt-oss-20b`) — also configured in `constants/llm.ts`
- GROQ_TIMEOUT_MS — request timeout in ms for LLM calls (default in code: 20000)
- FIREBASE_SERVICE_ACCOUNT / FIREBASE_SERVICE_ACCOUNT_PATH — firebase-admin credentials (JSON string or path to key file); falls back to application default credentials
- NEXT_PUBLIC_FIREBASE_PROJECT_ID — optional projectId override for firebase-admin
- NEWSLETTER_JOB_TOKEN — shared secret used by protected API endpoints (optional; skips auth when unset)
- GOOGLE_USER_EMAIL and GOOGLE_APP_PASSWORD — Gmail credentials used by `lib/email-send.ts` when sending via Nodemailer

Always keep secrets out of version control. `.env.example` lists all keys expected by the project.

## Automation (GitHub Actions)

Workflow: `.github/workflows/newsletter.yml` — scheduled at 08:00 UTC and 16:00 UTC and supports manual dispatch. It:

- sets up Bun
- runs `bun install`
- runs `bun run scripts/send-newsletter.ts` (the single in-process pipeline worker)

Required repository secrets:

- `FIREBASE_SERVICE_ACCOUNT` — service account JSON string (firebase-admin)
- `GROQ_API_KEY`
- `GOOGLE_USER_EMAIL` / `GOOGLE_APP_PASSWORD`

## API endpoints (summary)

The repo exposes a few server routes under `app/api/*`:

- GET `/api/latest-newsletter` — fetch the most recent published newsletter
- GET `/api/status` — query send status
- POST `/api/subscribe` — handle subscriptions

The pipeline automation endpoints were removed with the move to the single worker script (`scripts/send-newsletter.ts`); `/api/preprocess` and `/api/newsletter` return 410 Gone for legacy callers.

Refer to the route implementations in `app/api` for exact request/response shapes and error codes.

## Testing

Run unit tests with Vitest:

```bash
bun run test
# or
npm run test
```

Vitest is configured to run tests under `lib/__tests__` (see `vitest.config.mts`).

## Notes and troubleshooting

- The LLM integration will fall back to heuristic behavior if `GROQ_API_KEY` is not set — check logs if AI-generated summaries/plans appear as fallbacks.
- CI intentionally uses Bun to match the workflow; if you use npm locally, behavior should be identical for most commands.
- If emails fail to send, inspect Firestore records and the `/status` endpoint for details. The preview page (`/email-preview`) helps debug HTML/plaintext output.

## Contributing

See standard GitHub flow: fork, branch, open a PR. Keep changes small and include tests for new behavior.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
