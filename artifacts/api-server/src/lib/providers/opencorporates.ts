import type { DiscoveredCompany } from "./apollo";
import { getCredentialValue } from "../credentials";

export async function isOpenCorporatesConfigured(): Promise<boolean> {
  return Boolean(
    await getCredentialValue("opencorporates", "apiKey", "OPENCORPORATES_API_KEY"),
  );
}

const COUNTRY_CODES: Record<string, string> = {
  "united states": "us",
  usa: "us",
  "united kingdom": "gb",
  uk: "gb",
  canada: "ca",
  australia: "au",
  germany: "de",
  france: "fr",
  india: "in",
  spain: "es",
  italy: "it",
  netherlands: "nl",
  ireland: "ie",
  singapore: "sg",
};

function toCountryCode(country: string): string {
  const normalized = country.trim().toLowerCase();
  return COUNTRY_CODES[normalized] ?? normalized.slice(0, 2);
}

export async function opencorporatesDiscoverCompanies(params: {
  industry: string;
  country: string;
  city?: string;
  keywords?: string;
  count: number;
}): Promise<DiscoveredCompany[]> {
  const key = await getCredentialValue(
    "opencorporates",
    "apiKey",
    "OPENCORPORATES_API_KEY",
  );
  if (!key) return [];

  const url = new URL("https://api.opencorporates.com/v0.4/companies/search");
  url.searchParams.set("q", params.keywords ?? params.industry);
  url.searchParams.set("country_code", toCountryCode(params.country));
  url.searchParams.set("per_page", String(Math.min(params.count, 30)));
  url.searchParams.set("api_token", key);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `OpenCorporates API error: ${res.status} ${await res.text()}`,
    );
  }
  const data = (await res.json()) as {
    results?: {
      companies?: Array<{
        company: {
          name: string;
          registered_address?: { locality?: string };
        };
      }>;
    };
  };

  return (data.results?.companies ?? []).map((c) => ({
    companyName: c.company.name,
    website: null,
    industry: params.industry,
    country: params.country,
    city: c.company.registered_address?.locality ?? params.city ?? null,
    linkedinUrl: null,
  }));
}
