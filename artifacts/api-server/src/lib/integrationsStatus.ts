import { isGmailConfigured } from "./gmail";
import { isApolloConfigured } from "./providers/apollo";
import { isHunterConfigured } from "./providers/hunter";
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
  configuredVia: "ui" | "environment" | "trial" | "none";
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
  configuredVia?: IntegrationStatusEntry["configuredVia"];
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
    configuredVia:
      params.configuredVia ?? (!params.configured ? "none" : hasOverride ? "ui" : "environment"),
    fields: fields.map((f) => ({ name: f.name, label: f.label, secret: f.secret ?? true })),
    disabled: params.disabled ?? false,
  };
}

export async function getIntegrationStatuses(): Promise<IntegrationStatusEntry[]> {
  const [geminiKey, gmailDisabledValues, apolloConfigured, hunterConfigured, gmailConfigured] =
    await Promise.all([
      Promise.all([
        hasStoredOverride("gemini"),
        getCredentialValue("gemini", "apiKey", "GEMINI_API_KEY"),
      ]).then(([hasOverride, key]) => ({ hasOverride, configured: Boolean(key) })),
      getStoredValues("gmail"),
      isApolloConfigured(),
      isHunterConfigured(),
      isGmailConfigured(),
    ]);

  return Promise.all([
    buildEntry({
      key: "gemini",
      displayName: "Gemini",
      category: "ai",
      configured: true,
      editable: true,
      configuredVia: geminiKey.configured ? undefined : "trial",
      description: geminiKey.configured
        ? "Powers email generation, language detection, and reply classification."
        : "Powers email generation, language detection, and reply classification. Currently running on Replit's free AI trial (billed to your Replit credits) — add your own Gemini key above to use your own quota.",
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
      key: "hunter",
      displayName: "Hunter.io",
      category: "prospect_discovery",
      configured: hunterConfigured,
      editable: true,
      description: "Finds verified contact emails for a company's domain.",
    }),
  ]);
}
