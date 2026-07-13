/**
 * Resolves the publicly reachable base URL for this server, for use in
 * links embedded in outgoing emails (e.g. the unsubscribe link). The API
 * server is exposed under the `/api` path prefix on the shared Replit
 * proxy domain -- see `.replit-artifact/artifact.toml`.
 */
export function getPublicApiBaseUrl(): string {
  const domains = process.env.REPLIT_DOMAINS;
  const firstDomain = domains?.split(",")[0]?.trim();
  const host = firstDomain || process.env.REPLIT_DEV_DOMAIN;
  if (!host) {
    throw new Error(
      "Unable to resolve a public domain (REPLIT_DOMAINS / REPLIT_DEV_DOMAIN are both unset).",
    );
  }
  return `https://${host}/api`;
}
