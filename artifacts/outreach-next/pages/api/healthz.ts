import type { NextApiRequest, NextApiResponse } from 'next';
import { HealthCheckResponse } from '@workspace/api-zod';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method Not Allowed');
  }

  const data = HealthCheckResponse.parse({ status: 'ok' });
  return res.status(200).json(data);
}
