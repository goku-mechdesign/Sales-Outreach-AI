import type { Settings } from "@workspace/db";

export type LeadScoreTier = "high" | "medium" | "low";

interface ScorableProspect {
  confidenceScore: number | null;
  email: string | null;
  contactName: string | null;
  industry: string | null;
  country: string | null;
}

/** Loosely compares two free-text fields (case-insensitive, substring either way). */
function looselyMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

/**
 * Deterministic 0-100 fit/intent score from signals already on hand at
 * discovery time -- no external calls, no configurable weights (that's
 * explicitly out of scope for now; ship one sensible formula):
 *
 *  - confidence score from the discovery/enrichment provider (0-40)
 *  - a found email address, the single strongest "we can actually reach
 *    this lead" signal (+25)
 *  - a found contact name, meaning outreach can be personalized (+10)
 *  - industry matches the saved auto-discovery criteria (+15)
 *  - country matches the saved auto-discovery criteria (+10)
 *
 * Recomputed whenever a prospect is created or one of these fields changes
 * on edit, so the score never goes stale.
 */
export function computeLeadScore(
  prospect: ScorableProspect,
  discoveryCriteria?: Pick<Settings, "autoDiscoveryIndustry" | "autoDiscoveryCountry"> | null,
): number {
  let score = 0;

  score += Math.max(0, Math.min(1, prospect.confidenceScore ?? 0)) * 40;
  if (prospect.email) score += 25;
  if (prospect.contactName) score += 10;
  if (looselyMatches(prospect.industry, discoveryCriteria?.autoDiscoveryIndustry)) score += 15;
  if (looselyMatches(prospect.country, discoveryCriteria?.autoDiscoveryCountry)) score += 10;

  return Math.round(Math.max(0, Math.min(100, score)));
}

export function leadScoreTier(score: number): LeadScoreTier {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}
