import type { NextApiResponse } from 'next';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { logger } from '../../../api-server/src/lib/logger';

const ALLOWED_EMAIL = 'rupesh@mechdesign.co';

export async function requireAuthNext(res: NextApiResponse): Promise<string | null> {
  const { userId } = auth() ?? {};
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const email = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress;

    if (email?.toLowerCase() !== ALLOWED_EMAIL) {
      logger.warn({ email }, 'Rejected sign-in from non-owner account');
      res.status(403).json({ error: `This app is restricted to ${ALLOWED_EMAIL}` });
      return null;
    }
  } catch (err) {
    logger.error({ err }, 'Failed to verify Clerk user identity');
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  return userId;
}
