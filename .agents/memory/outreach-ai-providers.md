---
name: Outreach AI provider & autonomy architecture
description: Discovery/enrichment/LLM provider split, Gmail-optional design, and the full-autonomy (discovery + send) architecture used in this project's Outreach AI artifact.
---

## Provider architecture
- Discovery (Apollo) and enrichment (Hunter, email-finding) are separate provider calls composed by `runDiscovery()`; LLM generation has a fallback chain (Gemini/NVIDIA/OpenRouter).
- Per-integration credential "Test" buttons exist in Settings; credentials are read via a `getCredentialValue(provider, field, envVarFallback)` helper, not hardcoded env access.

## Gmail-optional scheduler design
**Why:** Discovery only calls provider search APIs and writes DB rows — it has no dependency on email. Originally `startScheduler()` returned early (skipping ALL cron jobs, including discovery) if Gmail wasn't configured, which would silently break autonomous discovery for any user who hadn't connected Gmail yet.
**How to apply:** Any new scheduled job must be individually assessed for whether it actually needs Gmail. Register Gmail-independent jobs (e.g. discovery) unconditionally; gate only Gmail-dependent jobs (inbox polling, follow-ups, autonomous sending) behind `isGmailConfigured()`.

## Full pipeline autonomy (discovery -> enrollment -> send -> reply)
- Autonomous config lives as flat columns on the singleton `settingsTable` (industry/country/city/keywords/companySize/targetCount/cadence/enabled/lastAutoDiscoveryAt), consistent with how all other settings (including Agent Mail reply-autonomy) are modeled as one row — no separate criteria table.
- The "always-on" campaign that auto-discovered prospects get enrolled into is a single `settingsTable.autoEnrollCampaignId` FK, not a per-campaign `isAlwaysOn` boolean — the product only supports one active always-on campaign at a time, so a settings pointer is simpler than a redundant flag.
- `campaignsTable.templateApproved` (boolean, default false) enforces a one-time human-approval gate before the agent may autonomously send under a template. It resets to false automatically on template regeneration (`POST /campaigns/:id/generate`) and on any manual edit to subject/body (`PATCH /campaigns/:id`); it can only be set true via the dedicated `POST /campaigns/:id/approve-template` endpoint. This is enforced at the data level, not just in UI copy.
- Deliverability/reputation protection (user's explicit concern about the sending domain getting blacklisted) is implemented as `settingsTable.sendPacingSeconds`, an enforced delay between consecutive sends inside the shared send-batch function — applied to autonomous sends, intentionally NOT applied to manual "Send now" clicks (those are a deliberate, already-reviewed action).
- Cadence ("daily"/"weekly"/"manual") is implemented as an "is it overdue" comparison against `lastAutoDiscoveryAt`, checked on an hourly cron tick — not separate cron schedules per cadence. Self-corrects automatically if the server was down when a run was due.
- Discovery-and-insert logic and the campaign-send loop were extracted from their HTTP routes (`prospects.ts`, `campaigns.ts`) into shared lib functions (`discoveryFlow.ts`, `campaignSend.ts`) specifically so both the manual routes and the new scheduler ticks (`autonomy.ts`) call identical logic — avoids drift between manual and autonomous code paths.

## Environment quirk: running one-off DB scripts
`tsx` is not a dependency of every workspace package (e.g. not in `api-server` or `scripts`), and `@workspace/*` / `drizzle-orm` package resolution only works from within a package that actually depends on them. For a one-off seed/inspection script against the app DB, it's simpler to use `psql "$DATABASE_URL" -c "..."` directly than to fight module resolution with a temporary `.mts` file.
