# Implement Incremental Gemini Topic Processing

## Overview

Modify the `/api/gemini` route to process newsletter topics incrementally instead of all at once. On each call, the route will process one topic at a time, prioritizing jobs with partial Gemini work, then starting new jobs from "news-ready" status. Once all topics for a job are processed, finalize the newsletter plan and set the job status to "ready-to-send".

## Key Changes

### 1. Update Job Selection Logic

- Modify `getNextNewsletterJobNeedingGemini` in `lib/firestore.ts` to prioritize jobs with partial Gemini work (`aiPartial` field exists) over purely "news-ready" jobs.
- Jobs with `aiPartial` but incomplete topic processing should be selected first.

### 2. Modify `/api/gemini` Route Logic (`app/api/gemini/route.ts`)

- **Remove `runAll` functionality**: Disable the `runAll=true` parameter and the associated code branch that processes all topics at once.
- **Incremental processing**: When no specific `topic` is provided, find the next job needing Gemini work, then identify and process the next unprocessed topic for that job.
- **Topic prioritization**: For a given job, process topics in the order defined by `deriveProcessableTopics`, skipping any already present in `aiPartial`.
- **Completion check**: After processing a topic, check if all processable topics now have entries in `aiPartial`. If complete, generate the full newsletter plan using `formatArticles` and call `saveNewsletterPlanStage` to set status to "ready-to-send".
- **Response format**: Maintain existing response formats for topic-specific processing. For incremental calls, return details about the processed topic and job status.

### 3. Update Helpers (`app/api/gemini/_helpers.ts`)

- Ensure `processGeminiTopic` idempotently handles partial processing without duplicating data.
- Add or modify functions to:
  - Identify the next topic to process for a job (first missing from `aiPartial`).
  - Check if all topics are processed (all `deriveProcessableTopics` results are keys in `aiPartial`).

### 4. Plan Finalization

- When all topics are processed, use `formatArticles` from `lib/email.ts` to generate the complete `GeminiNewsletterPlan` from all topics.
- This ensures `essentialReads` and overall plan coherence, as incremental processing per topic may not produce globally optimal `essentialReads`.

### 5. Error Handling and Edge Cases

- Handle jobs with no topics or invalid states gracefully.
- Ensure partial processing is safe to retry (idempotent).
- Maintain authorization and input validation.

### 6. Documentation Updates

- Update `README.md` to reflect the new incremental processing behavior.
- Update any API documentation or comments in code to describe the new flow.
- Note that the route now processes topics one at a time, improving reliability and allowing for progress tracking.

## Implementation Focus

- **FOCUS ON THE TASK**: Implement exactly as described. Do not add unrelated features, abstractions, or optimizations.
- **KEEP CHANGES MINIMAL**: Only modify `app/api/gemini/route.ts`, `app/api/gemini/_helpers.ts`, and `lib/firestore.ts` as strictly necessary.
- **MAINTAIN COMPATIBILITY**: Preserve existing API contracts for topic-specific calls.
- **TEST INCREMENTALLY**: Ensure partial topic processing is idempotent and safe to re-run.

## Expected Behavior

- Calls to `/api/gemini` without parameters now process one topic incrementally.
- Jobs progress from "news-ready" → (partial processing) → "ready-to-send".
- No breaking changes to existing topic-specific processing.
- Improved fault tolerance as failures affect only individual topics.</content>
  <parameter name="filePath">/Users/zk/coding/thegist/INCREMENTAL_GEMINI_PROMPT.md
