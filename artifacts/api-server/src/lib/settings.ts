import { asc } from "drizzle-orm";
import { db, settingsTable, type Settings } from "@workspace/db";

/**
 * The app has exactly one settings row (a singleton). Creates it with
 * defaults on first access.
 */
export async function getOrCreateSettings(): Promise<Settings> {
  const [existing] = await db
    .select()
    .from(settingsTable)
    .orderBy(asc(settingsTable.id))
    .limit(1);
  if (existing) return existing;

  const [created] = await db.insert(settingsTable).values({}).returning();
  return created!;
}
