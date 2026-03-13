/**
 * Company / issuer information printed on invoices.
 * All values read from environment variables.
 */
const { getEnv } = require("./env");

function getCompanyConfig() {
  return {
    name:         getEnv("COMPANY_NAME", ""),
    addressLine1: getEnv("COMPANY_ADDRESS_LINE1", ""),
    addressLine2: getEnv("COMPANY_ADDRESS_LINE2", ""),
    oib:          getEnv("COMPANY_OIB", ""),
    vatId:        getEnv("COMPANY_VAT_ID", ""),   // e.g. HR12345678901
  };
}

module.exports = { getCompanyConfig };
