import { isGmailConfigured } from "./gmail";
import { isApolloConfigured } from "./providers/apollo";
import { isCrunchbaseConfigured } from "./providers/crunchbase";
import { isOpenCorporatesConfigured } from "./providers/opencorporates";
import { isHunterConfigured } from "./providers/hunter";
import { isSnovConfigured } from "./providers/snov";
import { isClearbitConfigured } from "./providers/clearbit";
import {
  getCredentialValue,
  getStoredValues,
  hasStoredOverride,
  PROVIDER_CREDENTIAL_FIELDS,
} from "./credentials";

export interface IntegrationFieldEntry {
  name: string;
  label: string;
  secret: boolean;
}

export interface IntegrationStatusEntry {
  key: string;
  displayName: string;
  category: "prospect_discovery" | "ai" | "email";
  configured: boolean;
  description: string;
  editable: boolean;
  configuredVia: "ui" | "environment" | "none";
  fields: IntegrationFieldEntry[];
  disabled: boolean;
}

async function buildEntry(params: {
  key: string;
  displayName: string;
  category: IntegrationStatusEntry["category"];
  description: string;
  configured: boolean;
  editable: boolean;
  disabled?: boolean;
}): Promise<IntegrationStatusEntry> {
  const fields = PROVIDER_CREDENTIAL_FIELDS[params.key] ?? [];
  const hasOverride = params.editable ? await hasStoredOverride(params.key) : false;
  return {
    key: params.key,
    displayName: params.displayName,
    category: params.category,
    configured: params.configured,
    description: params.description,
    editable: params.editable,
    configuredVia: !params.configured ? "none" : hasOverride ? "ui" : "environment",
    fields: fields.map((f) => ({ name: f.name, label: f.label, secret: f.secret ?? true })),
    disabled: params.disabled ?? false,
  };
}

export async function getIntegrationStatuses(): Promise<IntegrationStatusEntry[]> {
  const [
    geminiKey,
    openaiKey,
    gmailDisabledValues,
    apolloConfigured,
    crunchbaseConfigured,
    opencorporatesConfigured,
    hunterConfigured,
    snovConfigured,
    clearbitConfigured,
    gmailConfigured,
  ] = await Promise.all([
    Promise.all([
      hasStoredOverride("gemini"),
      getCredentialValue("gemini", "apiKey", "GEMINI_API_KEY"),
    ]).then(([hasOverride, key]) => ({ hasOverride, configured: Boolean(key) })),
    Promise.all([
      hasStoredOverride("openai"),
      getCredentialValue("openai", "apiKey", "OPENAI_API_KEY"),
    ]).then(([hasOverride, key]) => ({ hasOverride, configured: Boolean(key) })),
    getStoredValues("gmail"),
    isApolloConfigured(),
    isCrunchbaseConfigured(),
    isOpenCorporatesConfigured(),
    isHunterConfigured(),
    isSnovConfigured(),
    isClearbitConfigured(),
    isGmailConfigured(),
  ]);

  return Promise.all([
    buildEntry({
      key: "gemini",
      displayName: "Gemini",
      category: "ai",
      configured: geminiKey.configured,
      editable: true,
      description: "Powers email generation, language detection, and reply classification.",
    }),
    buildEntry({
      key: "openai",
      displayName: "OpenAI",
      category: "ai",
      configured: openaiKey.configured,
      editable: true,
      description: "Fallback LLM used automatically if Gemini is not configured.",
    }),
    buildEntry({
      key: "gmail",
      displayName: "Gmail",
      category: "email",
      configured: gmailConfigured,
      editable: false,
      disabled: gmailDisabledValues?.disabled === "true",
      description: "Sends outreach emails and reads replies from your inbox.",
    }),
    buildEntry({
      key: "apollo",
      displayName: "Apollo.io",
      category: "prospect_discovery",
      configured: apolloConfigured,
      editable: true,
      description: "Finds prospect companies by industry, location, and keywords.",
    }),
    buildEntry({
      key: "crunchbase",
      displayName: "Crunchbase",
      category: "prospect_discovery",
      configured: crunchbaseConfigured,
      editable: true,
      description: "Finds prospect companies from Crunchbase's organization data.",
    }),
    buildEntry({
      key: "opencorporates",
      displayName: "OpenCorporates",
      category: "prospect_discovery",
      configured: opencorporatesConfigured,
      editable: true,
      description: "Finds registered companies from official business registries.",
    }),
    buildEntry({
      key: "hunter",
      displayName: "Hunter.io",
      category: "prospect_discovery",
      configured: hunterConfigured,
      editable: true,
      description: "Finds verified contact emails for a company's domain.",
    }),
    buildEntry({
      key: "snov",
      displayName: "Snov.io",
      category: "prospect_discovery",
      configured: snovConfigured,
      editable: true,
      description: "Finds verified contact emails for a company's domain.",
    }),
    buildEntry({
      key: "clearbit",
      displayName: "Clearbit",
      category: "prospect_discovery",
      configured: clearbitConfigured,
      editable: true,
      description: "Enriches company records with industry and firmographic data.",
    }),
  ]);
}
