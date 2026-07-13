import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, emailMessagesTable, emailEventsTable } from "@workspace/db";
import { verifyTrackToken } from "../lib/trackToken";
import { logger } from "../lib/logger";

// Public, unauthenticated routes -- registered before `requireAuth` in
// `routes/index.ts` so the pixel/link embedded in a recipient's inbox works
// with no login. Mirrors the /unsubscribe route's pattern.
const router: IRouter = Router();

// 1x1 transparent GIF, served for every open-tracking pixel hit.
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7",
  "base64",
);

async function resolveMessageByTrackingId(trackingId: string) {
  const [message] = await db
    .select()
    .from(emailMessagesTable)
    .where(eq(emailMessagesTable.trackingId, trackingId));
  return message;
}

router.get("/track/open/:token", async (req, res): Promise<void> => {
  res.set("Content-Type", "image/gif");
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");

  // Token may arrive with a cosmetic ".gif" suffix (added so some mail
  // clients treat the pixel as an image URL) -- strip it before verifying.
  const rawToken = req.params.token;
  const token = rawToken.endsWith(".gif") ? rawToken.slice(0, -4) : rawToken;
  const trackingId = verifyTrackToken(token);
  if (trackingId) {
    try {
      const message = await resolveMessageByTrackingId(trackingId);
      if (message) {
        await db.insert(emailEventsTable).values({
          messageId: message.id,
          threadId: message.threadId,
          type: "open",
        });
      }
    } catch (err) {
      logger.error({ err, trackingId }, "Failed to record email open event");
    }
  }

  res.status(200).send(TRANSPARENT_GIF);
});

router.get("/track/click/:token", async (req, res): Promise<void> => {
  const destination = typeof req.query.u === "string" ? req.query.u : undefined;
  const fallback = "https://google.com";

  let safeDestination = fallback;
  if (destination) {
    try {
      const parsed = new URL(destination);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        safeDestination = destination;
      }
    } catch {
      // Malformed URL -- fall through to the safe fallback.
    }
  }

  const trackingId = verifyTrackToken(req.params.token);
  if (trackingId) {
    try {
      const message = await resolveMessageByTrackingId(trackingId);
      if (message) {
        await db.insert(emailEventsTable).values({
          messageId: message.id,
          threadId: message.threadId,
          type: "click",
          url: safeDestination,
        });
      }
    } catch (err) {
      logger.error({ err, trackingId }, "Failed to record email click event");
    }
  }

  res.redirect(302, safeDestination);
});

export default router;
