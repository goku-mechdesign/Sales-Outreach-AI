/**
 * Gmail integration, backed by the Replit "google-mail" connector.
 *
 * The connector handles OAuth entirely at the account level (connect/
 * disconnect lives in Replit's own connection settings, outside this app).
 * On top of that we layer a soft "disabled" flag stored in
 * `integration_credentials` (key "gmail", field "disabled") so the user can
 * pause sending/polling from the Integrations page without revoking the
 * OAuth grant.
 */

import { ReplitConnectors } from "@replit/connectors-sdk";
import { getStoredValues } from "./credentials";
import { logger } from "./logger";

const CONNECTOR_NAME = "google-mail";
const connectors = new ReplitConnectors();

async function isDisabled(): Promise<boolean> {
  const stored = await getStoredValues("gmail");
  return stored?.disabled === "true";
}

// `listConnections` filters out connections whose credentials are withheld
// in this execution context, so it is not a reliable presence check (it can
// report empty even when the connection is genuinely attached). Instead we
// probe the connector directly via the proxy, which resolves credentials at
// request time. Cache the result briefly to avoid hitting Gmail's API on
// every status check.
let connectionCache: { connected: boolean; checkedAt: number } | null = null;
const CONNECTION_CACHE_MS = 60_000;

async function isConnected(): Promise<boolean> {
  if (connectionCache && Date.now() - connectionCache.checkedAt < CONNECTION_CACHE_MS) {
    return connectionCache.connected;
  }
  try {
    const res = await connectors.proxy(CONNECTOR_NAME, "/gmail/v1/users/me/profile");
    const connected = res.ok;
    connectionCache = { connected, checkedAt: Date.now() };
    return connected;
  } catch (err) {
    logger.error({ err }, "Failed to check Gmail connection status");
    connectionCache = { connected: false, checkedAt: Date.now() };
    return false;
  }
}

export async function isGmailConfigured(): Promise<boolean> {
  if (await isDisabled()) return false;
  return isConnected();
}

export interface SendGmailMessageParams {
  to: string;
  subject: string;
  body: string;
  threadId?: string | null;
}

export interface SendGmailMessageResult {
  gmailMessageId: string;
  gmailThreadId: string;
}

const NOT_CONNECTED_MESSAGE =
  "Gmail is not connected. Connect Gmail from Settings > Integrations to send or read email.";

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeHeaderValue(value: string): string {
  // Encode non-ASCII subject/name text per RFC 2047 to keep the message valid.
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

function buildRawMessage(params: SendGmailMessageParams): string {
  const lines = [
    `To: ${params.to}`,
    `Subject: ${encodeHeaderValue(params.subject)}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    "",
    params.body,
  ];
  return base64UrlEncode(lines.join("\r\n"));
}

export async function sendGmailMessage(
  params: SendGmailMessageParams,
): Promise<SendGmailMessageResult> {
  if (!(await isGmailConfigured())) {
    throw new Error(NOT_CONNECTED_MESSAGE);
  }

  const res = await connectors.proxy(CONNECTOR_NAME, "/gmail/v1/users/me/messages/send", {
    method: "POST",
    body: {
      raw: buildRawMessage(params),
      ...(params.threadId ? { threadId: params.threadId } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gmail send failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { id: string; threadId: string };
  return { gmailMessageId: data.id, gmailThreadId: data.threadId };
}

export interface GmailReply {
  gmailMessageId: string;
  gmailThreadId: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  receivedAt: Date;
}

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: {
    headers?: { name: string; value: string }[];
    mimeType?: string;
    body?: { data?: string };
    parts?: GmailMessagePart[];
  };
}

function getHeader(message: GmailMessage, name: string): string {
  return (
    message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
    ""
  );
}

function extractPlainTextBody(part: GmailMessagePart | undefined): string | null {
  if (!part) return null;
  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data, "base64").toString("utf-8");
  }
  for (const child of part.parts ?? []) {
    const found = extractPlainTextBody(child);
    if (found) return found;
  }
  return null;
}

function extractBody(message: GmailMessage): string {
  if (!message.payload) return "";
  const fromParts = extractPlainTextBody(message.payload as GmailMessagePart);
  if (fromParts) return fromParts;
  if (message.payload.body?.data) {
    return Buffer.from(message.payload.body.data, "base64").toString("utf-8");
  }
  return "";
}

/**
 * Fetches unread inbox messages (Gmail's own read/unread state acts as our
 * "already processed" marker), parses each into a `GmailReply`, then marks
 * them read so they aren't reprocessed on the next poll.
 */
export async function fetchNewGmailReplies(): Promise<GmailReply[]> {
  if (!(await isGmailConfigured())) {
    throw new Error(NOT_CONNECTED_MESSAGE);
  }

  const listRes = await connectors.proxy(
    CONNECTOR_NAME,
    "/gmail/v1/users/me/messages?q=in:inbox+is:unread&maxResults=25",
  );
  if (!listRes.ok) {
    const text = await listRes.text().catch(() => "");
    throw new Error(`Gmail list failed (${listRes.status}): ${text}`);
  }
  const list = (await listRes.json()) as { messages?: { id: string }[] };
  const replies: GmailReply[] = [];

  for (const { id } of list.messages ?? []) {
    try {
      const msgRes = await connectors.proxy(
        CONNECTOR_NAME,
        `/gmail/v1/users/me/messages/${id}?format=full`,
      );
      if (!msgRes.ok) continue;
      const message = (await msgRes.json()) as GmailMessage;

      replies.push({
        gmailMessageId: message.id,
        gmailThreadId: message.threadId,
        fromAddress: getHeader(message, "From"),
        toAddress: getHeader(message, "To"),
        subject: getHeader(message, "Subject"),
        body: extractBody(message),
        receivedAt: message.internalDate
          ? new Date(Number(message.internalDate))
          : new Date(),
      });

      await connectors.proxy(CONNECTOR_NAME, `/gmail/v1/users/me/messages/${id}/modify`, {
        method: "POST",
        body: { removeLabelIds: ["UNREAD"] },
      });
    } catch (err) {
      logger.error({ err, id }, "Failed to fetch/process Gmail message");
    }
  }

  return replies;
}
