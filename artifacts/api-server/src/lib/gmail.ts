/**
 * Gmail integration.
 *
 * The user has not yet connected the Replit Gmail connector, so this module
 * intentionally has no working credentials. It reports itself as
 * unconfigured and throws a clear, actionable error if a caller tries to
 * send or poll mail anyway -- callers must check `isGmailConfigured()` first
 * and surface a friendly message instead of attempting the call.
 *
 * Once the user connects Gmail (Settings > Integrations), replace the
 * internals of `sendGmailMessage` / `fetchNewGmailReplies` with real calls
 * using the connector's OAuth client, and flip `isGmailConfigured` to check
 * for the connector's env vars.
 */

export function isGmailConfigured(): boolean {
  return false;
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

export async function sendGmailMessage(
  _params: SendGmailMessageParams,
): Promise<SendGmailMessageResult> {
  throw new Error(NOT_CONNECTED_MESSAGE);
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

export async function fetchNewGmailReplies(): Promise<GmailReply[]> {
  throw new Error(NOT_CONNECTED_MESSAGE);
}
