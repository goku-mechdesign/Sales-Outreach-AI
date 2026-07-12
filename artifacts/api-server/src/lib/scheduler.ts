import cron from "node-cron";
import { logger } from "./logger";
import { isGmailConfigured } from "./gmail";
import { pollInboxAndProcess } from "./inbox";
import { processDueFollowups } from "./followups";

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  if (!isGmailConfigured()) {
    logger.warn(
      "Gmail is not connected; background inbox polling and follow-up sending are disabled until it is.",
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

  logger.info(
    "Background scheduler started: inbox polling every 15 minutes, follow-ups checked hourly.",
  );
}
