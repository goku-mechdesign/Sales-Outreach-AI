---
name: Outreach AI provider architecture
description: Discovery vs enrichment provider split, LLM fallback strategy, Gmail-optional design used in this project's Outreach AI artifact.
---

## Providers (as of 2026-07-12)

- Discovery: Apollo.io only (`artifacts/api-server/src/lib/providers/apollo.ts`).
- Email enrichment: Hunter.io only.
- LLM: Gemini only, via a two-tier `resolveProvider()` in `llm.ts`:
  1. User's own key (Integrations UI override, DB-stored) or `GEMINI_API_KEY` env secret — direct `GoogleGenAI` client.
  2. Fallback: Replit's managed AI integration (`@workspace/integrations-gemini-ai`, env vars `AI_INTEGRATIONS_GEMINI_*`) — no user key required, billed to Replit credits. Always available since env vars are provisioned once via `setupReplitAIIntegrations`.
- Gmail: optional, toggled via a `disabled` flag stored in credentials, not a hard requirement for the app to function.

**Why the two-tier LLM fallback:** the free-tier Gemini API key has a very low daily quota (20 req/day) and users hit 429s immediately in real use; falling back to the Replit AI integration means the app works out of the box without asking the user to configure anything, while still letting them switch to their own key/quota later.

**How to apply:** when adding new LLM call sites, use `callLlm()` in `llm.ts` — it already handles the fallback. Don't call `GoogleGenAI` directly elsewhere. The `getIntegrationStatuses()` response marks `configuredVia: "trial"` when running on the Replit AI integration fallback (frontend shows a "Trial" badge on the Integrations page).

## Removed providers (as of 2026-07-12)

OpenAI, Crunchbase, OpenCorporates, Snov.io, and Clearbit were fully removed (not just hidden) per user request — deleted provider files, credential fields, enum values (`prospects.source`), and all references. Only Apollo/Hunter/Gemini/Gmail remain. If re-adding any of these, there is no fallback logic left to restore — it must be rebuilt.
