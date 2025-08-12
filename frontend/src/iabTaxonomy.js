// Minimal examples; replace/extend with your full IAB 3.1 taxonomy if available.
export const IAB_LABELS = {
  // Top-level categories
  IAB1: "Arts & Entertainment",
  IAB2: "Automotive",
  IAB8: "Food & Drink",
  IAB14: "Sports",
  // Subcategories
  "IAB14-17": "Football",
  "IAB14-6": "Baseball",
  "IAB8-5": "Cooking & Recipes",
};

/** Returns a label like "IAB14 — Sports" or the code if unknown. */
export function labelForCode(code) {
  if (!code) return "";
  const label = IAB_LABELS[code];
  return label ? `${code} — ${label}` : code;
}