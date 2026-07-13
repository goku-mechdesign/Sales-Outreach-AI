/**
 * Regional tone/formality guidance for outreach copy. This is layered on
 * top of language translation (or applied standalone for English-speaking
 * regions) so emails don't just read in the right language -- they read
 * like they were written by someone who sells in that market.
 *
 * "united states" is treated as the baseline register (matches the
 * campaign's own configured Tone as-is), so US prospects never trigger an
 * extra LLM call for style adjustment.
 */

interface RegionProfile {
  /** Short instruction injected into the generation/translation prompt. */
  style: string;
}

const REGION_STYLE: Record<string, RegionProfile> = {
  // Central Europe -- direct, formal, low-hype
  germany: {
    style:
      "Direct and formal. Get to the point within the first two sentences, use precise and factual language, and address the recipient with respectful formality (the tone equivalent of German 'Sie'). Avoid hype, superlatives, and exclamation marks.",
  },
  austria: {
    style:
      "Direct and formal, similar to German business norms. Precise, factual, respectful in tone, minimal small talk, no hype language.",
  },
  switzerland: {
    style:
      "Formal, precise, and understated. Avoid hype or exaggerated claims, keep sentences tight, and lead with substance over enthusiasm.",
  },

  // French-speaking -- warmer opening, still formal
  france: {
    style:
      "Warm but professional, using the formal register (the tone equivalent of French 'vous'). Open with a brief courteous line acknowledging the recipient's business before the pitch. Avoid sounding pushy or overly salesy.",
  },

  // Benelux -- blunt and efficient
  netherlands: {
    style:
      "Direct, concise, and no-nonsense. Skip flattery and get straight to the value and the ask, while remaining polite.",
  },
  belgium: {
    style:
      "Direct and efficient, with modest politeness. Get to the point quickly without excessive small talk.",
  },

  // Nordics -- egalitarian, low-context, brief
  sweden: { style: NORDIC_STYLE() },
  norway: { style: NORDIC_STYLE() },
  denmark: { style: NORDIC_STYLE() },
  finland: { style: NORDIC_STYLE() },
  iceland: { style: NORDIC_STYLE() },

  // British Isles -- polite, understated, measured
  "united kingdom": { style: BRITISH_STYLE() },
  uk: { style: BRITISH_STYLE() },
  ireland: { style: BRITISH_STYLE() },

  // Southern Europe / Latin markets -- warmer, relationship-first
  italy: { style: WARM_RELATIONSHIP_STYLE() },
  spain: { style: WARM_RELATIONSHIP_STYLE() },
  portugal: { style: WARM_RELATIONSHIP_STYLE() },
  mexico: { style: WARM_RELATIONSHIP_STYLE() },
  argentina: { style: WARM_RELATIONSHIP_STYLE() },
  colombia: { style: WARM_RELATIONSHIP_STYLE() },
  chile: { style: WARM_RELATIONSHIP_STYLE() },
  brazil: { style: WARM_RELATIONSHIP_STYLE() },

  // Central & Eastern Europe -- formal, title-conscious
  poland: { style: CEE_STYLE() },
  "czech republic": { style: CEE_STYLE() },
  czechia: { style: CEE_STYLE() },
  slovakia: { style: CEE_STYLE() },
  hungary: { style: CEE_STYLE() },
  romania: { style: CEE_STYLE() },
  bulgaria: { style: CEE_STYLE() },
  greece: { style: CEE_STYLE() },
  ukraine: { style: CEE_STYLE() },

  // Canada, English default -- close to US baseline but slightly more
  // measured/polite; French Canada is handled via the Quebec city override
  // in languageGuess.ts and inherits the France profile through language.
  canada: {
    style:
      "Friendly and professional, similar to US norms but slightly more measured and polite -- avoid overly aggressive sales language.",
  },
  australia: {
    style:
      "Friendly, direct, and informal-professional. Avoid excessive formality; a light, confident tone lands well.",
  },
};

function NORDIC_STYLE(): string {
  return "Egalitarian and low-context. Be brief, factual, and direct -- skip flattery, hierarchy-based language, and hard-sell phrasing. Confidence should come from clarity, not enthusiasm.";
}

function BRITISH_STYLE(): string {
  return "Polite, understated, and slightly reserved. Use measured confidence rather than overt enthusiasm, favor gentle phrasing (e.g. 'I hope this finds you well', 'I wondered if...'), and avoid sounding overly salesy or American in register.";
}

function WARM_RELATIONSHIP_STYLE(): string {
  return "Warmer and more relationship-oriented than a typical US cold email. Open with a genuine, specific line of interest in the recipient's business before making the ask, and keep a personable, respectful tone throughout.";
}

function CEE_STYLE(): string {
  return "Formal and respectful, more so than typical US business casual. Prefer a title-conscious, professional register, keep claims modest and well-substantiated, and avoid overly casual phrasing.";
}

export interface RegionalStyleResult {
  /** True when this region matches the baseline register (no LLM-visible adjustment needed). */
  isDefault: boolean;
  /** Instruction to inject into the prompt; empty string when `isDefault`. */
  style: string;
}

/**
 * Looks up tone/formality guidance for a prospect's country. Falls back to
 * the baseline (US-like) register when the country is unknown or is
 * explicitly the US, so the common case never incurs an extra LLM call.
 */
export function getRegionalStyle(country: string | null | undefined): RegionalStyleResult {
  const normalized = country?.trim().toLowerCase();
  if (!normalized || normalized === "united states" || normalized === "usa") {
    return { isDefault: true, style: "" };
  }
  const profile = REGION_STYLE[normalized];
  if (!profile) {
    return { isDefault: true, style: "" };
  }
  return { isDefault: false, style: profile.style };
}
