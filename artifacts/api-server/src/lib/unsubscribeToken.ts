import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, unauthenticated unsubscribe tokens: `<prospectId>.<hmac>`, base64url
 * encoded. No session/login required to unsubscribe -- anyone with the link
 * from their own inbox can suppress that one prospect record, and the HMAC
 * prevents forging tokens for other prospect ids.
 */
function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be set to sign unsubscribe links.");
  }
  return secret;
}

function sign(prospectId: number): string {
  return createHmac("sha256", getSecret()).update(String(prospectId)).digest("base64url");
}

export function createUnsubscribeToken(prospectId: number): string {
  const payload = `${prospectId}.${sign(prospectId)}`;
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function verifyUnsubscribeToken(token: string): number | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const separatorIndex = decoded.lastIndexOf(".");
    if (separatorIndex === -1) return null;

    const prospectIdRaw = decoded.slice(0, separatorIndex);
    const signature = decoded.slice(separatorIndex + 1);
    const prospectId = Number(prospectIdRaw);
    if (!Number.isInteger(prospectId) || prospectId <= 0) return null;

    const expected = sign(prospectId);
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signature);
    if (expectedBuf.length !== actualBuf.length) return null;
    if (!timingSafeEqual(expectedBuf, actualBuf)) return null;

    return prospectId;
  } catch {
    return null;
  }
}
