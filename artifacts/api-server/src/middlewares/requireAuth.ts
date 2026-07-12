import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { logger } from "../lib/logger";

/**
 * This app is a single-user tool. Only this email may sign in and use it.
 * Anyone else who authenticates via Clerk is rejected with 403.
 */
const ALLOWED_EMAIL = "rupesh@mechdesign.co";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const userId = auth?.userId;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const email = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId,
    )?.emailAddress;

    if (email?.toLowerCase() !== ALLOWED_EMAIL) {
      req.log.warn({ email }, "Rejected sign-in from non-owner account");
      res.status(403).json({
        error: `This app is restricted to ${ALLOWED_EMAIL}`,
      });
      return;
    }
  } catch (err) {
    logger.error({ err }, "Failed to verify Clerk user identity");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.userId = userId;
  next();
}
