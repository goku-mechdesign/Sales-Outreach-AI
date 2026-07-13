import type { NextApiRequest, NextApiResponse } from 'next';
import { eq } from 'drizzle-orm';
import { db, prospectsTable } from '@workspace/db';
import {
  GetProspectParams,
  GetProspectResponse,
  UpdateProspectBody,
  UpdateProspectResponse,
  DeleteProspectParams,
} from '@workspace/api-zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  if (req.method === 'GET') {
    const params = GetProspectParams.safeParse({ id });
    if (!params.success) return res.status(400).json({ error: params.error.message });

    const [prospect] = await db
      .select()
      .from(prospectsTable)
      .where(eq(prospectsTable.id, params.data.id));

    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
    return res.status(200).json(GetProspectResponse.parse(prospect));
  }

  if (req.method === 'PATCH') {
    const params = GetProspectParams.safeParse({ id });
    if (!params.success) return res.status(400).json({ error: params.error.message });

    const parsed = UpdateProspectBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

    const [prospect] = await db
      .update(prospectsTable)
      .set(parsed.data)
      .where(eq(prospectsTable.id, params.data.id))
      .returning();

    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
    return res.status(200).json(UpdateProspectResponse.parse(prospect));
  }

  if (req.method === 'DELETE') {
    const params = DeleteProspectParams.safeParse({ id });
    if (!params.success) return res.status(400).json({ error: params.error.message });

    const [prospect] = await db
      .delete(prospectsTable)
      .where(eq(prospectsTable.id, params.data.id))
      .returning();

    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  res.status(405).end('Method Not Allowed');
}
