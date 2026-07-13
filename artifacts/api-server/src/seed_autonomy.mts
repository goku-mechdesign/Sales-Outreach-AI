import { db, settingsTable, campaignsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const campaigns = await db.select().from(campaignsTable);
  console.log("Existing campaigns:", campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status })));

  const [settings] = await db.select().from(settingsTable);
  if (!settings) {
    console.log("No settings row found");
    process.exit(1);
  }

  await db
    .update(settingsTable)
    .set({
      autoDiscoveryEnabled: true,
      autoDiscoveryCadence: "weekly",
      autoDiscoveryTargetCount: 25,
    })
    .where(eq(settingsTable.id, settings.id));

  const [updated] = await db.select().from(settingsTable);
  console.log("Updated settings:", {
    autoDiscoveryEnabled: updated.autoDiscoveryEnabled,
    autoDiscoveryCadence: updated.autoDiscoveryCadence,
    autoDiscoveryTargetCount: updated.autoDiscoveryTargetCount,
    autoEnrollCampaignId: updated.autoEnrollCampaignId,
    sendPacingSeconds: updated.sendPacingSeconds,
  });
  process.exit(0);
}
main();
