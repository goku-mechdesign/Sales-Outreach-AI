import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, count } from "drizzle-orm";
import { db, emailThreadsTable, emailMessagesTable, prospectsTable } from "@workspace/db";
import {
  ListThreadsQueryParams,
  ListThreadsResponse,
  GetThreadParams,
  GetThreadResponse,
  SendReplyParams,
  SendReplyBody,
  SendReplyResponse,
  GenerateReplyDraftParams,
  GenerateReplyDraftResponse,
  PollInboxResponse,
} from "@workspace/api-zod";
import { generateReplyDraft } from "../lib/llm";
import { isGmailConfigured, sendGmailMessage } from "../lib/gmail";
import { getOrCreateSettings } from "../lib/settings";
import { pollInboxAndProcess } from "../lib/inbox";

const router: IRouter = Router();

async function getThreadDetail(threadId: number) {
  const [thread] = await db
    .select()
    .from(emailThreadsTable)
    .where(eq(emailThreadsTable.id, threadId));
  if (!thread) return null;
  const messages = await db
    .select()
    .from(emailMessagesTable)
    .where(eq(emailMessagesTable.threadId, threadId))
    .orderBy(emailMessagesTable.createdAt);
  return { ...thread, messages, draftReply: thread.draftReply };
}

router.get("/threads", async (req, res): Promise<void> => {
  const parsed = ListThreadsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { category, isHot, search, page, pageSize } = parsed.data;

  const filters = [
    category ? eq(emailThreadsTable.category, category) : undefined,
    isHot !== undefined ? eq(emailThreadsTable.isHot, isHot) : undefined,
    search ? ilike(emailThreadsTable.companyName, `%${search}%`) : undefined,
  ].filter((f): f is NonNullable<typeof f> => Boolean(f));
  const whereClause = filters.length ? and(...filters) : undefined;

  const [items, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(emailThreadsTable)
      .where(whereClause)
      .orderBy(desc(emailThreadsTable.lastMessageAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(emailThreadsTable).where(whereClause),
  ]);

  res.json(ListThreadsResponse.parse({ items, total, page, pageSize }));
});

router.get("/threads/:id", async (req, res): Promise<void> => {
  const params = GetThreadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const detail = await getThreadDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  res.json(GetThreadResponse.parse(detail));
});

router.post("/threads/:id/reply", async (req, res): Promise<void> => {
  const params = SendReplyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SendReplyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [thread] = await db
    .select()
    .from(emailThreadsTable)
    .where(eq(emailThreadsTable.id, params.data.id));
  if (!thread) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }

  if (!(await isGmailConfigured())) {
    res.status(400).json({
      error: "Gmail is not connected. Connect it in Settings > Integrations to reply.",
    });
    return;
  }

  const body = parsed.data.useDraft ? thread.draftReply : parsed.data.body;
  if (!body) {
    res.status(400).json({ error: "No draft or body text provided." });
    return;
  }

  const settings = await getOrCreateSettings();
  const lastIncoming = (
    await db
      .select()
      .from(emailMessagesTable)
      .where(eq(emailMessagesTable.threadId, thread.id))
      .orderBy(desc(emailMessagesTable.createdAt))
  ).find((m) => m.direction === "incoming");

  const result = await sendGmailMessage({
    to: lastIncoming?.fromAddress ?? "",
    subject: thread.subject,
    body,
    threadId: thread.gmailThreadId,
  });

  await db.insert(emailMessagesTable).values({
    threadId: thread.id,
    direction: "outgoing",
    gmailMessageId: result.gmailMessageId,
    fromAddress: settings.notificationEmail ?? "",
    toAddress: lastIncoming?.fromAddress ?? "",
    subject: thread.subject,
    body,
    status: "sent",
    sentAt: new Date(),
  });

  await db
    .update(emailThreadsTable)
    .set({ lastMessageAt: new Date(), draftReply: null })
    .where(eq(emailThreadsTable.id, thread.id));

  const detail = await getThreadDetail(thread.id);
  res.json(SendReplyResponse.parse(detail));
});

router.post("/threads/:id/generate-draft", async (req, res): Promise<void> => {
  const params = GenerateReplyDraftParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [thread] = await db
    .select()
    .from(emailThreadsTable)
    .where(eq(emailThreadsTable.id, params.data.id));
  if (!thread) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  const messages = await db
    .select()
    .from(emailMessagesTable)
    .where(eq(emailMessagesTable.threadId, thread.id))
    .orderBy(emailMessagesTable.createdAt);
  const settings = await getOrCreateSettings();
  const prospect = thread.prospectId
    ? (
        await db
          .select()
          .from(prospectsTable)
          .where(eq(prospectsTable.id, thread.prospectId))
      )[0]
    : undefined;

  const draft = await generateReplyDraft({
    threadSubject: thread.subject,
    messages,
    companyContext: settings,
    language: prospect?.detectedLanguage,
    country: prospect?.country,
    threadId: thread.id,
  });

  await db
    .update(emailThreadsTable)
    .set({ draftReply: draft })
    .where(eq(emailThreadsTable.id, thread.id));

  const detail = await getThreadDetail(thread.id);
  res.json(GenerateReplyDraftResponse.parse(detail));
});

router.post("/email/poll", async (_req, res): Promise<void> => {
  const result = await pollInboxAndProcess();
  res.json(PollInboxResponse.parse(result));
});

export default router;
