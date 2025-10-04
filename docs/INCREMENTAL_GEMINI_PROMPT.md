# Implement Incremental LLM Topic Processing

## Overview

Modify the `/api/llm` route to process newsletter topics incrementally instead of all at once. On each call, the route processes one topic at a time, prioritizing jobs with partial LLM work, then starting new jobs from the "news-ready" queue. Once all topics for a job are processed, finalize the newsletter plan and set the job status to "ready-to-send".

## Key Changes

### 1. Update Job Selection Logic

- Ensure `getNextNewsletterJobNeedingLLM` in `lib/firestore.ts` prioritizes jobs with partial LLM work (`aiPartial` field exists) over purely "news-ready" jobs.
- Jobs with `aiPartial` but incomplete topic processing should be selected first.

### 2. Modify `/api/llm` Route Logic (`app/api/llm/route.ts`)

- **Remove bulk processing**: The legacy `runAll=true` parameter is no longer supported; process topics incrementally instead.
- **Incremental processing**: When no specific `topic` is provided, find the next job needing LLM work, then identify and process the next unprocessed topic for that job.
- **Topic prioritization**: For a given job, process topics in the order defined by `deriveProcessableTopics`, skipping any already present in `aiPartial`.
- **Completion check**: After processing a topic, check if all processable topics now have entries in `aiPartial`. If complete, generate the final newsletter overview/summary/highlights using heuristic approach (since full newsletter mode is removed) and call `saveNewsletterPlanStage` to set status to "ready-to-send".
- **Response format**: Maintain existing response formats for topic-specific processing. For incremental calls, return details about the processed topic and job status.

### 3. Update Helpers (`app/api/llm/_helpers.ts`)

- Ensure topic-processing helpers idempotently handle partial processing without duplicating data.
- Add or modify functions to:
  - Identify the next topic to process for a job (first missing from `aiPartial`).
  - Check if all topics are processed (all `deriveProcessableTopics` results are keys in `aiPartial`).

### 4. Plan Finalization

- When all topics are processed, persist the finalized Groq-generated plan plus metadata and ensure fallback sections are filled if necessary.
- This ensures `essentialReads` and overall plan coherence, as incremental processing per topic may not produce globally optimal `essentialReads` in isolation.

### 5. Error Handling and Edge Cases

- Handle jobs with no topics or invalid states gracefully.
- Ensure partial processing is safe to retry (idempotent).
- Maintain authorization and input validation.

### 6. Documentation Updates

- Update `README.md` to reflect the incremental LLM processing behavior.
- Update API documentation or inline comments to describe the new flow.
- Note that the route now processes topics one at a time, improving reliability and allowing for progress tracking.

## Implementation Focus

- **FOCUS ON THE TASK**: Implement exactly as described. Do not add unrelated features, abstractions, or optimizations.
- **KEEP CHANGES MINIMAL**: Only modify `app/api/llm/route.ts`, `app/api/llm/_helpers.ts`, and `lib/firestore.ts` as strictly necessary.
- **MAINTAIN COMPATIBILITY**: Preserve existing API contracts for topic-specific calls.
- **TEST INCREMENTALLY**: Ensure partial topic processing is idempotent and safe to re-run.

## Expected Behavior

- Calls to `/api/llm` without parameters process one topic incrementally.
- Jobs progress from "news-ready" → (partial processing) → "ready-to-send".
- No breaking changes to existing topic-specific processing.
- Improved fault tolerance as failures affect only individual topics.
