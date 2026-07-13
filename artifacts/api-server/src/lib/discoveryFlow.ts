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

  // Precompute existing name/domain sets once instead of a query per
  // candidate. Domain match catches the same company discovered under
  // slightly different name formatting (e.g. "Acme Inc" vs "Acme, Inc.")
  // that the name-only check misses; both sets are updated as rows are
  // created so duplicates within the same discovery batch are also caught.
  const existingProspects = await db
    .select({ companyName: prospectsTable.companyName, website: prospectsTable.website })
    .from(prospectsTable);
  const existingNames = new Set(existingProspects.map((p) => p.companyName.trim().toLowerCase()));
  const existingDomains = new Set(
    existingProspects.map((p) => extractDomain(p.website)).filter((d): d is string => Boolean(d)),
  );

  for (const company of companies.slice(0, requestedCount)) {
    const domain = extractDomain(company.website);
    const nameKey = company.companyName.trim().toLowerCase();
    const isDuplicate = existingNames.has(nameKey) || (domain !== null && existingDomains.has(domain));
    if (isDuplicate) {
      duplicatesSkipped += 1;
      continue;
    }

    let email: string | null = null;
    let contactName: string | null = null;
    let confidenceScore = 0.4;
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
    existingNames.add(nameKey);
    if (domain) existingDomains.add(domain);
  }

  return { created, duplicatesSkipped, providersUsed, providersSkipped };
}
