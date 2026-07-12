/** Substitutes {{contactName}} / {{companyName}} merge tokens in a campaign template for one recipient. */
export function applyMergeTokens(
  text: string,
  values: { contactName?: string | null; companyName: string },
): string {
  return text
    .replaceAll("{{contactName}}", values.contactName?.trim() || "there")
    .replaceAll("{{companyName}}", values.companyName);
}
