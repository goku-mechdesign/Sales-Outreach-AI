import type { NextApiRequest, NextApiResponse } from 'next';
import { and, desc, count, ilike, eq } from 'drizzle-orm';
import { db, prospectsTable } from '@workspace/db';
import {
  ListProspectsQueryParams,
  ListProspectsResponse,
  CreateProspectBody,
  CreateProspectResponse,
} from '@workspace/api-zod';
import { guessLanguageFromCountry } from '../../../api-server/src/lib/languageGuess';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
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
    return;
  }

  if (req.method === 'POST') {
    const parsed = CreateProspectBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [prospect] = await db
      .insert(prospectsTable)
      .values({
        ...parsed.data,
        source: 'manual',
        detectedLanguage: guessLanguageFromCountry(parsed.data.country, parsed.data.city),
      })
      .returning();

    res.status(201).json(CreateProspectResponse.parse(prospect));
    return;
  }

  res.setHeader('Allow', 'GET, POST');
  res.status(405).end('Method Not Allowed');
}
