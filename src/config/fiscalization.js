/**
 * Fiscalisation configuration.
 * All values read from environment variables at startup.
 */
const path = require("path");
const { getEnv } = require("./env");

const FINA_ENDPOINTS = {
  demo:       "https://cistest.apis-it.hr:8449/FiskalizacijaServiceTest",
  production: "https://cis.porezna-uprava.hr:8449/FiskalizacijaService",
};

function getFiscalizationConfig() {
  const environment = getEnv("FINA_ENVIRONMENT", "demo");

  return {
    // "demo" or "production"
    environment,

    // FINA SOAP endpoint
    endpoint: FINA_ENDPOINTS[environment] || FINA_ENDPOINTS.demo,

    // Path to the PKCS#12 (.p12) certificate file
    certPath: getEnv("FINA_CERT_PATH", ""),

    // Password to decrypt the .p12 file
    certPassword: getEnv("FINA_CERT_PASSWORD", ""),

    // OIB of the operator (cashier) submitting the invoice
    operatorOib: getEnv("FINA_OPERATOR_OIB", ""),

    // Oznaka poslovnog prostora (business premises identifier, e.g. "INTERNET1")
    businessPremisesId: getEnv("FINA_BUSINESS_PREMISES_ID", "INTERNET1"),

    // Oznaka naplatnog uređaja (cash register / device identifier)
    deviceId: getEnv("FINA_DEVICE_ID", "1"),

    // Whether the company is registered in the VAT (PDV) system
    inVatSystem: getEnv("COMPANY_IN_VAT_SYSTEM", "true") === "true",

    // Invoice sequence label sent in SOAP XML (P = poslovni prostor / premises-based)
    sequenceLabel: getEnv("FINA_SEQUENCE_LABEL", "P"),

    // Request timeout in milliseconds
    timeoutMs: parseInt(getEnv("FINA_TIMEOUT_MS", "10000"), 10),
  };
}

/**
 * Resolve a certificate path that may be relative (to project root) or absolute.
 */
function resolveCertPath(certPath) {
  if (!certPath) return "";
  if (path.isAbsolute(certPath)) return certPath;
  return path.resolve(process.cwd(), certPath);
}

module.exports = { getFiscalizationConfig, resolveCertPath };
