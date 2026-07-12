import type { FoundEmail } from "./hunter";

export function isSnovConfigured(): boolean {
  return Boolean(process.env.SNOV_CLIENT_ID && process.env.SNOV_CLIENT_SECRET);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getSnovToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  const res = await fetch("https://api.snov.io/v1/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SNOV_CLIENT_ID ?? "",
      client_secret: process.env.SNOV_CLIENT_SECRET ?? "",
    }),
  });
  if (!res.ok) {
    throw new Error(`Snov auth error: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3000) * 1000,
  };
  return data.access_token;
}

export async function snovFindEmail(
  domain: string,
): Promise<FoundEmail | null> {
  if (!isSnovConfigured()) return null;
  const token = await getSnovToken();

  const url = new URL("https://api.snov.io/v2/domain-emails-with-info");
  url.searchParams.set("domain", domain);
  url.searchParams.set("type", "all");
  url.searchParams.set("limit", "1");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Snov API error: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    emails?: Array<{
      email: string;
      firstName?: string;
      lastName?: string;
      emailStatus?: string;
    }>;
  };
  const first = data.emails?.[0];
  if (!first) return null;

  return {
    email: first.email,
    contactName:
      [first.firstName, first.lastName].filter(Boolean).join(" ") || null,
    confidence: first.emailStatus === "valid" ? 0.8 : 0.5,
  };
}
