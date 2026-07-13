import { and, eq, lte, isNotNull } from "drizzle-orm";
import {
  db,
  campaignProspectsTable,
  campaignsTable,
  prospectsTable,
  emailThreadsTable,
  emailMessagesTable,
  settingsTable,
} from "@workspace/db";
import { isGmailConfigured, sendGmailMessage } from "./gmail";
import { generateFollowupEmail } from "./llm";
import { logger } from "./logger";
import { getOrCreateSettings } from "./settings";
import { buildTrackedHtmlBody, newTrackingId } from "./emailTracking";

export interface FollowupRunResult {
  sent: number;
  failed: number;
  suppressed: number;
}

/**
 * Sends the next due follow-up email for every campaign prospect whose
 * `nextFollowupAt` has passed and who hasn't replied or been stopped. No-ops
 * if Gmail is not connected.
 */
export async function processDueFollowups(): Promise<FollowupRunResult> {
  if (!(await isGmailConfigured())) {
    return { sent: 0, failed: 0, suppressed: 0 };
  }

  const settings = await getOrCreateSettings();
  const now = new Date();

  const due = await db
    .select()
    .from(campaignProspectsTable)
    .where(
      and(
        eq(campaignProspectsTable.status, "sent"),
        isNotNull(campaignProspectsTable.nextFollowupAt),
        lte(campaignProspectsTable.nextFollowupAt, now),
      ),
    );

  let sent = 0;
  let failed = 0;
  let suppressed = 0;

  for (const cp of due) {
    if (cp.followupStage >= settings.followupDays.length) continue;

    try {
      const [campaign] = await db
        .select()
        .from(campaignsTable)
        .where(eq(campaignsTable.id, cp.campaignId));
      const [prospect] = await db
        .select()
        .from(prospectsTable)
        .where(eq(prospectsTable.id, cp.prospectId));
      if (!campaign || !prospect || !prospect.email) continue;

      if (prospect.unsubscribedAt) {
        await db
          .update(campaignProspectsTable)
          .set({
            status: "stopped",
            stoppedReason: "Prospect unsubscribed",
            nextFollowupAt: null,
          })
          .where(eq(campaignProspectsTable.id, cp.id));
        suppressed += 1;
        continue;
      }

      if (prospect.bouncedAt) {
        await db
          .update(campaignProspectsTable)
          .set({
            status: "bounced",
            stoppedReason: prospect.bounceReason ?? "Email address bounced",
            nextFollowupAt: null,
          })
          .where(eq(campaignProspectsTable.id, cp.id));
        suppressed += 1;
        continue;
      }

      const nextStage = cp.followupStage + 1;
      const draft = await generateFollowupEmail({
        campaign,
        companyName: prospect.companyName,
        contactName: prospect.contactName,
        previousSubject: campaign.subject ?? campaign.name,
        previousBody: campaign.body ?? "",
        followupStage: nextStage,
        language: prospect.detectedLanguage,
        country: prospect.country,
        companyContext: settings,
        campaignId: campaign.id,
        prospectId: prospect.id,
      });

      const trackingId = newTrackingId();
      const trackedHtmlBody = buildTrackedHtmlBody(draft.body, trackingId);
      const result = await sendGmailMessage({
        to: prospect.email,
        subject: draft.subject,
        body: trackedHtmlBody,
        contentType: "text/html",
        threadId: cp.gmailThreadId,
      });

      const [thread] = await db
        .select()
        .from(emailThreadsTable)
        .where(eq(emailThreadsTable.gmailThreadId, result.gmailThreadId));

      if (thread) {
        await db.insert(emailMessagesTable).values({
          threadId: thread.id,
          direction: "outgoing",
          gmailMessageId: result.gmailMessageId,
          fromAddress: settings.notificationEmail ?? "",
          toAddress: prospect.email,
          subject: draft.subject,
          body: draft.body,
          status: "sent",
          sentAt: now,
          trackingId,
        });
      }

      const isLastStage = nextStage >= settings.followupDays.length;
      const nextDelayDays = settings.followupDays[nextStage];

      await db
        .update(campaignProspectsTable)
        .set({
          followupStage: nextStage,
          lastEmailAt: now,
          nextFollowupAt:
            isLastStage || nextDelayDays === undefined
              ? null
              : new Date(now.getTime() + nextDelayDays * 24 * 60 * 60 * 1000),
        })
        .where(eq(campaignProspectsTable.id, cp.id));

      sent += 1;
    } catch (err) {
      logger.error(
        { err, campaignProspectId: cp.id },
        "Failed to send follow-up email",
      );
      failed += 1;
    }
  }

  return { sent, failed, suppressed };
}
