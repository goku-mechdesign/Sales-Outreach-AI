import { eq } from "drizzle-orm";
import { db, integrationCredentialsTable } from "@workspace/db";

/**
 * Stores/reads user-supplied overrides for third-party integration
 * credentials (entered from the Integrations page) on top of the
 * environment-secret defaults. DB values always win over env vars so a
 * user can change a key from the UI without restarting the process.
 */

export interface CredentialField {
  name: string;
  label: string;
  envVar: string;
  secret?: boolean;
}

// Providers whose credentials can be edited from the UI. Gmail is handled
// separately (connector-based) and is not part of this map.
export const PROVIDER_CREDENTIAL_FIELDS: Record<string, CredentialField[]> = {
  gemini: [{ name: "apiKey", label: "API key", envVar: "GEMINI_API_KEY", secret: true }],
  nvidia: [
    { name: "apiKey", label: "API key", envVar: "NVIDIA_API_KEY", secret: true },
    { name: "model", label: "Model (optional)", envVar: "", secret: false },
  ],
  openrouter: [
    { name: "apiKey", label: "API key", envVar: "OPENROUTER_API_KEY", secret: true },
    { name: "model", label: "Model (optional)", envVar: "", secret: false },
  ],
  apollo: [{ name: "apiKey", label: "API key", envVar: "APOLLO_API_KEY", secret: true }],
  hunter: [{ name: "apiKey", label: "API key", envVar: "HUNTER_API_KEY", secret: true }],
};

let cache: Record<string, Record<string, string>> | null = null;

async function loadCache(): Promise<Record<string, Record<string, string>>> {
  if (cache) return cache;
  const rows = await db.select().from(integrationCredentialsTable);
  const next: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    next[row.key] = (row.values as Record<string, string>) ?? {};
  }
  cache = next;
  return cache;
}

export function invalidateCredentialCache(): void {
  cache = null;
}

export async function getStoredValues(
  key: string,
): Promise<Record<string, string> | undefined> {
  const stored = await loadCache();
  return stored[key];
}

export async function getCredentialValue(
  key: string,
  field: string,
  envVar?: string,
): Promise<string | undefined> {
  const stored = await loadCache();
  const value = stored[key]?.[field];
  if (value) return value;
  return envVar ? process.env[envVar] : undefined;
}

/** Whether the given key has a value stored via the UI (as opposed to env). */
export async function hasStoredOverride(key: string): Promise<boolean> {
  const stored = await loadCache();
  const values = stored[key];
  return Boolean(values && Object.values(values).some((v) => Boolean(v)));
}

export async function setCredentialValues(
  key: string,
  values: Record<string, string>,
): Promise<void> {
  await db
    .insert(integrationCredentialsTable)
    .values({ key, values })
    .onConflictDoUpdate({
      target: integrationCredentialsTable.key,
      set: { values, updatedAt: new Date() },
    });
  invalidateCredentialCache();
}

export async function clearCredential(key: string): Promise<void> {
  await db
    .delete(integrationCredentialsTable)
    .where(eq(integrationCredentialsTable.key, key));
  invalidateCredentialCache();
}
