# Outreach AI

## Overview
Outreach AI is a single-user AI sales outreach platform for rupesh@mechdesign.co. It discovers
prospect companies, finds contact emails, drafts and sends personalized cold outreach emails via
Gmail, tracks replies, classifies them with AI, auto-follows-up on non-responders, and flags hot
leads.

## Architecture
- **Monorepo (pnpm)**: `artifacts/outreach` (React + Vite frontend), `artifacts/api-server`
  (Express + Drizzle backend), `artifacts/mockup-sandbox` (canvas design sandbox), `lib/db`
  (Drizzle schema/Postgres), `lib/api-spec` + `lib/api-zod` + `lib/api-client-react` (OpenAPI-first
  codegen pipeline).
- **Auth**: Replit-managed Clerk. `requireAuth` middleware restricts the app to a single allowed
  email (`rupesh@mechdesign.co`); any other Clerk account gets a 403.
- **AI**: Calls Gemini (`gemini-2.5-flash`) directly via the user's own `GEMINI_API_KEY`, falling
  back to OpenAI (`gpt-4o-mini`) if that key is absent. Every call is logged to the `ai_activity`
  table (prompt, response, tokens, status) for the AI Activity page.
- **Prospect discovery providers**: Apollo, Crunchbase, OpenCorporates (find companies).
- **Email-finding/enrichment providers**: Hunter (tried first), Snov (fallback), Clearbit
  (firmographic enrichment). Every provider module exposes `isXConfigured()` and degrades
  gracefully (skips, doesn't throw) when its key is missing.
- **Gmail**: not connected yet (the user declined the Gmail connector). `lib/gmail.ts` is a stub
  that reports itself unconfigured; send/poll routes return a friendly "Gmail is not connected"
  message instead of failing. The background scheduler (inbox polling every 15 min, follow-ups
  hourly) skips registering its cron jobs entirely while Gmail is off.

## User preferences
- Single user only: sign-in restricted to rupesh@mechdesign.co.
- Uses own API keys for AI/providers rather than Replit's AI Integrations proxy (which returned
  `awaiting_account_upgrade` for this account).
- Declined connecting Gmail for now — revisit if the user asks to connect it later.
