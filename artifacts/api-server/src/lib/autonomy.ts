import { eq } from "drizzle-orm";
import { db, campaignsTable, campaignProspectsTable, settingsTable } from "@workspace/db";
import { getOrCreateSettings } from "./settings";
import { discoverAndCreateProspects } from "./discoveryFlow";
import { sendCampaignBatch } from "./campaignSend";
import { computeEffectiveDailyLimit } from "./warmup";
import { filterActivelyEnrolledElsewhere } from "./enrollment";
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
  crossCampaignDuplicatesSkipped: number;
}

/**
 * Runs autonomous prospect discovery if it's enabled and due per the
 * configured cadence, then auto-enrolls any newly created (emailable)
 * prospects into the configured always-on campaign, if one is set.
 */
export async function runAutonomousDiscoveryIfDue(): Promise<AutoDiscoveryRunResult> {
  const settings = await getOrCreateSettings();

  if (!settings.autoDiscoveryEnabled || settings.autoDiscoveryCadence === "manual") {
    return { ran: false, created: 0, enrolled: 0, duplicatesSkipped: 0, crossCampaignDuplicatesSkipped: 0 };
  }
  if (!settings.autoDiscoveryIndustry || !settings.autoDiscoveryCountry) {
    logger.warn(
      "Autonomous discovery is enabled but no industry/country criteria is saved in Settings; skipping.",
    );
    return { ran: false, created: 0, enrolled: 0, duplicatesSkipped: 0, crossCampaignDuplicatesSkipped: 0 };
  }

  const interval = CADENCE_MS[settings.autoDiscoveryCadence];
  const due =
    !settings.lastAutoDiscoveryAt ||
    Date.now() - settings.lastAutoDiscoveryAt.getTime() >= interval;
  if (!due) {
    return { ran: false, created: 0, enrolled: 0, duplicatesSkipped: 0, crossCampaignDuplicatesSkipped: 0 };
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
  let crossCampaignDuplicatesSkipped = 0;
  // Highest-scored leads first, so if a run produces more emailable
  // prospects than the campaign's sending capacity, the best-fit ones are
  // inserted (and therefore sent) first.
  const emailable = result.created
    .filter((p) => p.email && !p.unsubscribedAt && !p.bouncedAt)
    .sort((a, b) => b.leadScore - a.leadScore);
  if (settings.autoEnrollCampaignId && emailable.length > 0) {
    const [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, settings.autoEnrollCampaignId));
    if (campaign) {
      // Skip anything already actively being worked in another campaign --
      // newly-created prospects only realistically collide here if
      // discovery just re-found a company that's already mid-outreach
      // elsewhere, but the check is cheap and keeps the guarantee absolute.
      const { eligible, skipped } = await filterActivelyEnrolledElsewhere(
        emailable.map((p) => p.id),
        campaign.id,
      );
      crossCampaignDuplicatesSkipped = skipped.length;
      if (eligible.length > 0) {
        const eligibleSet = new Set(eligible);
        const orderedEligible = emailable.filter((p) => eligibleSet.has(p.id));
        const rows = await db
          .insert(campaignProspectsTable)
          .values(orderedEligible.map((p) => ({ campaignId: campaign.id, prospectId: p.id })))
          .returning();
        enrolled = rows.length;
      }
    }
  }

  logger.info(
    {
      created: result.created.length,
      enrolled,
      duplicatesSkipped: result.duplicatesSkipped,
      crossCampaignDuplicatesSkipped,
    },
    "Autonomous discovery run completed",
  );

  return {
    ran: true,
    created: result.created.length,
    enrolled,
    duplicatesSkipped: result.duplicatesSkipped,
    crossCampaignDuplicatesSkipped,
  };
}

export interface AutoSendRunResult {
  ran: boolean;
  sent: number;
  queued: number;
  failed: number;
  suppressed: number;
}

/**
 * Sends the next batch of pending prospects in the configured always-on
 * campaign, but only once its template has been explicitly approved by the
 * user -- the agent never sends under a template no one has reviewed.
 */
export async function runAutonomousSendIfEnabled(): Promise<AutoSendRunResult> {
  const settings = await getOrCreateSettings();
  if (!settings.autoEnrollCampaignId) {
    return { ran: false, sent: 0, queued: 0, failed: 0, suppressed: 0 };
  }

  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, settings.autoEnrollCampaignId));
  if (!campaign || !campaign.templateApproved || !campaign.subject || !campaign.body) {
    return { ran: false, sent: 0, queued: 0, failed: 0, suppressed: 0 };
  }

  const result = await sendCampaignBatch(campaign, settings, {
    pacingSeconds: settings.sendPacingSeconds,
    dailyLimitOverride: computeEffectiveDailyLimit(settings),
  });

  if (result.sent > 0 || result.failed > 0) {
    logger.info({ campaignId: campaign.id, ...result }, "Autonomous send run completed");
  }

  return { ran: true, ...result };
}
