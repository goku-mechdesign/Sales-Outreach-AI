import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  emailThreadsTable,
  emailMessagesTable,
  campaignProspectsTable,
  notificationsTable,
  prospectsTable,
  type ReplyCategory,
  type Settings,
} from "@workspace/db";
import { fetchNewGmailReplies, isGmailConfigured, sendGmailMessage, type GmailReply } from "./gmail";
import { classifyReply, generateReplyDraft } from "./llm";
import { getOrCreateSettings } from "./settings";
import { logger } from "./logger";

export interface PollResult {
  newMessages: number;
  newlyClassified: number;
  hotLeads: number;
  autoReplied: number;
  bounces: number;
}

const BOUNCE_SENDER_PATTERN = /mailer-daemon|postmaster|mail delivery subsystem/i;
const BOUNCE_SUBJECT_PATTERN =
  /delivery status notification|delivery (has )?failed|undeliver(ed|able)|returned mail|mail delivery (failed|subsystem)|failure notice/i;

/**
 * Heuristic bounce detection: real hard bounces come back as automated
 * postmaster/mailer-daemon notifications rather than a human reply, either
 * from a recognizable sender address or with a standard bounce subject line
 * (both vary by mail provider, so we check either).
 */
function isBounceNotification(reply: GmailReply): boolean {
  return (
    BOUNCE_SENDER_PATTERN.test(reply.fromAddress) ||
    BOUNCE_SUBJECT_PATTERN.test(reply.subject)
  );
}

/** Pulls a short human-readable reason out of a bounce notification body, falling back to a generic message. */
function extractBounceReason(body: string): string {
  const smtpStatus = body.match(/\b5\d{2}[ -]\d\.\d\.\d\b[^\n]*/);
  if (smtpStatus) return smtpStatus[0].trim().slice(0, 300);

  const line = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !/^(hi|hello|dear)/i.test(l));
  return (line || "Message could not be delivered").slice(0, 300);
}

/**
 * Whether the agent is allowed to draft AND send a reply for this
 * classification with no human review, per the user's autonomy settings.
 * Hot leads can be carved out to always wait for review regardless of
 * category, since that's the highest-stakes moment in the pipeline.
 */
function shouldAutoSend(
  settings: Settings,
  category: ReplyCategory,
  isHot: boolean,
): boolean {
  if (!settings.autoReplyEnabled) return false;
  if (!settings.autoReplyCategories.includes(category)) return false;
  if (isHot && settings.autoReplyHoldHotLeads) return false;
  return true;
}

/**
 * Fetches new Gmail replies, files them into threads, classifies them with
 * the LLM, and either auto-sends a reply (per the user's autonomy settings
 * in Settings > Agent autonomy) or drafts one for manual review. Raises a
 * notification for hot leads, and optionally for auto-sent replies. No-ops
 * (returns zero counts) if Gmail is not connected -- callers should check
 * `isGmailConfigured()` first if they want to surface that distinctly.
 */
export async function pollInboxAndProcess(): Promise<PollResult> {
  if (!(await isGmailConfigured())) {
    return { newMessages: 0, newlyClassified: 0, hotLeads: 0, autoReplied: 0, bounces: 0 };
  }

  const replies = await fetchNewGmailReplies();
  let newlyClassified = 0;
  let hotLeads = 0;
  let autoReplied = 0;
  let bounces = 0;

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

    if (isBounceNotification(reply)) {
      try {
        const reason = extractBounceReason(reply.body);
        const [thread] = await db
          .select()
          .from(emailThreadsTable)
          .where(eq(emailThreadsTable.id, threadId));

        let campaignProspectId = thread?.campaignProspectId ?? null;
        let prospectId = thread?.prospectId ?? null;

        if (!campaignProspectId) {
          const [cp] = await db
            .select()
            .from(campaignProspectsTable)
            .where(eq(campaignProspectsTable.gmailThreadId, reply.gmailThreadId));
          if (cp) {
            campaignProspectId = cp.id;
            prospectId = cp.prospectId;
          }
        }

        if (campaignProspectId) {
          await db
            .update(campaignProspectsTable)
            .set({ status: "bounced", stoppedReason: reason, nextFollowupAt: null })
            .where(eq(campaignProspectsTable.id, campaignProspectId));
        }

        if (prospectId) {
          await db
            .update(prospectsTable)
            .set({ status: "bounced", bouncedAt: reply.receivedAt, bounceReason: reason })
            .where(eq(prospectsTable.id, prospectId));

          await db.insert(notificationsTable).values({
            threadId,
            title: "📭 Email bounced",
            body: `Delivery to ${thread?.companyName ?? "a prospect"} failed: ${reason}`,
          });
        } else {
          logger.error(
            { threadId, gmailThreadId: reply.gmailThreadId },
            "Bounce notification received but could not be correlated to a prospect",
          );
        }

        bounces += 1;
      } catch (err) {
        logger.error({ err, threadId }, "Failed to process bounce notification");
      }
      continue;
    }

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

      const settings = await getOrCreateSettings();
      const autoSendThisReply = shouldAutoSend(
        settings,
        classification.category,
        classification.isHot,
      );

      // Draft a reply whenever it's a hot lead (so it's ready the moment the
      // user opens it) or whenever auto-send is in play for this category.
      if (classification.isHot || autoSendThisReply) {
        try {
          const prospect = existingThread?.prospectId
            ? (
                await db
                  .select()
                  .from(prospectsTable)
                  .where(eq(prospectsTable.id, existingThread.prospectId))
              )[0]
            : undefined;
          const messages = await db
            .select()
            .from(emailMessagesTable)
            .where(eq(emailMessagesTable.threadId, threadId))
            .orderBy(emailMessagesTable.createdAt);
          const draft = await generateReplyDraft({
            threadSubject: reply.subject,
            messages,
            companyContext: settings,
            language: prospect?.detectedLanguage,
            country: prospect?.country,
            threadId,
          });

          if (autoSendThisReply) {
            const result = await sendGmailMessage({
              to: reply.fromAddress,
              subject: reply.subject,
              body: draft,
              threadId: reply.gmailThreadId,
            });

            await db.insert(emailMessagesTable).values({
              threadId,
              direction: "outgoing",
              gmailMessageId: result.gmailMessageId,
              fromAddress: settings.notificationEmail ?? "",
              toAddress: reply.fromAddress,
              subject: reply.subject,
              body: draft,
              status: "auto_sent",
              sentAt: new Date(),
            });

            await db
              .update(emailThreadsTable)
              .set({ lastMessageAt: new Date(), draftReply: null })
              .where(eq(emailThreadsTable.id, threadId));

            autoReplied += 1;

            if (settings.notifyOnAutoReply) {
              await db.insert(notificationsTable).values({
                threadId,
                title: "🤖 Agent auto-replied",
                body: `Agent Mail replied to ${reply.fromAddress} on its own (category: ${classification.category}).`,
              });
            }
          } else {
            await db
              .update(emailThreadsTable)
              .set({ draftReply: draft })
              .where(eq(emailThreadsTable.id, threadId));
          }
        } catch (err) {
          logger.error(
            { err, threadId, autoSendThisReply },
            autoSendThisReply
              ? "Failed to auto-send reply; leaving in inbox for manual review"
              : "Failed to auto-draft reply",
          );
        }
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
    autoReplied,
    bounces,
  };
}
