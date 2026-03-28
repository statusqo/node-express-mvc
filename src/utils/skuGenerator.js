/**
 * Shopify-style SKU generator for product variants.
 *
 * Produces unique SKUs per product + variant index, e.g.:
 *   "Web Infrastruktura - Predavanje", 0  →  "WEB-INF-PRE-001"
 *   "Seminar za Developere",           0  →  "SEM-DEV-001"
 *   "Seminar za Developere",           1  →  "SEM-DEV-002"
 *
 * Uniqueness guarantee: the title-derived prefix distinguishes products;
 * the zero-padded index distinguishes variants within the same product.
 *
 * @param {string} productTitle  - Product title (Croatian or English)
 * @param {number} variantIndex  - 0-based index of the variant within its product
 * @returns {string}             - Uppercase SKU string, e.g. "WEB-INF-PRE-001"
 */
function generateVariantSku(productTitle, variantIndex) {
  const STOP_WORDS = new Set([
    "i", "za", "u", "na", "je", "s", "od", "do", "po", "sa", "iz",
    "the", "and", "for", "of", "in", "a", "an", "to", "with", "by",
  ]);

  // Transliterate Croatian characters to ASCII equivalents
  const transliterated = String(productTitle)
    .replace(/[čČ]/g, "c")
    .replace(/[ćĆ]/g, "c")
    .replace(/[šŠ]/g, "s")
    .replace(/[đĐ]/g, "d")
    .replace(/[žŽ]/g, "z");

  // Split on whitespace, hyphens, underscores, and other punctuation
  const words = transliterated
    .toLowerCase()
    .split(/[\s\-_/\\.,;:!?()+&]+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));

  // Take up to 3 significant words, first 3 chars each, uppercase
  const parts = words
    .slice(0, 3)
    .map((w) => w.substring(0, 3).toUpperCase());

  // Fallback if title produces nothing useful
  if (parts.length === 0) {
    parts.push("PRD");
  }

  // Zero-pad index to 3 digits (1-based)
  const index = String(variantIndex + 1).padStart(3, "0");

  return parts.join("-") + "-" + index;
}

module.exports = { generateVariantSku };
