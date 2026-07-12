import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { GetSettingsResponse, UpdateSettingsBody, UpdateSettingsResponse } from "@workspace/api-zod";
import { getOrCreateSettings } from "../lib/settings";

const router: IRouter = Router();

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(GetSettingsResponse.parse(settings));
});

router.patch("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const current = await getOrCreateSettings();
  const [updated] = await db
    .update(settingsTable)
    .set(parsed.data)
    .where(eq(settingsTable.id, current.id))
    .returning();
  res.json(UpdateSettingsResponse.parse(updated));
});

export default router;
