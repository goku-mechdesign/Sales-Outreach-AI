/**
 * Live, low-cost connectivity checks for each integration, triggered by the
 * "Test" button on the Integrations page. Each check makes one real call to
 * the provider using whatever credentials are currently active (UI override
 * -> env secret -> trial, per the same precedence used elsewhere) and
 * reports back a short human-readable result. These are read-only /
 * near-zero-cost calls -- never anything that spends discovery/enrichment
 * credits or sends real email.
 */
import { GoogleGenAI } from "@google/genai";
import { ai as replitTrialGemini } from "@workspace/integrations-gemini-ai";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { getCredentialValue, getStoredValues } from "./credentials";
import { logger } from "./logger";

export interface IntegrationTestResult {
  success: boolean;
  message: string;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function testGemini(): Promise<IntegrationTestResult> {
  const apiKey = await getCredentialValue("gemini", "apiKey", "GEMINI_API_KEY");
  try {
    const client = apiKey ? new GoogleGenAI({ apiKey }) : replitTrialGemini;
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: "Reply with only the word OK." }] }],
      config: { maxOutputTokens: 16 },
    });
    if (!response.text?.trim()) throw new Error("Gemini returned an empty response.");
    return {
      success: true,
      message: apiKey
        ? "Your Gemini API key is working."
        : "Replit's AI trial is working (no Gemini key configured).",
    };
  } catch (err) {
    return { success: false, message: describeError(err) };
  }
}

async function testNvidia(): Promise<IntegrationTestResult> {
  const apiKey = await getCredentialValue("nvidia", "apiKey", "NVIDIA_API_KEY");
  if (!apiKey) return { success: false, message: "No NVIDIA API key configured." };
  const model = await getCredentialValue("nvidia", "model");
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || "meta/llama-3.3-70b-instruct",
        messages: [{ role: "user", content: "Reply with only the word OK." }],
        max_tokens: 16,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`NVIDIA API error (${res.status}): ${text || res.statusText}`);
    }
    return { success: true, message: "Your NVIDIA API key is working." };
  } catch (err) {
    return { success: false, message: describeError(err) };
  }
}

async function testOpenRouter(): Promise<IntegrationTestResult> {
  const apiKey = await getCredentialValue("openrouter", "apiKey", "OPENROUTER_API_KEY");
  if (!apiKey) return { success: false, message: "No OpenRouter API key configured." };
  const model = await getCredentialValue("openrouter", "model");
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || "meta-llama/llama-3.3-70b-instruct",
        messages: [{ role: "user", content: "Reply with only the word OK." }],
        max_tokens: 16,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenRouter API error (${res.status}): ${text || res.statusText}`);
    }
    return { success: true, message: "Your OpenRouter API key is working." };
  } catch (err) {
    return { success: false, message: describeError(err) };
  }
}

async function testApollo(): Promise<IntegrationTestResult> {
  const apiKey = await getCredentialValue("apollo", "apiKey", "APOLLO_API_KEY");
  if (!apiKey) return { success: false, message: "No Apollo.io API key configured." };
  try {
    const res = await fetch("https://api.apollo.io/v1/auth/health", {
      headers: { "X-Api-Key": apiKey },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Apollo API error (${res.status}): ${text || res.statusText}`);
    }
    return { success: true, message: "Your Apollo.io API key is working." };
  } catch (err) {
    return { success: false, message: describeError(err) };
  }
}

async function testHunter(): Promise<IntegrationTestResult> {
  const apiKey = await getCredentialValue("hunter", "apiKey", "HUNTER_API_KEY");
  if (!apiKey) return { success: false, message: "No Hunter.io API key configured." };
  try {
    const url = new URL("https://api.hunter.io/v2/account");
    url.searchParams.set("api_key", apiKey);
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Hunter API error (${res.status}): ${text || res.statusText}`);
    }
    const data = (await res.json()) as { data?: { email?: string } };
    return {
      success: true,
      message: data.data?.email
        ? `Your Hunter.io API key is working (account: ${data.data.email}).`
        : "Your Hunter.io API key is working.",
    };
  } catch (err) {
    return { success: false, message: describeError(err) };
  }
}

async function testGmail(): Promise<IntegrationTestResult> {
  const stored = await getStoredValues("gmail");
  if (stored?.disabled === "true") {
    return {
      success: false,
      message: "Gmail sending/reading is currently paused. Re-enable it above to test.",
    };
  }
  try {
    const connectors = new ReplitConnectors();
    const res = await connectors.proxy("google-mail", "/gmail/v1/users/me/profile");
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gmail check failed (${res.status}): ${text}`);
    }
    const data = (await res.json()) as { emailAddress?: string };
    return {
      success: true,
      message: data.emailAddress
        ? `Gmail is connected as ${data.emailAddress}.`
        : "Gmail is connected.",
    };
  } catch (err) {
    return { success: false, message: describeError(err) };
  }
}

export async function testIntegration(key: string): Promise<IntegrationTestResult> {
  try {
    switch (key) {
      case "gemini":
        return await testGemini();
      case "nvidia":
        return await testNvidia();
      case "openrouter":
        return await testOpenRouter();
      case "apollo":
        return await testApollo();
      case "hunter":
        return await testHunter();
      case "gmail":
        return await testGmail();
      default:
        return { success: false, message: `Unknown integration: ${key}` };
    }
  } catch (err) {
    logger.error({ err, key }, "Integration test failed unexpectedly");
    return { success: false, message: describeError(err) };
  }
}
