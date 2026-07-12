import { getCredentialValue } from "../credentials";

const APOLLO_BASE = "https://api.apollo.io/v1";

export async function isApolloConfigured(): Promise<boolean> {
  return Boolean(await getCredentialValue("apollo", "apiKey", "APOLLO_API_KEY"));
}

export interface DiscoveredCompany {
  companyName: string;
  website: string | null;
  industry: string | null;
  country: string | null;
  city: string | null;
  linkedinUrl: string | null;
}

export async function apolloDiscoverCompanies(params: {
  industry: string;
  country: string;
  city?: string;
  keywords?: string;
  count: number;
}): Promise<DiscoveredCompany[]> {
  const key = await getCredentialValue("apollo", "apiKey", "APOLLO_API_KEY");
  if (!key) return [];

  const res = await fetch(`${APOLLO_BASE}/mixed_companies/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": key },
    body: JSON.stringify({
      q_organization_keyword_tags: [params.keywords ?? params.industry],
      organization_locations: [
        params.city ? `${params.city}, ${params.country}` : params.country,
      ],
      per_page: Math.min(params.count, 25),
    }),
  });
  if (!res.ok) {
    throw new Error(`Apollo API error: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    organizations?: Array<{
      name: string;
      website_url?: string;
      industry?: string;
      country?: string;
      city?: string;
      linkedin_url?: string;
    }>;
  };

  return (data.organizations ?? []).map((o) => ({
    companyName: o.name,
    website: o.website_url ?? null,
    industry: o.industry ?? params.industry,
    country: o.country ?? params.country,
    city: o.city ?? params.city ?? null,
    linkedinUrl: o.linkedin_url ?? null,
  }));
}
