// Minimal examples; replace/extend with your full IAB 3.1 taxonomy if available.
export const IAB_LABELS = {
  // Top-level categories
  IAB1: "Arts & Entertainment",
  IAB2: "Automotive",
  IAB8: "Food & Drink",
  IAB9: "Sports",
  IAB14: "Sports", // depending on taxonomy version mapping
  // Subcategories
  "IAB9-7": "Basketball",
  "IAB9-17": "Football",
  "IAB14-17": "Football",
  "IAB14-6": "Baseball",
  "IAB8-5": "Cooking & Recipes",
};

/** Returns the plain label (e.g., "Sports") for a code, or empty string if unknown. */
export function labelForCode(code) {
  return IAB_LABELS[code] || "";
}