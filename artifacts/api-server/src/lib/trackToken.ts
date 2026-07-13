import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, unauthenticated open/click tracking tokens: `<trackingId>.<hmac>`,
 * base64url encoded. `trackingId` is an opaque per-message uuid (see
 * `emailMessagesTable.trackingId`) rather than the numeric message id, so a
 * pixel/link URL never leaks a guessable, enumerable identifier. The HMAC
 * prevents forging tokens for other messages.
 */
function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be set to sign tracking links.");
  }
  return secret;
}

function sign(trackingId: string): string {
  return createHmac("sha256", getSecret()).update(trackingId).digest("base64url");
}

export function createTrackToken(trackingId: string): string {
  const payload = `${trackingId}.${sign(trackingId)}`;
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function verifyTrackToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const separatorIndex = decoded.lastIndexOf(".");
    if (separatorIndex === -1) return null;

    const trackingId = decoded.slice(0, separatorIndex);
    const signature = decoded.slice(separatorIndex + 1);
    if (!trackingId) return null;

    const expected = sign(trackingId);
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signature);
    if (expectedBuf.length !== actualBuf.length) return null;
    if (!timingSafeEqual(expectedBuf, actualBuf)) return null;

    return trackingId;
  } catch {
    return null;
  }
}
