import cron from "node-cron";
import { logger } from "./logger";
import { isGmailConfigured } from "./gmail";
import { pollInboxAndProcess } from "./inbox";
import { processDueFollowups } from "./followups";
import { runAutonomousDiscoveryIfDue, runAutonomousSendIfEnabled } from "./autonomy";

let started = false;

export async function startScheduler(): Promise<void> {
  if (started) return;
  started = true;

  // Autonomous discovery only calls provider search APIs and writes
  // prospect rows -- it doesn't need Gmail, so it runs regardless of email
  // connection status. The cadence (daily/weekly) is enforced inside the
  // job itself; this hourly tick just checks whether a run is due.
  cron.schedule("0 * * * *", async () => {
    try {
      const result = await runAutonomousDiscoveryIfDue();
      if (result.ran) logger.info({ result }, "Scheduled autonomous discovery completed");
    } catch (err) {
      logger.error({ err }, "Scheduled autonomous discovery failed");
    }
  });

  if (!(await isGmailConfigured())) {
    logger.warn(
      "Gmail is not connected; background inbox polling, follow-ups, and autonomous sending are disabled until it is. Autonomous discovery will still run.",
    );
    return;
  }

  cron.schedule("*/15 * * * *", async () => {
    try {
      const result = await pollInboxAndProcess();
      logger.info({ result }, "Scheduled inbox poll completed");
    } catch (err) {
      logger.error({ err }, "Scheduled inbox poll failed");
    }
  });

  cron.schedule("0 * * * *", async () => {
    try {
      const result = await processDueFollowups();
      logger.info({ result }, "Scheduled follow-up run completed");
    } catch (err) {
      logger.error({ err }, "Scheduled follow-up run failed");
    }
  });

  // Autonomous sending for the configured always-on campaign, gated on the
  // template having been explicitly approved (see lib/autonomy.ts).
  cron.schedule("*/30 * * * *", async () => {
    try {
      const result = await runAutonomousSendIfEnabled();
      if (result.ran) logger.info({ result }, "Scheduled autonomous send completed");
    } catch (err) {
      logger.error({ err }, "Scheduled autonomous send failed");
    }
  });

  logger.info(
    "Background scheduler started: inbox polling every 15 minutes, follow-ups checked hourly, autonomous discovery/send checked hourly/every 30 minutes.",
  );
}
