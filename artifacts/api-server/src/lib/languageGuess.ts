const COUNTRY_LANGUAGE: Record<string, string> = {
  // North America
  "united states": "en",
  usa: "en",
  canada: "en",

  // British Isles / Anglophone
  "united kingdom": "en",
  uk: "en",
  ireland: "en",
  australia: "en",
  "new zealand": "en",
  singapore: "en",
  india: "en",

  // Western Europe
  germany: "de",
  austria: "de",
  switzerland: "de",
  liechtenstein: "de",
  france: "fr",
  monaco: "fr",
  luxembourg: "fr",
  spain: "es",
  italy: "it",
  "san marino": "it",
  portugal: "pt",
  netherlands: "nl",
  belgium: "nl",

  // Nordics
  sweden: "sv",
  norway: "no",
  denmark: "da",
  finland: "fi",
  iceland: "is",

  // Central & Eastern Europe
  poland: "pl",
  "czech republic": "cs",
  czechia: "cs",
  slovakia: "sk",
  slovenia: "sl",
  croatia: "hr",
  serbia: "sr",
  bosnia: "bs",
  "bosnia and herzegovina": "bs",
  hungary: "hu",
  romania: "ro",
  bulgaria: "bg",
  greece: "el",
  ukraine: "uk",
  estonia: "et",
  latvia: "lv",
  lithuania: "lt",
  malta: "mt",
  cyprus: "el",

  // Latin America
  mexico: "es",
  argentina: "es",
  colombia: "es",
  chile: "es",
  peru: "es",
  ecuador: "es",
  "costa rica": "es",
  uruguay: "es",
  venezuela: "es",
  brazil: "pt",

  // Asia / Middle East
  japan: "ja",
  "south korea": "ko",
  china: "zh",
  taiwan: "zh",
  "hong kong": "zh",
  vietnam: "vi",
  thailand: "th",
  indonesia: "id",
  malaysia: "ms",
  turkey: "tr",
  russia: "ru",
  israel: "he",
  "saudi arabia": "ar",
  uae: "ar",
  egypt: "ar",
};

/**
 * City-level overrides for countries that are meaningfully multilingual.
 * Applied on top of the country-level guess when the city matches. Kept
 * deliberately small -- only the cases likely to matter for EU/NA outreach.
 */
const CITY_LANGUAGE_OVERRIDES: { country: string; cities: string[]; language: string }[] = [
  // French-speaking Canada (Quebec)
  {
    country: "canada",
    cities: ["montreal", "montréal", "quebec city", "quebec", "québec", "laval", "gatineau", "sherbrooke"],
    language: "fr",
  },
  // French-speaking Switzerland (Romandy)
  { country: "switzerland", cities: ["geneva", "genève", "lausanne", "neuchatel", "neuchâtel", "fribourg"], language: "fr" },
  // Italian-speaking Switzerland (Ticino)
  { country: "switzerland", cities: ["lugano", "bellinzona", "locarno"], language: "it" },
  // French-speaking Belgium (Wallonia)
  { country: "belgium", cities: ["liege", "liège", "charleroi", "namur", "mons", "wallonia"], language: "fr" },
];

/**
 * Best-effort language guess from a country (and optionally city) name,
 * defaulting to English. City overrides only kick in for countries where a
 * meaningful language split exists (e.g. Quebec vs. the rest of Canada).
 */
export function guessLanguageFromCountry(
  country: string | null | undefined,
  city?: string | null,
): string {
  if (!country) return "en";
  const normalizedCountry = country.trim().toLowerCase();
  const normalizedCity = city?.trim().toLowerCase();

  if (normalizedCity) {
    const override = CITY_LANGUAGE_OVERRIDES.find(
      (o) => o.country === normalizedCountry && o.cities.includes(normalizedCity),
    );
    if (override) return override.language;
  }

  return COUNTRY_LANGUAGE[normalizedCountry] ?? "en";
}
