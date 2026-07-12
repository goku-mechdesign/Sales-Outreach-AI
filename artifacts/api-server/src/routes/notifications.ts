import { Router, type IRouter } from "express";
import { desc, eq, count, and } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import {
  ListNotificationsQueryParams,
  ListNotificationsResponse,
  GetUnreadNotificationCountResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/notifications", async (req, res): Promise<void> => {
  const parsed = ListNotificationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const whereClause = parsed.data.unreadOnly
    ? eq(notificationsTable.isRead, false)
    : undefined;
  const items = await db
    .select()
    .from(notificationsTable)
    .where(whereClause)
    .orderBy(desc(notificationsTable.createdAt));
  res.json(ListNotificationsResponse.parse(items));
});

router.get("/notifications/unread-count", async (_req, res): Promise<void> => {
  const [{ value }] = await db
    .select({ value: count() })
    .from(notificationsTable)
    .where(eq(notificationsTable.isRead, false));
  res.json(GetUnreadNotificationCountResponse.parse({ count: value }));
});

router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [notification] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.id, params.data.id))
    .returning();
  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json(MarkNotificationReadResponse.parse(notification));
});

export default router;
