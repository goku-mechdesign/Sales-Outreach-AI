import { isGmailConfigured } from "./gmail";
import { isApolloConfigured } from "./providers/apollo";
import { isCrunchbaseConfigured } from "./providers/crunchbase";
import { isOpenCorporatesConfigured } from "./providers/opencorporates";
import { isHunterConfigured } from "./providers/hunter";
import { isSnovConfigured } from "./providers/snov";
import { isClearbitConfigured } from "./providers/clearbit";

export interface IntegrationStatusEntry {
  key: string;
  displayName: string;
  category: "prospect_discovery" | "ai" | "email";
  configured: boolean;
  description: string;
}

export function getIntegrationStatuses(): IntegrationStatusEntry[] {
  return [
    {
      key: "gemini",
      displayName: "Gemini",
      category: "ai",
      configured: Boolean(process.env.GEMINI_API_KEY),
      description:
        "Powers email generation, language detection, and reply classification.",
    },
    {
      key: "openai",
      displayName: "OpenAI",
      category: "ai",
      configured: Boolean(process.env.OPENAI_API_KEY),
      description: "Fallback LLM used automatically if Gemini is not configured.",
    },
    {
      key: "gmail",
      displayName: "Gmail",
      category: "email",
      configured: isGmailConfigured(),
      description: "Sends outreach emails and reads replies from your inbox.",
    },
    {
      key: "apollo",
      displayName: "Apollo.io",
      category: "prospect_discovery",
      configured: isApolloConfigured(),
      description: "Finds prospect companies by industry, location, and keywords.",
    },
    {
      key: "crunchbase",
      displayName: "Crunchbase",
      category: "prospect_discovery",
      configured: isCrunchbaseConfigured(),
      description: "Finds prospect companies from Crunchbase's organization data.",
    },
    {
      key: "opencorporates",
      displayName: "OpenCorporates",
      category: "prospect_discovery",
      configured: isOpenCorporatesConfigured(),
      description: "Finds registered companies from official business registries.",
    },
    {
      key: "hunter",
      displayName: "Hunter.io",
      category: "prospect_discovery",
      configured: isHunterConfigured(),
      description: "Finds verified contact emails for a company's domain.",
    },
    {
      key: "snov",
      displayName: "Snov.io",
      category: "prospect_discovery",
      configured: isSnovConfigured(),
      description: "Finds verified contact emails for a company's domain.",
    },
    {
      key: "clearbit",
      displayName: "Clearbit",
      category: "prospect_discovery",
      configured: isClearbitConfigured(),
      description: "Enriches company records with industry and firmographic data.",
    },
  ];
}
