import { GoogleGenAI } from "@google/genai";
import { db, aiActivityTable, replyCategoryValues, type ReplyCategory } from "@workspace/db";
import { logger } from "./logger";
import { getCredentialValue } from "./credentials";

type LlmProvider = "gemini";
type AiActivityKind =
  | "language_detection"
  | "email_generation"
  | "reply_classification"
  | "reply_draft"
  | "followup_generation";

async function resolveProvider(): Promise<{ provider: LlmProvider; apiKey: string } | null> {
  const gemini = await getCredentialValue("gemini", "apiKey", "GEMINI_API_KEY");
  if (gemini) return { provider: "gemini", apiKey: gemini };
  return null;
}

export async function isLlmConfigured(): Promise<boolean> {
  return (await resolveProvider()) !== null;
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
      errorMessage: "No LLM provider configured. Add GEMINI_API_KEY.",
      relatedProspectId: opts.relatedProspectId ?? null,
      relatedCampaignId: opts.relatedCampaignId ?? null,
    });
    throw new Error(
      "No LLM provider configured. Add GEMINI_API_KEY in Settings > Integrations.",
    );
  }

  try {
    const ai = getGeminiClient(resolved.apiKey);
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: opts.userPrompt }] }],
      config: {
        systemInstruction: opts.systemPrompt,
        maxOutputTokens: 8192,
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
      },
    });
    const text = response.text ?? "";
    await db.insert(aiActivityTable).values({
      kind: opts.kind,
      prompt: fullPrompt,
      response: text,
      promptTokens: response.usageMetadata?.promptTokenCount ?? null,
      completionTokens: response.usageMetadata?.candidatesTokenCount ?? null,
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
  const parsed = JSON.parse(stripFences(text));
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
  });
  const parsed = JSON.parse(stripFences(text));
  const category = (replyCategoryValues as readonly string[]).includes(
    parsed.category,
  )
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
