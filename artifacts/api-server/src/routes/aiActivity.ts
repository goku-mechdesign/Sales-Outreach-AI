import { Router, type IRouter } from "express";
import { and, desc, eq, count } from "drizzle-orm";
import { db, aiActivityTable } from "@workspace/db";
import { ListAiActivityQueryParams, ListAiActivityResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/ai-activity", async (req, res): Promise<void> => {
  const parsed = ListAiActivityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { kind, status, page, pageSize } = parsed.data;

  const filters = [
    kind ? eq(aiActivityTable.kind, kind) : undefined,
    status ? eq(aiActivityTable.status, status) : undefined,
  ].filter((f): f is NonNullable<typeof f> => Boolean(f));
  const whereClause = filters.length ? and(...filters) : undefined;

  const [items, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(aiActivityTable)
      .where(whereClause)
      .orderBy(desc(aiActivityTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(aiActivityTable).where(whereClause),
  ]);

  res.json(ListAiActivityResponse.parse({ items, total, page, pageSize }));
});

export default router;
