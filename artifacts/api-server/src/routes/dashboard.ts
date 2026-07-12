import { Router, type IRouter } from "express";
import { eq, count, and, isNotNull, lte } from "drizzle-orm";
import {
  db,
  prospectsTable,
  emailMessagesTable,
  emailThreadsTable,
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
  ]);

  res.json(
    GetDashboardSummaryResponse.parse({
      prospectsImported,
      emailsSent,
      replies,
      interestedLeads,
      followupsPending,
    }),
  );
});

export default router;
