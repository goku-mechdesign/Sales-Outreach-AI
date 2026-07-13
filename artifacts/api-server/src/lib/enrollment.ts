import { inArray } from "drizzle-orm";
import { db, campaignProspectsTable } from "@workspace/db";
import type { campaignProspectStatusValues } from "@workspace/db";

type CampaignProspectStatus = (typeof campaignProspectStatusValues)[number];

// A prospect is still "actively worked" by a campaign until it reaches a
// terminal state -- replied, bounced, or manually stopped. While active, it
// must not also be enrolled in a second campaign at the same time.
const ACTIVE_STATUSES: CampaignProspectStatus[] = ["pending", "sent"];

export interface EnrollmentFilterResult {
  eligible: number[];
  skipped: number[];
}

/**
 * Splits `prospectIds` into those eligible for (re-)enrollment and those
 * that must be skipped because they're already actively enrolled
 * (pending/sent, not yet replied/bounced/stopped) in a different campaign.
 * Shared by manual campaign creation and autonomous auto-enrollment so both
 * paths enforce the same cross-campaign rule.
 */
export async function filterActivelyEnrolledElsewhere(
  prospectIds: number[],
  excludeCampaignId?: number,
): Promise<EnrollmentFilterResult> {
  if (prospectIds.length === 0) return { eligible: [], skipped: [] };

  const rows = await db
    .select({
      prospectId: campaignProspectsTable.prospectId,
      campaignId: campaignProspectsTable.campaignId,
      status: campaignProspectsTable.status,
    })
    .from(campaignProspectsTable)
    .where(inArray(campaignProspectsTable.prospectId, prospectIds));

  const activeElsewhere = new Set(
    rows
      .filter(
        (r) =>
          ACTIVE_STATUSES.includes(r.status) &&
          (excludeCampaignId === undefined || r.campaignId !== excludeCampaignId),
      )
      .map((r) => r.prospectId),
  );

  const eligible: number[] = [];
  const skipped: number[] = [];
  for (const id of prospectIds) {
    (activeElsewhere.has(id) ? skipped : eligible).push(id);
  }
  return { eligible, skipped };
}
