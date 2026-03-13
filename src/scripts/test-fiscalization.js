/**
 * Standalone fiscalisation smoke-test.
 *
 * Calls the FINA demo endpoint with a synthetic invoice and prints the result.
 * Does NOT write anything to the database.
 *
 * Usage:
 *   node src/scripts/test-fiscalization.js
 */
require("dotenv").config();

const { loadCertificate } = require("../infrastructure/fiscalization/xmlSigner");
const { computeZki, signXml } = require("../infrastructure/fiscalization/xmlSigner");
const { buildRacunZahtjev, formatFiskalDate } = require("../infrastructure/fiscalization/xmlBuilder");
const { sendToTaxAdmin } = require("../infrastructure/fiscalization/fiskalApi");
const { getFiscalizationConfig } = require("../config/fiscalization");
const crypto = require("crypto");

async function run() {
  console.log("\n=== FINA Fiscalisation Smoke Test ===\n");

  // ── 1. Config ──────────────────────────────────────────────────────────────
  const config = getFiscalizationConfig();
  console.log("Environment :", config.environment);
  console.log("Endpoint    :", config.endpoint);
  console.log("Cert path   :", config.certPath);
  console.log("Premises ID :", config.businessPremisesId);
  console.log("Device ID   :", config.deviceId);
  console.log("Operator OIB:", config.operatorOib);
  console.log("");

  // ── 2. Load certificate ────────────────────────────────────────────────────
  let cert;
  try {
    cert = loadCertificate();
    console.log("✓ Certificate loaded");
    console.log("  Company OIB (from cert):", cert.companyOib);
  } catch (err) {
    console.error("✗ Certificate load FAILED:", err.message);
    process.exit(1);
  }

  // ── 3. Build synthetic invoice data ───────────────────────────────────────
  // Use a small unique sequence number to avoid duplicate-invoice errors in demo.
  const sequenceNumber  = Math.floor(Math.random() * 900000) + 100000;
  const fiscalInvoiceNumber = `${sequenceNumber}/${config.businessPremisesId}/${config.deviceId}`;
  const invoiceDate     = new Date();
  const fiscalDatetime  = formatFiskalDate(invoiceDate);
  const grandTotal      = "10.00";

  // Single line: 10.00 kn / eur gross, 25% VAT
  const lines = [
    { title: "Test product", quantity: 1, price: 10.00, vatRate: 25 },
  ];

  console.log("\nSynthetic invoice:");
  console.log("  Number    :", fiscalInvoiceNumber);
  console.log("  Date/time :", fiscalDatetime);
  console.log("  Total     :", grandTotal);

  // ── 4. Compute ZKI ────────────────────────────────────────────────────────
  let zkiCode;
  try {
    zkiCode = computeZki({
      companyOib:    cert.companyOib,
      fiscalDatetime,
      sequenceNum:   String(sequenceNumber),
      premisesId:    config.businessPremisesId,
      deviceId:      config.deviceId,
      grandTotal,
      privateKeyPem: cert.privateKeyPem,
    });
    console.log("\n✓ ZKI computed:", zkiCode);
  } catch (err) {
    console.error("✗ ZKI computation FAILED:", err.message);
    process.exit(1);
  }

  // ── 5. Build + sign SOAP XML ───────────────────────────────────────────────
  const messageId = crypto.randomUUID();
  let signedXml;
  try {
    const unsignedXml = buildRacunZahtjev({
      messageId,
      sentAt:             new Date(),
      companyOib:         cert.companyOib,
      inVatSystem:        config.inVatSystem,
      invoiceDate,
      fiscalInvoiceNumber,
      sequenceLabel:      config.sequenceLabel,
      paymentMethod:      "K",   // card
      operatorOib:        config.operatorOib,
      zkiCode,
      grandTotal:         10.00,
      lines,
      naknada:            false,
    });
    signedXml = signXml(unsignedXml, cert.privateKeyPem, cert.certPem, cert.chainPems || []);
    console.log("✓ SOAP XML built and signed");
    console.log("\n--- Signed XML being sent ---");
    console.log(signedXml);
    console.log("---");
  } catch (err) {
    console.error("✗ XML build/sign FAILED:", err.message);
    process.exit(1);
  }

  // ── 6. Send to FINA ────────────────────────────────────────────────────────
  console.log("\nSending to FINA demo...");
  try {
    const { jir, rawResponse } = await sendToTaxAdmin(signedXml);
    console.log("\n✓ SUCCESS");
    console.log("  JIR:", jir);
    console.log("\n--- Raw FINA response ---");
    console.log(rawResponse);
  } catch (err) {
    console.error("\n✗ FINA submission FAILED:", err.message);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
