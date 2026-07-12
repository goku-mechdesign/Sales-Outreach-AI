import { logger } from "../logger";
import { getCredentialValue } from "../credentials";

const HUNTER_BASE = "https://api.hunter.io/v2";

export async function isHunterConfigured(): Promise<boolean> {
  return Boolean(await getCredentialValue("hunter", "apiKey", "HUNTER_API_KEY"));
}

export interface FoundEmail {
  email: string;
  contactName: string | null;
  confidence: number;
}

export async function hunterFindEmail(
  domain: string,
): Promise<FoundEmail | null> {
  const key = await getCredentialValue("hunter", "apiKey", "HUNTER_API_KEY");
  if (!key) return null;

  const url = new URL(`${HUNTER_BASE}/domain-search`);
  url.searchParams.set("domain", domain);
  url.searchParams.set("api_key", key);
  url.searchParams.set("limit", "1");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Hunter API error: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    data?: {
      emails?: Array<{
        value: string;
        first_name?: string;
        last_name?: string;
        confidence?: number;
      }>;
    };
  };
  const first = data.data?.emails?.[0];
  if (!first) return null;

  logger.debug({ domain }, "Hunter found email");
  return {
    email: first.value,
    contactName:
      [first.first_name, first.last_name].filter(Boolean).join(" ") || null,
    confidence: (first.confidence ?? 50) / 100,
  };
}
