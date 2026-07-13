import { eq } from "drizzle-orm";
import {
  db,
  campaignsTable,
  campaignProspectsTable,
  prospectsTable,
  emailThreadsTable,
  emailMessagesTable,
  type Campaign,
  type Settings,
} from "@workspace/db";
import { generateCampaignTemplate, translateEmailTemplate, type GeneratedEmail } from "./llm";
import { applyMergeTokens } from "./mergeTokens";
import { isGmailConfigured, sendGmailMessage } from "./gmail";
import { logger } from "./logger";
import { createUnsubscribeToken } from "./unsubscribeToken";
import { getPublicApiBaseUrl } from "./urls";

export interface CampaignSendResult {
  sent: number;
  queued: number;
  failed: number;
  suppressed: number;
}

function buildUnsubscribeUrl(prospectId: number): string {
  return `${getPublicApiBaseUrl()}/unsubscribe?token=${createUnsubscribeToken(prospectId)}`;
}

/** Appends a one-click unsubscribe footer to every outgoing email, unless the template already references it via {{unsubscribeUrl}}. */
function withUnsubscribeFooter(body: string, unsubscribeUrl: string): string {
  if (body.includes(unsubscribeUrl)) return body;
  return `${body}\n\n---\nDon't want to hear from us again? Unsubscribe: ${unsubscribeUrl}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends the campaign's template to every pending prospect, up to the day's
 * remaining quota. Shared by the manual "Send now" route and the autonomous
 * send scheduler tick so both paths behave identically.
 *
 * `pacingSeconds` inserts a delay between consecutive sends -- this is a
 * deliberate deliverability safeguard so autonomous bulk sends don't look
 * like a burst to mail providers and put the sender's domain at risk.
 */
export async function sendCampaignBatch(
  campaign: Campaign,
  settings: Settings,
  opts: { pacingSeconds?: number } = {},
): Promise<CampaignSendResult> {
  if (!campaign.subject || !campaign.body) {
    return { sent: 0, queued: 0, failed: 0, suppressed: 0 };
  }

  const pacingMs = Math.max(0, opts.pacingSeconds ?? 0) * 1000;

  const allCp = await db
    .select()
    .from(campaignProspectsTable)
    .where(eq(campaignProspectsTable.campaignId, campaign.id));
  const pendingOnly = allCp.filter((p) => p.status === "pending");

  const alreadySentToday = allCp.filter(
    (p) => p.lastEmailAt && p.lastEmailAt.toDateString() === new Date().toDateString(),
  ).length;
  const remainingQuota = Math.max(settings.maxEmailsPerDay - alreadySentToday, 0);
  const toSend = pendingOnly.slice(0, remainingQuota);
  const queued = pendingOnly.length - toSend.length;

  let sent = 0;
  let failed = 0;
  let suppressed = 0;

  const localizedTemplates = new Map<string, GeneratedEmail>();
  async function templateForRegion(
    language: string | null | undefined,
    country: string | null | undefined,
  ): Promise<GeneratedEmail> {
    const languageCode = language?.trim().toLowerCase() || "en";
    const countryKey = country?.trim().toLowerCase() || "";
    const cacheKey = `${languageCode}:${countryKey}`;
    let localized = localizedTemplates.get(cacheKey);
    if (!localized) {
      localized = await translateEmailTemplate({
        subject: campaign.subject!,
        body: campaign.body!,
        targetLanguage: languageCode,
        country,
        campaignId: campaign.id,
      });
      localizedTemplates.set(cacheKey, localized);
    }
    return localized;
  }

  for (let i = 0; i < toSend.length; i++) {
    const cp = toSend[i]!;
    if (i > 0 && pacingMs > 0) {
      await sleep(pacingMs);
    }

    const [prospect] = await db
      .select()
      .from(prospectsTable)
      .where(eq(prospectsTable.id, cp.prospectId));
    if (!prospect?.email) {
      await db
        .update(campaignProspectsTable)
        .set({ status: "bounced", stoppedReason: "No email address on file" })
        .where(eq(campaignProspectsTable.id, cp.id));
      failed += 1;
      continue;
    }

    if (prospect.unsubscribedAt) {
      await db
        .update(campaignProspectsTable)
        .set({ status: "stopped", stoppedReason: "Prospect unsubscribed" })
        .where(eq(campaignProspectsTable.id, cp.id));
      suppressed += 1;
      continue;
    }

    if (prospect.bouncedAt) {
      await db
        .update(campaignProspectsTable)
        .set({ status: "bounced", stoppedReason: prospect.bounceReason ?? "Email address bounced" })
        .where(eq(campaignProspectsTable.id, cp.id));
      suppressed += 1;
      continue;
    }

    if (!(await isGmailConfigured())) {
      await db
        .update(campaignProspectsTable)
        .set({ stoppedReason: "Gmail is not connected" })
        .where(eq(campaignProspectsTable.id, cp.id));
      failed += 1;
      continue;
    }

    try {
      const template = await templateForRegion(prospect.detectedLanguage, prospect.country);
      const unsubscribeUrl = buildUnsubscribeUrl(prospect.id);
      const subject = applyMergeTokens(template.subject, prospect);
      const body = withUnsubscribeFooter(
        applyMergeTokens(template.body, { ...prospect, unsubscribeUrl }),
        unsubscribeUrl,
      );
      const result = await sendGmailMessage({ to: prospect.email, subject, body });

      const [thread] = await db
        .insert(emailThreadsTable)
        .values({
          prospectId: prospect.id,
          campaignProspectId: cp.id,
          companyName: prospect.companyName,
          gmailThreadId: result.gmailThreadId,
          subject,
        })
        .returning();

      await db.insert(emailMessagesTable).values({
        threadId: thread!.id,
        direction: "outgoing",
        gmailMessageId: result.gmailMessageId,
        fromAddress: settings.notificationEmail ?? "",
        toAddress: prospect.email,
        subject,
        body,
        status: "sent",
        sentAt: new Date(),
      });

      const firstFollowupDays = settings.followupDays[0];
      await db
        .update(campaignProspectsTable)
        .set({
          status: "sent",
          gmailThreadId: result.gmailThreadId,
          lastEmailAt: new Date(),
          nextFollowupAt:
            firstFollowupDays !== undefined
              ? new Date(Date.now() + firstFollowupDays * 24 * 60 * 60 * 1000)
              : null,
        })
        .where(eq(campaignProspectsTable.id, cp.id));
      await db
        .update(prospectsTable)
        .set({ status: "contacted" })
        .where(eq(prospectsTable.id, prospect.id));

      sent += 1;
    } catch (err) {
      logger.error({ err, campaignProspectId: cp.id }, "Failed to send campaign email");
      await db
        .update(campaignProspectsTable)
        .set({ stoppedReason: err instanceof Error ? err.message : "Send failed" })
        .where(eq(campaignProspectsTable.id, cp.id));
      failed += 1;
    }
  }

  await db
    .update(campaignsTable)
    .set({ status: sent > 0 || failed > 0 ? "sending" : campaign.status, sentAt: new Date() })
    .where(eq(campaignsTable.id, campaign.id));

  const refreshedCp = await db
    .select()
    .from(campaignProspectsTable)
    .where(eq(campaignProspectsTable.campaignId, campaign.id));
  const remainingPending = refreshedCp.some((r) => r.status === "pending");
  if (!remainingPending) {
    await db
      .update(campaignsTable)
      .set({ status: "completed" })
      .where(eq(campaignsTable.id, campaign.id));
  }

  return { sent, queued, failed, suppressed };
}
