import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, count } from "drizzle-orm";
import { db, prospectsTable } from "@workspace/db";
import {
  ListProspectsQueryParams,
  ListProspectsResponse,
  CreateProspectBody,
  CreateProspectResponse,
  DiscoverProspectsBody,
  DiscoverProspectsResponse,
  BulkUpdateProspectStatusBody,
  BulkUpdateProspectStatusResponse,
  GetProspectParams,
  GetProspectResponse,
  UpdateProspectParams,
  UpdateProspectBody,
  UpdateProspectResponse,
  DeleteProspectParams,
} from "@workspace/api-zod";
import { guessLanguageFromCountry } from "../lib/languageGuess";
import { discoverAndCreateProspects } from "../lib/discoveryFlow";

const router: IRouter = Router();

router.get("/prospects", async (req, res): Promise<void> => {
  const parsed = ListProspectsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { status, search, page, pageSize } = parsed.data;

  const filters = [
    status ? eq(prospectsTable.status, status) : undefined,
    search ? ilike(prospectsTable.companyName, `%${search}%`) : undefined,
  ].filter((f): f is NonNullable<typeof f> => Boolean(f));
  const whereClause = filters.length ? and(...filters) : undefined;

  const [items, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(prospectsTable)
      .where(whereClause)
      .orderBy(desc(prospectsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(prospectsTable).where(whereClause),
  ]);

  res.json(ListProspectsResponse.parse({ items, total, page, pageSize }));
});

router.post("/prospects", async (req, res): Promise<void> => {
  const parsed = CreateProspectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [prospect] = await db
    .insert(prospectsTable)
    .values({
      ...parsed.data,
      source: "manual",
      detectedLanguage: guessLanguageFromCountry(parsed.data.country, parsed.data.city),
    })
    .returning();
  res.status(201).json(CreateProspectResponse.parse(prospect));
});

router.post("/prospects/discover", async (req, res): Promise<void> => {
  const parsed = DiscoverProspectsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await discoverAndCreateProspects(parsed.data);
  res.json(DiscoverProspectsResponse.parse(result));
});

router.post("/prospects/bulk-status", async (req, res): Promise<void> => {
  const parsed = BulkUpdateProspectStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { ids, status } = parsed.data;
  if (ids.length === 0) {
    res.json(BulkUpdateProspectStatusResponse.parse([]));
    return;
  }

  const updated = [];
  for (const id of ids) {
    const [row] = await db
      .update(prospectsTable)
      .set({ status })
      .where(eq(prospectsTable.id, id))
      .returning();
    if (row) updated.push(row);
  }
  res.json(BulkUpdateProspectStatusResponse.parse(updated));
});

router.get("/prospects/:id", async (req, res): Promise<void> => {
  const params = GetProspectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [prospect] = await db
    .select()
    .from(prospectsTable)
    .where(eq(prospectsTable.id, params.data.id));
  if (!prospect) {
    res.status(404).json({ error: "Prospect not found" });
    return;
  }
  res.json(GetProspectResponse.parse(prospect));
});

router.patch("/prospects/:id", async (req, res): Promise<void> => {
  const params = UpdateProspectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProspectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [prospect] = await db
    .update(prospectsTable)
    .set(parsed.data)
    .where(eq(prospectsTable.id, params.data.id))
    .returning();
  if (!prospect) {
    res.status(404).json({ error: "Prospect not found" });
    return;
  }
  res.json(UpdateProspectResponse.parse(prospect));
});

router.delete("/prospects/:id", async (req, res): Promise<void> => {
  const params = DeleteProspectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [prospect] = await db
    .delete(prospectsTable)
    .where(eq(prospectsTable.id, params.data.id))
    .returning();
  if (!prospect) {
    res.status(404).json({ error: "Prospect not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
