import { Router, type IRouter } from "express";
import { eq, inArray, desc } from "drizzle-orm";
import {
  db,
  campaignsTable,
  campaignProspectsTable,
  prospectsTable,
  emailThreadsTable,
  emailMessagesTable,
  type Campaign,
  type CampaignProspect,
} from "@workspace/db";
import {
  ListCampaignsResponse,
  CreateCampaignBody,
  CreateCampaignResponse,
  GetCampaignParams,
  GetCampaignResponse,
  UpdateCampaignParams,
  UpdateCampaignBody,
  UpdateCampaignResponse,
  DeleteCampaignParams,
  GenerateCampaignEmailParams,
  GenerateCampaignEmailResponse,
  SendTestEmailParams,
  SendTestEmailResponse,
  SendCampaignParams,
  SendCampaignResponse,
  ScheduleCampaignParams,
  ScheduleCampaignBody,
  ScheduleCampaignResponse,
} from "@workspace/api-zod";
import { generateCampaignTemplate, translateEmailTemplate, type GeneratedEmail } from "../lib/llm";
import { applyMergeTokens } from "../lib/mergeTokens";
import { isGmailConfigured, sendGmailMessage } from "../lib/gmail";
import { getOrCreateSettings } from "../lib/settings";

const router: IRouter = Router();

async function withCounts(campaign: Campaign) {
  const rows = await db
    .select()
    .from(campaignProspectsTable)
    .where(eq(campaignProspectsTable.campaignId, campaign.id));
  return {
    ...campaign,
    prospectCount: rows.length,
    sentCount: rows.filter((r) => r.status !== "pending").length,
  };
}

async function withProspectDetails(rows: CampaignProspect[]) {
  if (rows.length === 0) return [];
  const prospects = await db
    .select()
    .from(prospectsTable)
    .where(
      inArray(
        prospectsTable.id,
        rows.map((r) => r.prospectId),
      ),
    );
  const byId = new Map(prospects.map((p) => [p.id, p]));
  return rows.map((r) => ({
    id: r.id,
    prospectId: r.prospectId,
    companyName: byId.get(r.prospectId)?.companyName ?? "Unknown",
    contactEmail: byId.get(r.prospectId)?.email ?? null,
    status: r.status,
    followupStage: r.followupStage,
    lastEmailAt: r.lastEmailAt,
    nextFollowupAt: r.nextFollowupAt,
    gmailThreadId: r.gmailThreadId,
    stoppedReason: r.stoppedReason,
    createdAt: r.createdAt,
  }));
}

router.get("/campaigns", async (_req, res): Promise<void> => {
  const campaigns = await db
    .select()
    .from(campaignsTable)
    .orderBy(desc(campaignsTable.createdAt));
  const withCountsList = await Promise.all(campaigns.map(withCounts));
  res.json(ListCampaignsResponse.parse(withCountsList));
});

router.post("/campaigns", async (req, res): Promise<void> => {
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { prospectIds, ...campaignFields } = parsed.data;

  const [campaign] = await db
    .insert(campaignsTable)
    .values(campaignFields)
    .returning();

  const cpRows =
    prospectIds.length > 0
      ? await db
          .insert(campaignProspectsTable)
          .values(prospectIds.map((prospectId) => ({ campaignId: campaign!.id, prospectId })))
          .returning()
      : [];

  const detail = await withCounts(campaign!);
  const prospects = await withProspectDetails(cpRows);
  res.status(201).json(GetCampaignResponse.parse({ ...detail, prospects }));
});

router.get("/campaigns/:id", async (req, res): Promise<void> => {
  const params = GetCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, params.data.id));
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const cpRows = await db
    .select()
    .from(campaignProspectsTable)
    .where(eq(campaignProspectsTable.campaignId, campaign.id));
  const detail = await withCounts(campaign);
  const prospects = await withProspectDetails(cpRows);
  res.json(GetCampaignResponse.parse({ ...detail, prospects }));
});

router.patch("/campaigns/:id", async (req, res): Promise<void> => {
  const params = UpdateCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [campaign] = await db
    .update(campaignsTable)
    .set(parsed.data)
    .where(eq(campaignsTable.id, params.data.id))
    .returning();
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const cpRows = await db
    .select()
    .from(campaignProspectsTable)
    .where(eq(campaignProspectsTable.campaignId, campaign.id));
  const detail = await withCounts(campaign);
  const prospects = await withProspectDetails(cpRows);
  res.json(UpdateCampaignResponse.parse({ ...detail, prospects }));
});

router.delete("/campaigns/:id", async (req, res): Promise<void> => {
  const params = DeleteCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [campaign] = await db
    .delete(campaignsTable)
    .where(eq(campaignsTable.id, params.data.id))
    .returning();
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/campaigns/:id/generate", async (req, res): Promise<void> => {
  const params = GenerateCampaignEmailParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, params.data.id));
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const settings = await getOrCreateSettings();
  const draft = await generateCampaignTemplate({
    campaign,
    companyContext: settings,
    campaignId: campaign.id,
  });

  const [updated] = await db
    .update(campaignsTable)
    .set({ subject: draft.subject, body: draft.body })
    .where(eq(campaignsTable.id, campaign.id))
    .returning();

  const cpRows = await db
    .select()
    .from(campaignProspectsTable)
    .where(eq(campaignProspectsTable.campaignId, campaign.id));
  const detail = await withCounts(updated!);
  const prospects = await withProspectDetails(cpRows);
  res.json(GenerateCampaignEmailResponse.parse({ ...detail, prospects }));
});

router.post("/campaigns/:id/send-test", async (req, res): Promise<void> => {
  const params = SendTestEmailParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, params.data.id));
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  if (!campaign.subject || !campaign.body) {
    res.json(
      SendTestEmailResponse.parse({
        success: false,
        message: "Generate the email template first.",
      }),
    );
    return;
  }

  const settings = await getOrCreateSettings();
  const gmailConfigured = await isGmailConfigured();
  if (!gmailConfigured || !settings.notificationEmail) {
    res.json(
      SendTestEmailResponse.parse({
        success: false,
        message: !gmailConfigured
          ? "Gmail is not connected. Connect it in Settings > Integrations."
          : "Add a notification email in Settings to receive test sends.",
      }),
    );
    return;
  }

  try {
    await sendGmailMessage({
      to: settings.notificationEmail,
      subject: `[TEST] ${applyMergeTokens(campaign.subject, { contactName: "Alex", companyName: "Acme Co" })}`,
      body: applyMergeTokens(campaign.body, { contactName: "Alex", companyName: "Acme Co" }),
    });
    res.json(SendTestEmailResponse.parse({ success: true, message: "Test email sent." }));
  } catch (err) {
    req.log.error({ err }, "Failed to send test email");
    res.json(
      SendTestEmailResponse.parse({
        success: false,
        message: err instanceof Error ? err.message : "Failed to send test email.",
      }),
    );
  }
});

router.post("/campaigns/:id/send", async (req, res): Promise<void> => {
  const params = SendCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, params.data.id));
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  if (!campaign.subject || !campaign.body) {
    res.status(400).json({ error: "Generate the email template before sending." });
    return;
  }

  const settings = await getOrCreateSettings();
  const pending = await db
    .select()
    .from(campaignProspectsTable)
    .where(eq(campaignProspectsTable.campaignId, campaign.id));
  const pendingOnly = pending.filter((p) => p.status === "pending");

  const alreadySentToday = pending.filter(
    (p) =>
      p.lastEmailAt &&
      p.lastEmailAt.toDateString() === new Date().toDateString(),
  ).length;
  const remainingQuota = Math.max(settings.maxEmailsPerDay - alreadySentToday, 0);
  const toSend = pendingOnly.slice(0, remainingQuota);
  const queued = pendingOnly.length - toSend.length;

  let sent = 0;
  let failed = 0;

  // Cache the campaign template translated into each prospect's detected
  // language so we only call the LLM once per unique language, not once per
  // prospect.
  const translatedTemplates = new Map<string, GeneratedEmail>();
  async function templateForLanguage(language: string | null | undefined): Promise<GeneratedEmail> {
    const code = language?.trim().toLowerCase() || "en";
    if (code === "en") return { subject: campaign!.subject!, body: campaign!.body! };
    let translated = translatedTemplates.get(code);
    if (!translated) {
      translated = await translateEmailTemplate({
        subject: campaign!.subject!,
        body: campaign!.body!,
        targetLanguage: code,
        campaignId: campaign!.id,
      });
      translatedTemplates.set(code, translated);
    }
    return translated;
  }

  for (const cp of toSend) {
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

    if (!(await isGmailConfigured())) {
      await db
        .update(campaignProspectsTable)
        .set({ stoppedReason: "Gmail is not connected" })
        .where(eq(campaignProspectsTable.id, cp.id));
      failed += 1;
      continue;
    }

    try {
      const template = await templateForLanguage(prospect.detectedLanguage);
      const subject = applyMergeTokens(template.subject, prospect);
      const body = applyMergeTokens(template.body, prospect);
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
      req.log.error({ err, campaignProspectId: cp.id }, "Failed to send campaign email");
      await db
        .update(campaignProspectsTable)
        .set({
          stoppedReason: err instanceof Error ? err.message : "Send failed",
        })
        .where(eq(campaignProspectsTable.id, cp.id));
      failed += 1;
    }
  }

  const [refreshedCampaign] = await db
    .update(campaignsTable)
    .set({ status: sent > 0 || failed > 0 ? "sending" : campaign.status, sentAt: new Date() })
    .where(eq(campaignsTable.id, campaign.id))
    .returning();
  const cpRows = await db
    .select()
    .from(campaignProspectsTable)
    .where(eq(campaignProspectsTable.campaignId, campaign.id));
  const remainingPending = cpRows.some((r) => r.status === "pending");
  if (!remainingPending) {
    await db
      .update(campaignsTable)
      .set({ status: "completed" })
      .where(eq(campaignsTable.id, campaign.id));
  }

  const detail = await withCounts(refreshedCampaign!);
  const prospects = await withProspectDetails(cpRows);

  res.json(
    SendCampaignResponse.parse({
      sent,
      queued,
      failed,
      campaign: { ...detail, prospects },
    }),
  );
});

router.post("/campaigns/:id/schedule", async (req, res): Promise<void> => {
  const params = ScheduleCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ScheduleCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [campaign] = await db
    .update(campaignsTable)
    .set({ status: "scheduled", scheduledAt: parsed.data.scheduledAt })
    .where(eq(campaignsTable.id, params.data.id))
    .returning();
  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const cpRows = await db
    .select()
    .from(campaignProspectsTable)
    .where(eq(campaignProspectsTable.campaignId, campaign.id));
  const detail = await withCounts(campaign);
  const prospects = await withProspectDetails(cpRows);
  res.json(ScheduleCampaignResponse.parse({ ...detail, prospects }));
});

export default router;
