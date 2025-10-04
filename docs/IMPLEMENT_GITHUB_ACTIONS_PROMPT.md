# Implement GitHub Actions Workflow for Newsletter Automation

## Task Description

Replace the current cron-job.org setup with a GitHub Actions scheduled workflow that fully automates the newsletter sending process. The workflow should run daily and execute the entire sequence: start job, collect news, process with LLM, and send emails. This will make cron-job.org completely obsolete.

## Context

- The project is a Next.js newsletter app hosted on Vercel.
- Current workflow involves API endpoints: `/api/start-newsletter`, `/api/news`, `/api/llm`, `/api/send-newsletter`.
- The process can take significant time (news collection, LLM processing, email sending), exceeding cron-job.org's 30-second timeout.
- GitHub Actions provides up to 6 hours timeout on free tier, perfect for this use case.

## Required Changes

### 1. Create GitHub Actions Workflow

- **File:** `.github/workflows/newsletter.yml`
- **Content:** Scheduled workflow that runs daily (e.g., 8 AM UTC).
- **Job:** Run on ubuntu-latest, setup Node.js 20, install dependencies, execute newsletter script.
- **Environment Variables:** Pass required secrets (NEWSLETTER_JOB_TOKEN, API keys, etc.).

### 2. Create Newsletter Automation Script

- **File:** `scripts/send-newsletter.js`
- **Functionality:**
  - Start newsletter job via `/api/start-newsletter`
  - Collect news in batches via `/api/news?persist=true` until complete
  - Process topics with LLM via `/api/llm` until plan is generated
  - Send emails in batches via `/api/send-newsletter` until all recipients processed
  - Include proper error handling, retries, and logging
  - Use environment variables for configuration

### 3. Update Documentation

- **File:** `README.md`
- **Changes:**
  - Remove any references to cron-job.org
  - Add section on GitHub Actions setup
  - Explain how to configure secrets
  - Update deployment/scheduling instructions

### 4. Clean Up Code

- Remove any code or functions that were only used for cron-job.org integration
- Ensure no dead code remains
- Update any configuration files if needed

### 5. Testing and Validation

- Ensure the workflow can be manually triggered for testing
- Add steps to verify the newsletter was sent successfully
- Include status checks via `/api/status`

## Implementation Instructions

- **FOCUS ON THE TASK:** Do not add unrelated features, refactorings, or improvements. Stick strictly to implementing the GitHub Actions workflow and cleaning up cron-job.org references.
- **KEEP CODE CLEAN:** If any functions or files become useless after removing cron-job.org, delete them entirely.
- **UPDATE DOCUMENTATION:** Ensure README.md and any other docs reflect the new setup accurately.
- **TEST LOCALLY:** Before committing, test the script locally if possible.
- **COMMIT CHANGES:** Make all changes in a single commit with a clear message like "Replace cron-job.org with GitHub Actions workflow".

## Expected Outcome

- cron-job.org is no longer needed or referenced anywhere in the codebase.
- Daily newsletter automation runs via GitHub Actions.
- All documentation updated to reflect the new process.
