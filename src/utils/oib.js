/**
 * OIB (Osobni identifikacijski broj) validation.
 *
 * OIB is Croatia's personal/company identification number — 11 digits where
 * the last digit is a checksum derived from the first 10 using ISO 7064 MOD 11-10.
 *
 * Algorithm:
 *   Start with product = 10.
 *   For each of the first 10 digits d:
 *     product = (product + d) % 10
 *     if product === 0: product = 10
 *     product = (product * 2) % 11
 *   check = 11 - product
 *   if check === 10: check = 0
 *   The check digit must equal the 11th digit.
 */

/**
 * Validate an OIB string.
 *
 * @param {string} oib
 * @returns {boolean} true if valid
 */
function isValidOib(oib) {
  if (typeof oib !== "string") return false;
  if (!/^\d{11}$/.test(oib)) return false;

  let product = 10;
  for (let i = 0; i < 10; i++) {
    product = (product + parseInt(oib[i], 10)) % 10;
    if (product === 0) product = 10;
    product = (product * 2) % 11;
  }

  const check = 11 - product === 10 ? 0 : 11 - product;
  return check === parseInt(oib[10], 10);
}

module.exports = { isValidOib };
