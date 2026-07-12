export function isClearbitConfigured(): boolean {
  return Boolean(process.env.CLEARBIT_API_KEY);
}

export interface ClearbitEnrichment {
  industry: string | null;
  description: string | null;
  linkedinUrl: string | null;
}

export async function clearbitEnrichCompany(
  domain: string,
): Promise<ClearbitEnrichment | null> {
  const key = process.env.CLEARBIT_API_KEY;
  if (!key) return null;

  const res = await fetch(
    `https://company.clearbit.com/v2/companies/find?domain=${encodeURIComponent(domain)}`,
    { headers: { Authorization: `Bearer ${key}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Clearbit API error: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    category?: { industry?: string };
    description?: string;
    linkedin?: { handle?: string };
  };

  return {
    industry: data.category?.industry ?? null,
    description: data.description ?? null,
    linkedinUrl: data.linkedin?.handle
      ? `https://linkedin.com/company/${data.linkedin.handle}`
      : null,
  };
}
