import { Router, type IRouter } from "express";
import { eq, count, countDistinct, and, isNotNull, lte, desc } from "drizzle-orm";
import {
  db,
  prospectsTable,
  emailMessagesTable,
  emailThreadsTable,
  emailEventsTable,
  campaignProspectsTable,
} from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [
    [{ value: prospectsImported }],
    [{ value: emailsSent }],
    [{ value: replies }],
    [{ value: interestedLeads }],
    [{ value: followupsPending }],
    [{ value: opens }],
    [{ value: clicks }],
    interestedThreads,
  ] = await Promise.all([
    db.select({ value: count() }).from(prospectsTable),
    db
      .select({ value: count() })
      .from(emailMessagesTable)
      .where(eq(emailMessagesTable.direction, "outgoing")),
    db
      .select({ value: count() })
      .from(emailMessagesTable)
      .where(eq(emailMessagesTable.direction, "incoming")),
    db
      .select({ value: count() })
      .from(emailThreadsTable)
      .where(eq(emailThreadsTable.isHot, true)),
    db
      .select({ value: count() })
      .from(campaignProspectsTable)
      .where(
        and(
          eq(campaignProspectsTable.status, "sent"),
          isNotNull(campaignProspectsTable.nextFollowupAt),
        ),
      ),
    // Distinct messages with >=1 open/click, not raw event count, so a
    // recipient re-opening the same email repeatedly doesn't inflate the
    // rate past 100%.
    db
      .select({ value: countDistinct(emailEventsTable.messageId) })
      .from(emailEventsTable)
      .where(eq(emailEventsTable.type, "open")),
    db
      .select({ value: countDistinct(emailEventsTable.messageId) })
      .from(emailEventsTable)
      .where(eq(emailEventsTable.type, "click")),
    // Who, specifically, is interested -- every hot-flagged thread with the
    // prospect's contact info attached, most recent first.
    db
      .select({
        threadId: emailThreadsTable.id,
        prospectId: emailThreadsTable.prospectId,
        companyName: emailThreadsTable.companyName,
        category: emailThreadsTable.category,
        summary: emailThreadsTable.aiSummary,
        lastMessageAt: emailThreadsTable.lastMessageAt,
        contactName: prospectsTable.contactName,
        email: prospectsTable.email,
      })
      .from(emailThreadsTable)
      .leftJoin(prospectsTable, eq(emailThreadsTable.prospectId, prospectsTable.id))
      .where(eq(emailThreadsTable.isHot, true))
      .orderBy(desc(emailThreadsTable.lastMessageAt))
      .limit(20),
  ]);

  res.json(
    GetDashboardSummaryResponse.parse({
      prospectsImported,
      emailsSent,
      replies,
      interestedLeads,
      followupsPending,
      opens,
      clicks,
      openRate: emailsSent > 0 ? opens / emailsSent : 0,
      clickRate: emailsSent > 0 ? clicks / emailsSent : 0,
      interestedProspects: interestedThreads.map((t) => ({
        ...t,
        category: t.category ?? "interested",
      })),
    }),
  );
});

export default router;
