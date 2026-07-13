import { eq } from "drizzle-orm";
import { db, campaignsTable, campaignProspectsTable, settingsTable } from "@workspace/db";
import { getOrCreateSettings } from "./settings";
import { discoverAndCreateProspects } from "./discoveryFlow";
import { sendCampaignBatch } from "./campaignSend";
import { logger } from "./logger";

const CADENCE_MS: Record<"daily" | "weekly", number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export interface AutoDiscoveryRunResult {
  ran: boolean;
  created: number;
  enrolled: number;
  duplicatesSkipped: number;
}

/**
 * Runs autonomous prospect discovery if it's enabled and due per the
 * configured cadence, then auto-enrolls any newly created (emailable)
 * prospects into the configured always-on campaign, if one is set.
 */
export async function runAutonomousDiscoveryIfDue(): Promise<AutoDiscoveryRunResult> {
  const settings = await getOrCreateSettings();

  if (!settings.autoDiscoveryEnabled || settings.autoDiscoveryCadence === "manual") {
    return { ran: false, created: 0, enrolled: 0, duplicatesSkipped: 0 };
  }
  if (!settings.autoDiscoveryIndustry || !settings.autoDiscoveryCountry) {
    logger.warn(
      "Autonomous discovery is enabled but no industry/country criteria is saved in Settings; skipping.",
    );
    return { ran: false, created: 0, enrolled: 0, duplicatesSkipped: 0 };
  }

  const interval = CADENCE_MS[settings.autoDiscoveryCadence];
  const due =
    !settings.lastAutoDiscoveryAt ||
    Date.now() - settings.lastAutoDiscoveryAt.getTime() >= interval;
  if (!due) {
    return { ran: false, created: 0, enrolled: 0, duplicatesSkipped: 0 };
  }

  const result = await discoverAndCreateProspects({
    industry: settings.autoDiscoveryIndustry,
    country: settings.autoDiscoveryCountry,
    city: settings.autoDiscoveryCity ?? undefined,
    keywords: settings.autoDiscoveryKeywords ?? undefined,
    count: settings.autoDiscoveryTargetCount,
  });

  await db
    .update(settingsTable)
    .set({ lastAutoDiscoveryAt: new Date() })
    .where(eq(settingsTable.id, settings.id));

  let enrolled = 0;
  const emailable = result.created.filter((p) => p.email);
  if (settings.autoEnrollCampaignId && emailable.length > 0) {
    const [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, settings.autoEnrollCampaignId));
    if (campaign) {
      const rows = await db
        .insert(campaignProspectsTable)
        .values(emailable.map((p) => ({ campaignId: campaign.id, prospectId: p.id })))
        .returning();
      enrolled = rows.length;
    }
  }

  logger.info(
    { created: result.created.length, enrolled, duplicatesSkipped: result.duplicatesSkipped },
    "Autonomous discovery run completed",
  );

  return {
    ran: true,
    created: result.created.length,
    enrolled,
    duplicatesSkipped: result.duplicatesSkipped,
  };
}

export interface AutoSendRunResult {
  ran: boolean;
  sent: number;
  queued: number;
  failed: number;
}

/**
 * Sends the next batch of pending prospects in the configured always-on
 * campaign, but only once its template has been explicitly approved by the
 * user -- the agent never sends under a template no one has reviewed.
 */
export async function runAutonomousSendIfEnabled(): Promise<AutoSendRunResult> {
  const settings = await getOrCreateSettings();
  if (!settings.autoEnrollCampaignId) {
    return { ran: false, sent: 0, queued: 0, failed: 0 };
  }

  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, settings.autoEnrollCampaignId));
  if (!campaign || !campaign.templateApproved || !campaign.subject || !campaign.body) {
    return { ran: false, sent: 0, queued: 0, failed: 0 };
  }

  const result = await sendCampaignBatch(campaign, settings, {
    pacingSeconds: settings.sendPacingSeconds,
  });

  if (result.sent > 0 || result.failed > 0) {
    logger.info({ campaignId: campaign.id, ...result }, "Autonomous send run completed");
  }

  return { ran: true, ...result };
}
