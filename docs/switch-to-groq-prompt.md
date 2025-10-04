# Switch from OpenRouter to Groq

## Task Overview

Replace all OpenRouter API usage with Groq SDK. All instances of OpenRouter should be replaced with Groq. Use the Groq SDK for requests. Use the openai/gpt-oss-20b model.

## Key Changes Required

### 1. Install Groq SDK

Add the Groq SDK to package.json dependencies:

```json
"dependencies": {
  "groq-sdk": "^0.7.0"
}
```

### 2. Update Environment Variables

Replace OpenRouter environment variables with Groq equivalents:

**Old:**

- OPENROUTER_API_KEY
- OPENROUTER_MODEL
- OPENROUTER_BASE_URL
- OPENROUTER_HTTP_REFERER
- OPENROUTER_TITLE
- OPENROUTER_TIMEOUT_MS

**New:**

- GROQ_API_KEY
- GROQ_MODEL=openai/gpt-oss-20b
- GROQ_TIMEOUT_MS (keep same value)

### 3. Update Code Files

#### lib/llm.ts

- Replace OpenRouter imports and client initialization with Groq SDK
- Update API call functions to use Groq SDK methods
- Change model references from "deepseek/deepseek-chat-v3.1:free" to "openai/gpt-oss-20b"
- Update error handling and response parsing for Groq API format
- Remove OpenRouter-specific headers and configuration

#### constants/llm.ts

- Update LLM_CONFIG to use Groq base URL and model
- Change defaultModel to "openai/gpt-oss-20b"
- Update baseUrl if needed (Groq uses https://api.groq.com/openai/v1 for OpenAI compatibility)

#### Any other files referencing OpenRouter

- Search for and replace all OpenRouter references
- Update API endpoints and authentication methods

### 5. Update Documentation

- Update README.md with new environment variable names and setup instructions
- Update any inline comments or documentation strings
- Update API documentation to reflect Groq usage instead of OpenRouter
- Delete or update obsolete documentation files like `switch-to-deepseek-prompt.md`

## Groq Documentation Reference

### Quickstart

- Install: `pip install groq` or `npm install groq-sdk`
- Set API key: `export GROQ_API_KEY=your-api-key`
- Basic usage:

```javascript
import Groq from "groq-sdk";

const groq = new Groq();

const chatCompletion = await groq.chat.completions.create({
  messages: [{ role: "user", content: "Explain quantum computing" }],
  model: "openai/gpt-oss-20b",
});
```

### Text Chat

- Endpoint: `/openai/v1/chat/completions`
- Models: openai/gpt-oss-20b, openai/gpt-oss-20b, etc.
- Parameters: messages, model, temperature, max_tokens, etc.
- Streaming supported
- Async support available

### Rate Limits

- Free tier: 30 requests/minute, 14,400 requests/day, 500,000 tokens/minute, 500,000 tokens/day
- Paid tiers have higher limits
- Headers for rate limit info: x-ratelimit-limit-requests, x-ratelimit-remaining-requests, etc.
- 429 status on rate limit exceeded

### Structured Outputs

- Supported on specific models (not openai/gpt-oss-20b)
- Use response_format with json_schema
- Fallback to JSON mode for other models

### Responses API (Advanced)

- Compatible with OpenAI Responses API
- Supports tools, reasoning, MCP, etc.
- Use base URL: https://api.groq.com/openai/v1

## Implementation Steps

1. **Backup current code** - Ensure you can revert if needed
2. **Install Groq SDK** - Run `bun add groq-sdk`
3. **Update environment variables** - Replace OPENROUTER*\* with GROQ*\*
4. **Update lib/llm.ts** - Replace OpenRouter client with Groq client
5. **Update constants/llm.ts** - Change model and URLs
6. **Test API calls** - Verify Groq integration works
7. **Update README.md** - Document new environment variables
8. **Remove unused code** - Delete any OpenRouter-specific functions that become useless
9. **Delete obsolete files** - Remove `docs/switch-to-deepseek-prompt.md` as it's no longer relevant
10. **Run tests** - Ensure all functionality still works

## Focus Instructions

- **DO NOT WANDER OFF TASK**: Only make changes related to switching from OpenRouter to Groq
- **KEEP CODE CLEAN**: If any functions or variables become useless after the switch, remove them entirely
- **UPDATE ALL REFERENCES**: Search the entire codebase for "openrouter", "OpenRouter", "deepseek", "DeepSeek" and replace appropriately
- Update error messages and comments that reference DeepSeek to reference Groq/Gemma instead
- **TEST AFTER CHANGES**: Run the application and API endpoints to verify everything works
- **UPDATE DOCUMENTATION**: Ensure README.md and any other docs reflect the changes

## Expected Outcome

- All LLM API calls use Groq instead of OpenRouter
- Model is openai/gpt-oss-20b
- Environment variables are updated
- README.md is updated with Groq setup instructions
- No broken or unused code remains
- Application functions identically but uses Groq infrastructure
