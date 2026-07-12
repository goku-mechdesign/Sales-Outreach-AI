import type { DiscoveredCompany } from "./apollo";
import { getCredentialValue } from "../credentials";

export async function isCrunchbaseConfigured(): Promise<boolean> {
  return Boolean(
    await getCredentialValue("crunchbase", "apiKey", "CRUNCHBASE_API_KEY"),
  );
}

export async function crunchbaseDiscoverCompanies(params: {
  industry: string;
  country: string;
  keywords?: string;
  count: number;
}): Promise<DiscoveredCompany[]> {
  const key = await getCredentialValue("crunchbase", "apiKey", "CRUNCHBASE_API_KEY");
  if (!key) return [];

  const res = await fetch(
    "https://api.crunchbase.com/api/v4/searches/organizations",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-cb-user-key": key },
      body: JSON.stringify({
        field_ids: [
          "identifier",
          "website",
          "location_identifiers",
          "categories",
          "linkedin",
        ],
        query: [
          {
            type: "predicate",
            field_id: "categories",
            operator_id: "contains",
            values: [params.keywords ?? params.industry],
          },
        ],
        limit: Math.min(params.count, 25),
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Crunchbase API error: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    entities?: Array<{
      properties?: {
        identifier?: { value?: string };
        website?: { value?: string };
        linkedin?: { value?: string };
      };
    }>;
  };

  return (data.entities ?? [])
    .map((e) => e.properties)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.identifier?.value))
    .map((p) => ({
      companyName: p.identifier!.value as string,
      website: p.website?.value ?? null,
      industry: params.industry,
      country: params.country,
      city: null,
      linkedinUrl: p.linkedin?.value ?? null,
    }));
}
