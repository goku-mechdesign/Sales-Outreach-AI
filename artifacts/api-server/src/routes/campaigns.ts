import { Router, type IRouter } from "express";
import { eq, inArray, desc } from "drizzle-orm";
import {
  db,
  campaignsTable,
  campaignProspectsTable,
  prospectsTable,
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
import { generateCampaignTemplate } from "../lib/llm";
import { applyMergeTokens } from "../lib/mergeTokens";
import { isGmailConfigured, sendGmailMessage } from "../lib/gmail";
import { getOrCreateSettings } from "../lib/settings";
import { sendCampaignBatch } from "../lib/campaignSend";
import { filterActivelyEnrolledElsewhere } from "../lib/enrollment";

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

  // A prospect already actively worked (pending/sent) in another campaign
  // can't also be enrolled here -- skip it rather than double-enrolling.
  const { eligible, skipped } = await filterActivelyEnrolledElsewhere(prospectIds);

  const [campaign] = await db
    .insert(campaignsTable)
    .values(campaignFields)
    .returning();

  const cpRows =
    eligible.length > 0
      ? await db
          .insert(campaignProspectsTable)
          .values(eligible.map((prospectId) => ({ campaignId: campaign!.id, prospectId })))
          .returning()
      : [];

  const detail = await withCounts(campaign!);
  const prospects = await withProspectDetails(cpRows);
  res
    .status(201)
    .json(
      CreateCampaignResponse.parse({
        ...detail,
        prospects,
        skippedDuplicateCount: skipped.length,
      }),
    );
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
  // Editing the subject/body invalidates any prior approval to auto-send.
  const invalidatesApproval = parsed.data.subject !== undefined || parsed.data.body !== undefined;
  const [campaign] = await db
    .update(campaignsTable)
    .set({ ...parsed.data, ...(invalidatesApproval ? { templateApproved: false } : {}) })
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
    // Template changed -- require re-approval before the agent can
    // autonomously send under it again.
    .set({ subject: draft.subject, body: draft.body, templateApproved: false })
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
  // Manual "Send now" clicks are a deliberate, already-reviewed action, so
  // pacing is only applied to autonomous sends (see lib/autonomy.ts).
  const { sent, queued, failed, suppressed } = await sendCampaignBatch(campaign, settings);

  const [refreshedCampaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaign.id));
  const cpRows = await db
    .select()
    .from(campaignProspectsTable)
    .where(eq(campaignProspectsTable.campaignId, campaign.id));

  const detail = await withCounts(refreshedCampaign!);
  const prospects = await withProspectDetails(cpRows);

  res.json(
    SendCampaignResponse.parse({
      sent,
      queued,
      failed,
      suppressed,
      campaign: { ...detail, prospects },
    }),
  );
});

router.post("/campaigns/:id/approve-template", async (req, res): Promise<void> => {
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
  if (!campaign.subject || !campaign.body) {
    res.status(400).json({ error: "Generate the email template before approving it." });
    return;
  }
  const [updated] = await db
    .update(campaignsTable)
    .set({ templateApproved: true })
    .where(eq(campaignsTable.id, campaign.id))
    .returning();
  const cpRows = await db
    .select()
    .from(campaignProspectsTable)
    .where(eq(campaignProspectsTable.campaignId, campaign.id));
  const detail = await withCounts(updated!);
  const prospects = await withProspectDetails(cpRows);
  res.json(GetCampaignResponse.parse({ ...detail, prospects }));
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
