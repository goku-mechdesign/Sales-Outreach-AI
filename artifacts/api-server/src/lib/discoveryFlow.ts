import { ilike } from "drizzle-orm";
import { db, prospectsTable, type Prospect } from "@workspace/db";
import { runDiscovery, findEmailForDomain, extractDomain } from "./providers";
import { guessLanguageFromCountry } from "./languageGuess";
import { computeLeadScore } from "./leadScoring";
import { getOrCreateSettings } from "./settings";

export interface DiscoveryFlowParams {
  industry: string;
  country: string;
  city?: string;
  keywords?: string;
  count: number;
}

export interface DiscoveryFlowResult {
  created: Prospect[];
  duplicatesSkipped: number;
  providersUsed: string[];
  providersSkipped: string[];
}

/**
 * Runs prospect discovery against configured providers and inserts new
 * prospect rows, skipping companies already in the database. Shared by the
 * manual "Discover" route and the autonomous discovery scheduler so both
 * paths stay in sync.
 */
export async function discoverAndCreateProspects(
  params: DiscoveryFlowParams,
): Promise<DiscoveryFlowResult> {
  const { count: requestedCount, ...rest } = params;
  const { companies, providersUsed, providersSkipped } = await runDiscovery({
    ...rest,
    count: requestedCount,
  });

  const created: Prospect[] = [];
  let duplicatesSkipped = 0;
  const settings = await getOrCreateSettings();

  for (const company of companies.slice(0, requestedCount)) {
    const [existing] = await db
      .select()
      .from(prospectsTable)
      .where(ilike(prospectsTable.companyName, company.companyName));
    if (existing) {
      duplicatesSkipped += 1;
      continue;
    }

    let email: string | null = null;
    let contactName: string | null = null;
    let confidenceScore = 0.4;
    const domain = extractDomain(company.website);
    if (domain) {
      const found = await findEmailForDomain(domain);
      if (found) {
        email = found.email;
        contactName = found.contactName;
        confidenceScore = found.confidence;
      }
    }

    const leadScore = computeLeadScore(
      { confidenceScore, email, contactName, industry: company.industry, country: company.country },
      settings,
    );

    const [row] = await db
      .insert(prospectsTable)
      .values({
        companyName: company.companyName,
        website: company.website,
        industry: company.industry,
        country: company.country,
        city: company.city,
        linkedinUrl: company.linkedinUrl,
        source: company.source,
        email,
        contactName,
        confidenceScore,
        leadScore,
        detectedLanguage: guessLanguageFromCountry(company.country, company.city),
      })
      .returning();
    created.push(row!);
  }

  return { created, duplicatesSkipped, providersUsed, providersSkipped };
}
