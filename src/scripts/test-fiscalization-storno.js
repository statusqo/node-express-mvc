/**
 * Storno (cancellation invoice) fiscalisation smoke test.
 *
 * Submits a two-step sequence to the FINA demo endpoint:
 *   1. Original invoice — fiscalizes normally, receives a JIR.
 *   2. Storno invoice   — same structure but with negative amounts, receives
 *                         its own independent JIR.
 *
 * NOTE: The f73 namespace (Fiskalizacija 1.x / 2012 API) does NOT include a
 * StornRac XML element. In this API version a storno is simply a new invoice
 * with negative amounts. The application tracks the cancellation relationship
 * internally (stornoOfInvoiceId on Invoice) — it is not sent to FINA.
 *
 * Does NOT write anything to the database.
 *
 * Usage:
 *   node src/scripts/test-fiscalization-storno.js
 */
require("dotenv").config();

const { loadCertificate, computeZki, signXml } = require("../infrastructure/fiscalization/xmlSigner");
const { buildRacunZahtjev, formatFiskalDate }   = require("../infrastructure/fiscalization/xmlBuilder");
const { sendToTaxAdmin }                         = require("../infrastructure/fiscalization/fiskalApi");
const { getFiscalizationConfig }                 = require("../config/fiscalization");
const crypto = require("crypto");

// ── Helpers ───────────────────────────────────────────────────────────────────

function section(title) {
  console.log("\n" + "─".repeat(60));
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

function ok(msg)   { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.error(`  ✗ ${msg}`); }
function info(msg) { console.log(`    ${msg}`); }

/**
 * Build, sign, and submit one invoice to FINA.
 *
 * @param {object} params
 * @param {object} cert
 * @param {object} config
 * @returns {Promise<{ jir: string, zkiCode: string, signedXml: string }>}
 */
async function fiscalize({ sequenceNumber, invoiceDate, grandTotal, lines, naknada = false }, cert, config) {
  const fiscalInvoiceNumber = `${sequenceNumber}/${config.businessPremisesId}/${config.deviceId}`;
  const fiscalDatetime      = formatFiskalDate(invoiceDate);

  info(`Invoice number : ${fiscalInvoiceNumber}`);
  info(`Date/time      : ${fiscalDatetime}`);
  info(`Total          : ${Number(grandTotal).toFixed(2)}`);

  // ── ZKI ──────────────────────────────────────────────────────────────────
  const zkiCode = computeZki({
    companyOib:    cert.companyOib,
    fiscalDatetime,
    sequenceNum:   String(sequenceNumber),
    premisesId:    config.businessPremisesId,
    deviceId:      config.deviceId,
    grandTotal:    Number(grandTotal).toFixed(2),
    privateKeyPem: cert.privateKeyPem,
  });
  ok(`ZKI computed   : ${zkiCode}`);

  // ── Build + sign XML ──────────────────────────────────────────────────────
  const messageId   = crypto.randomUUID();
  const unsignedXml = buildRacunZahtjev({
    messageId,
    sentAt:             new Date(),
    companyOib:         cert.companyOib,
    inVatSystem:        config.inVatSystem,
    invoiceDate,
    fiscalInvoiceNumber,
    sequenceLabel:      config.sequenceLabel,
    paymentMethod:      "K",
    operatorOib:        config.operatorOib,
    zkiCode,
    grandTotal:         Number(grandTotal),
    lines,
    naknada,
  });
  const signedXml = signXml(unsignedXml, cert.privateKeyPem, cert.certPem, cert.chainPems || []);
  ok("SOAP XML built and signed");

  console.log("\n  --- Signed XML ---");
  console.log(signedXml);
  console.log("  ---");

  // ── Submit to FINA ────────────────────────────────────────────────────────
  console.log("\n  Sending to FINA...");
  const { jir, rawResponse } = await sendToTaxAdmin(signedXml);
  ok(`JIR received   : ${jir}`);
  console.log("\n  --- FINA response ---");
  console.log(rawResponse);
  console.log("  ---");

  return { jir, zkiCode, signedXml };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log("\n=== FINA Storno Fiscalisation Smoke Test ===");

  // ── 1. Config + certificate ──────────────────────────────────────────────
  section("1. Configuration");

  const config = getFiscalizationConfig();
  info(`Environment : ${config.environment}`);
  info(`Endpoint    : ${config.endpoint}`);
  info(`Cert path   : ${config.certPath}`);
  info(`Premises ID : ${config.businessPremisesId}`);
  info(`Device ID   : ${config.deviceId}`);
  info(`Operator OIB: ${config.operatorOib}`);

  let cert;
  try {
    cert = loadCertificate();
    ok(`Certificate loaded — Company OIB: ${cert.companyOib}`);
  } catch (err) {
    fail(`Certificate load FAILED: ${err.message}`);
    process.exit(1);
  }

  // ── 2. Original invoice ───────────────────────────────────────────────────
  section("2. Original Invoice");

  // Use a large random sequence number to avoid collision with real or previous test invoices.
  const origSeqNumber  = Math.floor(Math.random() * 900000) + 100000;
  const origDate       = new Date();
  const origGrossTotal = 125.00;  // 100.00 net + 25.00 VAT (25%)

  const origLines = [
    { title: "Test product A", quantity: 1, price: 100.00, vatRate: 25 },
    { title: "Test product B", quantity: 1, price: 25.00,  vatRate: 0  },
  ];

  let origJir, origZki;
  try {
    ({ jir: origJir, zkiCode: origZki } = await fiscalize(
      {
        sequenceNumber: origSeqNumber,
        invoiceDate:    origDate,
        grandTotal:     origGrossTotal,
        lines:          origLines,
      },
      cert,
      config
    ));
  } catch (err) {
    fail(`Original invoice FAILED: ${err.message}`);
    process.exit(1);
  }

  console.log(`\n  ── Original invoice fiscalised ──`);
  info(`Seq number : ${origSeqNumber}`);
  info(`JIR        : ${origJir}`);
  info(`ZKI        : ${origZki}`);

  // ── 3. Storno invoice ─────────────────────────────────────────────────────
  section("3. Storno Invoice (cancels the original)");

  // New sequential number — storno invoices consume from the same counter.
  const stornoSeqNumber  = origSeqNumber + 1;
  const stornoDate       = new Date();   // must be >= original date
  const stornoGrossTotal = -origGrossTotal; // negative mirror of original

  // Line prices are negated — FINA expects negative amounts in storno XML.
  const stornoLines = origLines.map((l) => ({ ...l, price: -(Number(l.price)) }));

  let stornoJir, stornoZki;
  try {
    ({ jir: stornoJir, zkiCode: stornoZki } = await fiscalize(
      {
        sequenceNumber: stornoSeqNumber,
        invoiceDate:    stornoDate,
        grandTotal:     stornoGrossTotal,
        lines:          stornoLines,
        naknada:        false,
      },
      cert,
      config
    ));
  } catch (err) {
    fail(`Storno invoice FAILED: ${err.message}`);
    process.exit(1);
  }

  // ── 4. Summary ────────────────────────────────────────────────────────────
  section("4. Summary");

  console.log("  Original invoice:");
  info(`Fiscal number : ${origSeqNumber}/${config.businessPremisesId}/${config.deviceId}`);
  info(`Total         : ${origGrossTotal.toFixed(2)}`);
  info(`ZKI           : ${origZki}`);
  info(`JIR           : ${origJir}`);

  console.log("\n  Storno invoice:");
  info(`Fiscal number : ${stornoSeqNumber}/${config.businessPremisesId}/${config.deviceId}`);
  info(`Total         : ${stornoGrossTotal.toFixed(2)}`);
  info(`ZKI           : ${stornoZki}`);
  info(`JIR           : ${stornoJir}`);
  info(`Cancels       : ${origSeqNumber}/${config.businessPremisesId}/${config.deviceId} (tracked internally only)`);

  console.log("\n  ✓ Both invoices fiscalised successfully.\n");
}

run().catch((err) => {
  console.error("\nUnexpected error:", err);
  process.exit(1);
});
