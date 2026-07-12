import { logger } from "../logger";
import { apolloDiscoverCompanies, isApolloConfigured } from "./apollo";
import { crunchbaseDiscoverCompanies, isCrunchbaseConfigured } from "./crunchbase";
import {
  opencorporatesDiscoverCompanies,
  isOpenCorporatesConfigured,
} from "./opencorporates";
import { hunterFindEmail, isHunterConfigured, type FoundEmail } from "./hunter";
import { snovFindEmail, isSnovConfigured } from "./snov";
import type { DiscoveredCompany } from "./apollo";

export type DiscoveryProviderKey = "apollo" | "crunchbase" | "opencorporates";

interface DiscoveryParams {
  industry: string;
  country: string;
  city?: string;
  keywords?: string;
  count: number;
}

const DISCOVERY_PROVIDERS: Array<{
  key: DiscoveryProviderKey;
  isConfigured: () => boolean;
  run: (params: DiscoveryParams) => Promise<DiscoveredCompany[]>;
}> = [
  { key: "apollo", isConfigured: isApolloConfigured, run: apolloDiscoverCompanies },
  {
    key: "crunchbase",
    isConfigured: isCrunchbaseConfigured,
    run: crunchbaseDiscoverCompanies,
  },
  {
    key: "opencorporates",
    isConfigured: isOpenCorporatesConfigured,
    run: opencorporatesDiscoverCompanies,
  },
];

export interface DiscoveryOutcome {
  companies: Array<DiscoveredCompany & { source: DiscoveryProviderKey }>;
  providersUsed: string[];
  providersSkipped: string[];
}

export async function runDiscovery(
  params: DiscoveryParams,
): Promise<DiscoveryOutcome> {
  const companies: Array<DiscoveredCompany & { source: DiscoveryProviderKey }> =
    [];
  const providersUsed: string[] = [];
  const providersSkipped: string[] = [];

  for (const provider of DISCOVERY_PROVIDERS) {
    if (!provider.isConfigured()) {
      providersSkipped.push(provider.key);
      continue;
    }
    try {
      const results = await provider.run(params);
      companies.push(...results.map((c) => ({ ...c, source: provider.key })));
      providersUsed.push(provider.key);
    } catch (err) {
      logger.error({ err, provider: provider.key }, "Discovery provider failed");
      providersSkipped.push(provider.key);
    }
  }

  return { companies, providersUsed, providersSkipped };
}

export type EmailFinderProviderKey = "hunter" | "snov";

export async function findEmailForDomain(
  domain: string,
): Promise<(FoundEmail & { source: EmailFinderProviderKey }) | null> {
  if (isHunterConfigured()) {
    try {
      const result = await hunterFindEmail(domain);
      if (result) return { ...result, source: "hunter" };
    } catch (err) {
      logger.error({ err, domain }, "Hunter email lookup failed");
    }
  }
  if (isSnovConfigured()) {
    try {
      const result = await snovFindEmail(domain);
      if (result) return { ...result, source: "snov" };
    } catch (err) {
      logger.error({ err, domain }, "Snov email lookup failed");
    }
  }
  return null;
}

export function extractDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
