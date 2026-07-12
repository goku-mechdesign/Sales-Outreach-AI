import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  emailThreadsTable,
  emailMessagesTable,
  campaignProspectsTable,
  notificationsTable,
} from "@workspace/db";
import { fetchNewGmailReplies, isGmailConfigured } from "./gmail";
import { classifyReply } from "./llm";
import { logger } from "./logger";

export interface PollResult {
  newMessages: number;
  newlyClassified: number;
  hotLeads: number;
}

/**
 * Fetches new Gmail replies, files them into threads, classifies them with
 * the LLM, and raises a notification for hot leads. No-ops (returns zero
 * counts) if Gmail is not connected -- callers should check
 * `isGmailConfigured()` first if they want to surface that distinctly.
 */
export async function pollInboxAndProcess(): Promise<PollResult> {
  if (!isGmailConfigured()) {
    return { newMessages: 0, newlyClassified: 0, hotLeads: 0 };
  }

  const replies = await fetchNewGmailReplies();
  let newlyClassified = 0;
  let hotLeads = 0;

  for (const reply of replies) {
    const [existingThread] = await db
      .select()
      .from(emailThreadsTable)
      .where(eq(emailThreadsTable.gmailThreadId, reply.gmailThreadId));

    const threadId = existingThread
      ? existingThread.id
      : (
          await db
            .insert(emailThreadsTable)
            .values({
              companyName: reply.fromAddress,
              gmailThreadId: reply.gmailThreadId,
              subject: reply.subject,
              lastMessageAt: reply.receivedAt,
            })
            .returning({ id: emailThreadsTable.id })
        )[0]!.id;

    await db.insert(emailMessagesTable).values({
      threadId,
      direction: "incoming",
      gmailMessageId: reply.gmailMessageId,
      fromAddress: reply.fromAddress,
      toAddress: reply.toAddress,
      subject: reply.subject,
      body: reply.body,
      status: "sent",
      sentAt: reply.receivedAt,
    });

    await db
      .update(emailThreadsTable)
      .set({ lastMessageAt: reply.receivedAt })
      .where(eq(emailThreadsTable.id, threadId));

    try {
      const classification = await classifyReply({
        emailBody: reply.body,
        threadId,
      });
      newlyClassified += 1;
      if (classification.isHot) hotLeads += 1;

      await db
        .update(emailThreadsTable)
        .set({
          category: classification.category,
          categoryConfidence: classification.confidence,
          isHot: classification.isHot,
          aiSummary: classification.summary,
        })
        .where(eq(emailThreadsTable.id, threadId));

      if (classification.isHot) {
        await db.insert(notificationsTable).values({
          threadId,
          title: "🔥 Hot lead reply",
          body: `${reply.fromAddress} replied: ${classification.summary}`,
        });
      }

      // Stop follow-ups for the related campaign prospect once they reply.
      await db
        .update(campaignProspectsTable)
        .set({ status: "replied", stoppedReason: "Prospect replied" })
        .where(
          and(
            eq(campaignProspectsTable.gmailThreadId, reply.gmailThreadId),
            isNull(campaignProspectsTable.stoppedReason),
          ),
        );
    } catch (err) {
      logger.error({ err, threadId }, "Failed to classify inbound reply");
    }
  }

  return {
    newMessages: replies.length,
    newlyClassified,
    hotLeads,
  };
}
