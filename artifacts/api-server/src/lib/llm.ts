import { GoogleGenAI } from "@google/genai";
import { ai as replitTrialGemini } from "@workspace/integrations-gemini-ai";
import { db, aiActivityTable, replyCategoryValues, type ReplyCategory } from "@workspace/db";
import { logger } from "./logger";
import { getCredentialValue } from "./credentials";

// "gemini" = the user's own Gemini API key (from Integrations or GEMINI_API_KEY
// env secret). "nvidia" / "openrouter" = the user's own API key for those
// OpenAI-compatible chat-completions APIs, alternative BYO providers.
// "gemini_trial" = Replit's managed AI integration -- no key required,
// billed to Replit credits. Precedence: an explicitly configured NVIDIA key
// wins first, then OpenRouter, then a configured Gemini key, then the
// zero-config trial fallback -- explicitly added keys were added on purpose
// and should take priority over the automatic fallback.
type LlmProvider = "gemini" | "nvidia" | "openrouter" | "gemini_trial";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const NVIDIA_DEFAULT_MODEL = "meta/llama-3.3-70b-instruct";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct";

type AiActivityKind =
  | "language_detection"
  | "email_generation"
  | "reply_classification"
  | "reply_draft"
  | "followup_generation";

async function resolveProvider(): Promise<
  { provider: LlmProvider; apiKey?: string; model?: string } | null
> {
  const nvidia = await getCredentialValue("nvidia", "apiKey", "NVIDIA_API_KEY");
  if (nvidia) {
    const model = await getCredentialValue("nvidia", "model");
    return { provider: "nvidia", apiKey: nvidia, model: model || undefined };
  }
  const openrouter = await getCredentialValue("openrouter", "apiKey", "OPENROUTER_API_KEY");
  if (openrouter) {
    const model = await getCredentialValue("openrouter", "model");
    return { provider: "openrouter", apiKey: openrouter, model: model || undefined };
  }
  const gemini = await getCredentialValue("gemini", "apiKey", "GEMINI_API_KEY");
  if (gemini) return { provider: "gemini", apiKey: gemini };
  return { provider: "gemini_trial" };
}

interface OpenAiCompatibleChatCompletion {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Shared caller for OpenAI-compatible chat-completions APIs (NVIDIA NIM, OpenRouter). */
async function callOpenAiCompatible(params: {
  providerLabel: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  json?: boolean;
}): Promise<{ text: string; promptTokens: number | null; completionTokens: number | null }> {
  const response = await fetch(`${params.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
      max_tokens: 8192,
      ...(params.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `${params.providerLabel} API error (${response.status}): ${body || response.statusText}`,
    );
  }

  const data = (await response.json()) as OpenAiCompatibleChatCompletion;
  const text = data.choices?.[0]?.message?.content ?? "";
  return {
    text,
    promptTokens: data.usage?.prompt_tokens ?? null,
    completionTokens: data.usage?.completion_tokens ?? null,
  };
}

function callNvidia(params: {
  apiKey: string;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  json?: boolean;
}) {
  return callOpenAiCompatible({
    providerLabel: "NVIDIA",
    baseUrl: NVIDIA_BASE_URL,
    apiKey: params.apiKey,
    model: params.model || NVIDIA_DEFAULT_MODEL,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    json: params.json,
  });
}

function callOpenRouter(params: {
  apiKey: string;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  json?: boolean;
}) {
  return callOpenAiCompatible({
    providerLabel: "OpenRouter",
    baseUrl: OPENROUTER_BASE_URL,
    apiKey: params.apiKey,
    model: params.model || OPENROUTER_DEFAULT_MODEL,
    systemPrompt: params.systemPrompt,
    userPrompt: params.userPrompt,
    json: params.json,
  });
}

export async function isLlmConfigured(): Promise<boolean> {
  return (await resolveProvider()) !== null;
}

/** Whether the current LLM provider is the user's own key vs. the Replit trial. */
export async function getLlmProviderKind(): Promise<LlmProvider> {
  const resolved = await resolveProvider();
  return resolved?.provider ?? "gemini_trial";
}

function getGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

interface CallLlmOptions {
  kind: AiActivityKind;
  systemPrompt: string;
  userPrompt: string;
  json?: boolean;
  relatedProspectId?: number;
  relatedCampaignId?: number;
}

export async function callLlm(opts: CallLlmOptions): Promise<string> {
  const resolved = await resolveProvider();
  const provider = resolved?.provider ?? null;
  const fullPrompt = `[SYSTEM]\n${opts.systemPrompt}\n\n[USER]\n${opts.userPrompt}`;

  if (!provider || !resolved) {
    await db.insert(aiActivityTable).values({
      kind: opts.kind,
      prompt: fullPrompt,
      status: "error",
      errorMessage: "No LLM provider configured. Add a Gemini, NVIDIA, or OpenRouter API key.",
      relatedProspectId: opts.relatedProspectId ?? null,
      relatedCampaignId: opts.relatedCampaignId ?? null,
    });
    throw new Error(
      "No LLM provider configured. Add a Gemini, NVIDIA, or OpenRouter API key in Settings > Integrations.",
    );
  }

  try {
    let text: string;
    let promptTokens: number | null;
    let completionTokens: number | null;

    if (provider === "nvidia" || provider === "openrouter") {
      const caller = provider === "nvidia" ? callNvidia : callOpenRouter;
      const result = await caller({
        apiKey: resolved.apiKey!,
        model: resolved.model,
        systemPrompt: opts.systemPrompt,
        userPrompt: opts.userPrompt,
        json: opts.json,
      });
      text = result.text;
      promptTokens = result.promptTokens;
      completionTokens = result.completionTokens;
    } else {
      const ai = provider === "gemini" ? getGeminiClient(resolved.apiKey!) : replitTrialGemini;
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: opts.userPrompt }] }],
        config: {
          systemInstruction: opts.systemPrompt,
          maxOutputTokens: 8192,
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
        },
      });
      text = response.text ?? "";
      promptTokens = response.usageMetadata?.promptTokenCount ?? null;
      completionTokens = response.usageMetadata?.candidatesTokenCount ?? null;
    }

    await db.insert(aiActivityTable).values({
      kind: opts.kind,
      prompt: fullPrompt,
      response: text,
      promptTokens,
      completionTokens,
      status: "success",
      relatedProspectId: opts.relatedProspectId ?? null,
      relatedCampaignId: opts.relatedCampaignId ?? null,
    });
    return text;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, kind: opts.kind }, "LLM call failed");
    await db.insert(aiActivityTable).values({
      kind: opts.kind,
      prompt: fullPrompt,
      status: "error",
      errorMessage: message,
      relatedProspectId: opts.relatedProspectId ?? null,
      relatedCampaignId: opts.relatedCampaignId ?? null,
    });
    throw err;
  }
}

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .trim();
}

/**
 * Some providers/models don't respect `response_format: json_object` and
 * either wrap the JSON in prose or emit raw, unescaped control characters
 * (literal newlines/tabs) inside string values -- both of which make
 * `JSON.parse` throw even though the payload is "obviously" valid JSON to a
 * human. This walks the string tracking whether we're inside a JSON string
 * literal and escapes/drops control characters only there, leaving
 * structural whitespace untouched.
 */
function sanitizeJsonControlChars(text: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (!inString) {
      if (ch === '"') inString = true;
      result += ch;
      continue;
    }
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      result += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = false;
      result += ch;
      continue;
    }
    if (ch === "\n") {
      result += "\\n";
      continue;
    }
    if (ch === "\r") {
      result += "\\r";
      continue;
    }
    if (ch === "\t") {
      result += "\\t";
      continue;
    }
    if (ch.charCodeAt(0) < 0x20) continue; // drop other stray control chars
    result += ch;
  }
  return result;
}

/** If the model wrapped the JSON in explanatory prose, pull out the {...} block. */
function extractJsonBlock(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(start, end + 1);
}

/**
 * Best-effort JSON parsing for LLM output: tries the raw text, then a
 * version with stray control characters sanitized, then narrows to the
 * first {...} block and retries both, before giving up with the original
 * error.
 */
function parseJsonLenient(rawText: string): unknown {
  const candidates = [stripFences(rawText)];
  const block = extractJsonBlock(candidates[0]);
  if (block !== candidates[0]) candidates.push(block);

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      lastError = err;
    }
    try {
      return JSON.parse(sanitizeJsonControlChars(candidate));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export async function detectLanguage(
  text: string,
  prospectId?: number,
): Promise<string | null> {
  try {
    const result = await callLlm({
      kind: "language_detection",
      systemPrompt:
        "You detect the primary language of business text. Reply with ONLY the ISO 639-1 two-letter language code, nothing else.",
      userPrompt: text.slice(0, 2000),
      relatedProspectId: prospectId,
    });
    const code = result.trim().toLowerCase().slice(0, 2);
    return /^[a-z]{2}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

export interface GeneratedEmail {
  subject: string;
  body: string;
}

function parseEmailJson(text: string): GeneratedEmail {
  const parsed = parseJsonLenient(text) as { subject?: unknown; body?: unknown };
  if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
    throw new Error("LLM returned malformed email JSON");
  }
  return { subject: parsed.subject, body: parsed.body };
}

interface CompanyContext {
  companyName: string;
  companyDescription?: string | null;
  products?: string | null;
  services?: string | null;
  emailSignature?: string | null;
}

export async function generateCampaignEmail(params: {
  campaign: {
    goal: string;
    tone: string;
    productDescription: string;
    targetAudience: string;
    cta: string;
  };
  companyName: string;
  contactName?: string | null;
  industry?: string | null;
  language?: string | null;
  companyContext: CompanyContext;
  campaignId?: number;
  prospectId?: number;
}): Promise<GeneratedEmail> {
  const systemPrompt =
    'You are an expert B2B sales copywriter. Write concise, personalized cold outreach emails that feel human, respectful, and specific -- never generic or spammy. Return ONLY valid JSON of the shape {"subject": string, "body": string}. The body must be plain text with real line breaks, no markdown, and no unresolved placeholders like [Name].';

  const userPrompt = `
Sender company: ${params.companyContext.companyName}
Sender description: ${params.companyContext.companyDescription ?? "N/A"}
Sender products: ${params.companyContext.products ?? "N/A"}
Sender services: ${params.companyContext.services ?? "N/A"}
Email signature to append at the end: ${params.companyContext.emailSignature ?? params.companyContext.companyName}

Recipient company: ${params.companyName}
Recipient contact name: ${params.contactName ?? "Unknown -- use a generic greeting such as 'Hi there'"}
Recipient industry: ${params.industry ?? "Unknown"}
${params.language && params.language !== "en" ? `Write the email in language code "${params.language}".` : "Write the email in English."}

Campaign goal: ${params.campaign.goal}
Tone: ${params.campaign.tone}
Target audience: ${params.campaign.targetAudience}
Call to action: ${params.campaign.cta}
`.trim();

  const text = await callLlm({
    kind: "email_generation",
    systemPrompt,
    userPrompt,
    json: true,
    relatedCampaignId: params.campaignId,
    relatedProspectId: params.prospectId,
  });
  return parseEmailJson(text);
}

/**
 * Generates a reusable outreach template for a campaign. Unlike
 * `generateCampaignEmail` (which writes one specific email for one
 * specific prospect), this writes a template containing the literal
 * merge tokens `{{contactName}}` and `{{companyName}}` so the same
 * copy can be personalized per-recipient at send time via simple
 * string substitution.
 */
export async function generateCampaignTemplate(params: {
  campaign: {
    goal: string;
    tone: string;
    productDescription: string;
    targetAudience: string;
    cta: string;
  };
  companyContext: CompanyContext;
  campaignId?: number;
}): Promise<GeneratedEmail> {
  const systemPrompt =
    'You are an expert B2B sales copywriter. Write a concise, reusable cold outreach email template that feels human and specific, not generic or spammy. Use the literal merge tokens {{contactName}} and {{companyName}} exactly where a greeting or the recipient\'s company name would go -- these will be substituted per-recipient later, so you MUST include them verbatim. Return ONLY valid JSON of the shape {"subject": string, "body": string}. The body must be plain text with real line breaks, no markdown.';

  const userPrompt = `
Sender company: ${params.companyContext.companyName}
Sender description: ${params.companyContext.companyDescription ?? "N/A"}
Sender products: ${params.companyContext.products ?? "N/A"}
Sender services: ${params.companyContext.services ?? "N/A"}
Email signature to append at the end: ${params.companyContext.emailSignature ?? params.companyContext.companyName}

Campaign goal: ${params.campaign.goal}
Tone: ${params.campaign.tone}
Target audience: ${params.campaign.targetAudience}
Call to action: ${params.campaign.cta}

Use {{contactName}} in the greeting (e.g. "Hi {{contactName}},") and mention {{companyName}} naturally in the body.
`.trim();

  const text = await callLlm({
    kind: "email_generation",
    systemPrompt,
    userPrompt,
    json: true,
    relatedCampaignId: params.campaignId,
  });
  return parseEmailJson(text);
}

export async function generateFollowupEmail(params: {
  campaign: {
    goal: string;
    tone: string;
    productDescription: string;
    targetAudience: string;
    cta: string;
  };
  companyName: string;
  contactName?: string | null;
  previousSubject: string;
  previousBody: string;
  followupStage: number;
  companyContext: CompanyContext;
  campaignId?: number;
  prospectId?: number;
}): Promise<GeneratedEmail> {
  const systemPrompt =
    'You write brief, polite follow-up emails to a cold outreach email that received no reply. Keep it short (3-5 sentences), add a small new angle of value, and restate the call to action. Return ONLY valid JSON of the shape {"subject": string, "body": string}.';

  const userPrompt = `
Sender company: ${params.companyContext.companyName}
Signature: ${params.companyContext.emailSignature ?? params.companyContext.companyName}

Recipient company: ${params.companyName}
Recipient contact name: ${params.contactName ?? "Unknown"}

This is follow-up #${params.followupStage} to this original email (no reply received yet):
Subject: ${params.previousSubject}
Body: ${params.previousBody}

Campaign goal: ${params.campaign.goal}
Tone: ${params.campaign.tone}
Call to action: ${params.campaign.cta}
`.trim();

  const text = await callLlm({
    kind: "followup_generation",
    systemPrompt,
    userPrompt,
    json: true,
    relatedCampaignId: params.campaignId,
    relatedProspectId: params.prospectId,
  });
  return parseEmailJson(text);
}

export interface ClassifiedReply {
  category: ReplyCategory;
  confidence: number;
  isHot: boolean;
  summary: string;
}

export async function classifyReply(params: {
  emailBody: string;
  threadId?: number;
}): Promise<ClassifiedReply> {
  const systemPrompt = `You classify inbound replies to B2B cold outreach emails into exactly one category: ${replyCategoryValues.join(", ")}. A reply is "hot" if the sender expresses genuine interest, asks about pricing, or wants to schedule a meeting/call. Return ONLY valid JSON of the shape {"category": string, "confidence": number between 0 and 1, "isHot": boolean, "summary": string (one short sentence)}.`;

  const text = await callLlm({
    kind: "reply_classification",
    systemPrompt,
    userPrompt: params.emailBody.slice(0, 4000),
    json: true,
  });
  const parsed = parseJsonLenient(text) as {
    category?: unknown;
    confidence?: unknown;
    isHot?: unknown;
    summary?: unknown;
  };
  const category =
    typeof parsed.category === "string" &&
    (replyCategoryValues as readonly string[]).includes(parsed.category)
      ? (parsed.category as ReplyCategory)
      : "other";
  return {
    category,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    isHot: Boolean(parsed.isHot),
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
  };
}

export async function generateReplyDraft(params: {
  threadSubject: string;
  messages: { direction: string; body: string }[];
  companyContext: CompanyContext;
  threadId?: number;
}): Promise<string> {
  const systemPrompt =
    "You draft warm, concise, professional replies to inbound leads who replied to a cold outreach email. Match the prospect's tone, answer their question directly, and move the conversation toward the sender's call to action. Return ONLY the plain-text email body, no subject line, no markdown.";

  const conversation = params.messages
    .map((m) => `${m.direction === "incoming" ? "Prospect" : "Us"}: ${m.body}`)
    .join("\n\n");

  const userPrompt = `
Thread subject: ${params.threadSubject}

Conversation so far:
${conversation}

Draft the next reply from us.
Sender company: ${params.companyContext.companyName}
Signature: ${params.companyContext.emailSignature ?? params.companyContext.companyName}
`.trim();

  const text = await callLlm({
    kind: "reply_draft",
    systemPrompt,
    userPrompt,
  });
  return text.trim();
}
