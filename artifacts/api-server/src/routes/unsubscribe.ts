import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, prospectsTable } from "@workspace/db";
import { verifyUnsubscribeToken } from "../lib/unsubscribeToken";
import { logger } from "../lib/logger";

// Public, unauthenticated route -- registered before the `requireAuth`
// middleware in `routes/index.ts` so recipients can unsubscribe straight
// from the link in their inbox with no login required.
const router: IRouter = Router();

function page(title: string, message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #0f172a; }
  .card { max-width: 420px; padding: 2rem; text-align: center; }
  h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
  p { color: #475569; }
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

router.get("/unsubscribe", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const prospectId = token ? verifyUnsubscribeToken(token) : null;

  if (!prospectId) {
    res.status(400).send(page("Invalid link", "This unsubscribe link is invalid or has expired."));
    return;
  }

  const [prospect] = await db
    .select()
    .from(prospectsTable)
    .where(eq(prospectsTable.id, prospectId));

  if (!prospect) {
    res.status(404).send(page("Not found", "We couldn't find this contact."));
    return;
  }

  if (!prospect.unsubscribedAt) {
    await db
      .update(prospectsTable)
      .set({ unsubscribedAt: new Date(), unsubscribeReason: "Unsubscribed via email link" })
      .where(eq(prospectsTable.id, prospectId));
    logger.info({ prospectId }, "Prospect unsubscribed via email link");
  }

  res.status(200).send(
    page(
      "You're unsubscribed",
      "You won't receive any further emails from us. If this was a mistake, please reach out to the sender directly.",
    ),
  );
});

export default router;
