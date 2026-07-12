---
name: Outreach AI provider architecture
description: How the Outreach AI artifact (artifacts/outreach + artifacts/api-server) is structured around optional third-party providers, LLM fallback, and an optional Gmail connection.
---

Outreach AI (prospect discovery, AI email generation/classification, Gmail send/reply) is built so
that every external dependency is optional and degrades gracefully rather than throwing 500s:

- **Discovery providers** (find companies): Apollo, Crunchbase, OpenCorporates. Each exports
  `isXConfigured()` and a `xDiscoverCompanies(params)` that the `providers/index.ts` aggregator calls
  in parallel, skipping unconfigured ones and reporting `providersUsed`/`providersSkipped` back to the
  caller instead of failing the whole request if one provider errors.
- **Enrichment/email-finding providers** (find a contact email for a domain): Hunter (tried first),
  then Snov as fallback, Clearbit for firmographic enrichment. Same `isXConfigured()` pattern.
- **LLM**: Replit's built-in AI Integrations (Gemini/OpenAI proxy) returned `awaiting_account_upgrade`
  for this account, so the project calls Gemini (`@google/genai`, `gemini-2.5-flash`) directly with the
  user's own `GEMINI_API_KEY`, falling back to OpenAI (`gpt-4o-mini`) if that key is absent. Every call
  is logged to an `ai_activity` table (prompt, response, tokens, success/error) for the AI Activity page.
- **Gmail**: the user declined connecting the Gmail connector. `lib/gmail.ts` is a stub —
  `isGmailConfigured()` returns `false`, and send/poll functions throw a clear "Gmail is not connected"
  error. All routes that need to actually send/read mail check `isGmailConfigured()` first and return a
  structured failure (not a 500) when it's off; the cron scheduler skips registering its jobs entirely
  and logs a warning if Gmail isn't configured. Revisit `lib/gmail.ts` if the user later connects Gmail
  (package `googleapis` is already installed for this).

**Why:** the whole feature set (discovery, enrichment, sending) depends on API keys/connections a solo
user may add incrementally; the product should stay usable and honest about what's missing rather than
crashing.

**How to apply:** when adding a new provider or send-capable feature, follow the same
`isXConfigured()` + graceful-skip/structured-failure pattern instead of throwing.
