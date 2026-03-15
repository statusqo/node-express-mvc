/**
 * Fiscalisation service — orchestrates the Croatian fiscalisation process.
 *
 * Flow for each invoice:
 *   1. Load FINA certificate (cached)
 *   2. Build fiscal invoice number (SEQ/PREMISES/DEVICE)
 *   3. Compute ZKI (Zaštitni kod izdavatelja)
 *   4. Build SOAP XML (RacunZahtjev)
 *   5. Sign XML with certificate
 *   6. Send to Tax Administration, receive JIR
 *   7. Update invoice record with result
 *
 * This service does NOT throw on FINA errors — it records the error on the
 * invoice record and returns a result object so the caller can continue.
 * The invoice PDF has already been written by the time this runs.
 */
const invoiceRepo = require("../repos/invoice.repo");
const logger = require("../config/logger");
const { getFiscalizationConfig } = require("../config/fiscalization");
const { loadCertificate, computeZki, signXml } = require("../infrastructure/fiscalization/xmlSigner");
const { buildRacunZahtjev, formatFiskalDate } = require("../infrastructure/fiscalization/xmlBuilder");
const { sendToTaxAdmin } = require("../infrastructure/fiscalization/fiskalApi");

function newUuid() {
  return require("crypto").randomUUID();
}

/**
 * Build the fiscal invoice number in Croatian format: "SEQ/PREMISES/DEVICE"
 *
 * @param {number} sequenceNumber
 * @param {string} premisesId
 * @param {string} deviceId
 * @returns {string}
 */
function buildFiscalInvoiceNumber(sequenceNumber, premisesId, deviceId) {
  return `${sequenceNumber}/${premisesId}/${deviceId}`;
}

/**
 * Determine the FINA payment method code from the order data.
 * Stripe payments are always card (K).
 *
 * @param {object} order
 * @returns {"G"|"K"|"T"|"O"}
 */
function getPaymentMethodCode(order) {
  // All Stripe payments are card
  if (order.stripePaymentIntentId) return "K";
  // Default to card for online orders
  return "K";
}

/**
 * Main fiscalisation entry point. Called after an invoice record is created.
 *
 * Handles both original invoices and storno (cancellation) invoices transparently.
 * For storno invoices (invoice.stornoOfInvoiceId is set):
 *   - Loads the original invoice to build the StornRac reference element
 *   - Passes negative amounts to the SOAP XML (FINA spec requires actual negative values)
 *   - ZKI input uses the negative IznosUkupno string (confirmed per FINA v2.6 spec)
 *
 * @param {object} invoice  - Plain invoice object (from DB)
 * @param {object} order    - Plain order object
 * @param {Array}  lines    - Order lines: [{ price, quantity, vatRate }].
 *                            For storno invoices these must already have negative prices.
 * @returns {Promise<{ success: boolean, jir?: string, zkiCode?: string, originalInvoiceNumber?: string, error?: string }>}
 */
async function fiscalizeInvoice(invoice, order, lines) {
  const config = getFiscalizationConfig();

  // ── Guard: skip if not configured ───────────────────────────────────────
  if (!config.certPath) {
    logger.warn("Fiscalisation skipped — FINA_CERT_PATH not configured", { invoiceId: invoice.id });
    await _updateInvoice(invoice.id, { fiscalizationStatus: "not_required" });
    return { success: false, error: "FINA_CERT_PATH not configured" };
  }

  // ── Load certificate ─────────────────────────────────────────────────────
  let cert;
  try {
    cert = loadCertificate();
  } catch (certErr) {
    logger.error("Fiscalisation: certificate load failed", { invoiceId: invoice.id, error: certErr.message });
    await _updateInvoice(invoice.id, {
      fiscalizationStatus: "failed",
      fiscalizationRequest: null,
      fiscalizationResponse: `Certificate error: ${certErr.message}`,
    });
    return { success: false, error: certErr.message };
  }

  // ── Storno detection ─────────────────────────────────────────────────────
  // The f73 namespace (Fiskalizacija 1.x / 2012 API) does not support a
  // StornRac XML element — a storno is submitted as a regular invoice with
  // negative amounts. We still identify storno invoices so we can:
  //   a) use invoice.total (negative) for ZKI/XML rather than order.total
  //   b) log the relationship and return originalInvoiceNumber for the PDF
  const isStorno = !!invoice.stornoOfInvoiceId;
  let originalInvoiceNumber = null;

  if (isStorno) {
    const originalInvoice = await invoiceRepo.findById(invoice.stornoOfInvoiceId);
    if (originalInvoice) {
      originalInvoiceNumber = originalInvoice.invoiceNumber;
    }
    logger.info("Fiscalisation: storno invoice — submitting with negative amounts", {
      invoiceId:             invoice.id,
      invoiceNumber:         invoice.invoiceNumber,
      originalInvoiceNumber,
    });
  }

  // ── Build fiscal invoice number ──────────────────────────────────────────
  const fiscalInvoiceNumber = buildFiscalInvoiceNumber(
    invoice.sequenceNumber,
    config.businessPremisesId,
    config.deviceId
  );

  // ── Compute ZKI ──────────────────────────────────────────────────────────
  // For storno invoices the total is negative. Per FINA spec (v2.6 ch.12),
  // IznosUkupno in the ZKI input string must match the value sent in the XML,
  // so we pass the actual negative amount string.
  const invoiceDate     = new Date(invoice.generatedAt || Date.now());
  const fiscalDatetime  = formatFiskalDate(invoiceDate);
  const [seqNum, premisesId, deviceId] = fiscalInvoiceNumber.split("/");
  const grandTotal      = Number(invoice.total != null ? invoice.total : (order.total || 0)).toFixed(2);
  const paymentMethod   = invoice.paymentMethod || getPaymentMethodCode(order);

  let zkiCode;
  try {
    zkiCode = computeZki({
      companyOib:    cert.companyOib,
      fiscalDatetime,
      sequenceNum:   seqNum,
      premisesId,
      deviceId,
      grandTotal,
      privateKeyPem: cert.privateKeyPem,
    });
  } catch (zkiErr) {
    logger.error("Fiscalisation: ZKI computation failed", { invoiceId: invoice.id, error: zkiErr.message });
    await _updateInvoice(invoice.id, {
      fiscalizationStatus: "failed",
      fiscalInvoiceNumber,
      fiscalizationResponse: `ZKI error: ${zkiErr.message}`,
    });
    return { success: false, error: zkiErr.message };
  }

  // ── Build and sign SOAP XML ───────────────────────────────────────────────
  // NakDost (naknadna dostava) must be true when an invoice is submitted after
  // its issue date due to CIS unavailability. Threshold: 5 minutes — covers
  // normal network retries without flagging live first-attempt submissions.
  const NAKNADNA_THRESHOLD_MS = 5 * 60 * 1_000;
  const naknada = (Date.now() - invoiceDate.getTime()) > NAKNADNA_THRESHOLD_MS;

  if (naknada) {
    logger.info("Fiscalisation: NakDost=true (late submission)", {
      invoiceId:     invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate:   invoiceDate.toISOString(),
      delayMs:       Date.now() - invoiceDate.getTime(),
    });
  }

  const messageId = newUuid();
  let signedXml;
  try {
    const unsignedXml = buildRacunZahtjev({
      messageId,
      sentAt:              new Date(),
      companyOib:          cert.companyOib,
      inVatSystem:         config.inVatSystem,
      invoiceDate,
      fiscalInvoiceNumber,
      sequenceLabel:       config.sequenceLabel,
      paymentMethod,
      operatorOib:         config.operatorOib,
      zkiCode,
      grandTotal:          Number(grandTotal),
      lines,
      naknada,
    });
    signedXml = signXml(unsignedXml, cert.privateKeyPem, cert.certPem, cert.chainPems || []);
  } catch (buildErr) {
    logger.error("Fiscalisation: XML build/sign failed", { invoiceId: invoice.id, error: buildErr.message });
    await _updateInvoice(invoice.id, {
      fiscalizationStatus:  "failed",
      fiscalInvoiceNumber,
      zkiCode,
      fiscalizationResponse: `XML error: ${buildErr.message}`,
    });
    return { success: false, zkiCode, error: buildErr.message };
  }

  // ── Send to Tax Administration ────────────────────────────────────────────
  let jir;
  let rawResponse;
  try {
    ({ jir, rawResponse } = await sendToTaxAdmin(signedXml));
  } catch (apiErr) {
    logger.error("Fiscalisation: FINA submission failed", {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      error: apiErr.message,
    });
    await _updateInvoice(invoice.id, {
      fiscalizationStatus:   "failed",
      fiscalInvoiceNumber,
      zkiCode,
      fiscalizationRequest:  signedXml,
      fiscalizationResponse: apiErr.message,
    });
    return { success: false, zkiCode, error: apiErr.message };
  }

  // ── Success ───────────────────────────────────────────────────────────────
  logger.info("Fiscalisation: success", {
    invoiceId:     invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    jir,
    fiscalInvoiceNumber,
  });

  await _updateInvoice(invoice.id, {
    fiscalInvoiceNumber,
    zkiCode,
    fiscalizationStatus:   "fiscalized",
    fiscalizationJir:      jir,
    fiscalizedAt:          new Date(),
    fiscalizationRequest:  signedXml,
    fiscalizationResponse: rawResponse,
    // Snapshot the exact params used for this fiscalisation (audit trail)
    companyOib:  cert.companyOib,
    premisesId:  config.businessPremisesId,
    deviceId:    config.deviceId,
    operatorOib: config.operatorOib,
  });

  return {
    success: true,
    jir,
    zkiCode,
    fiscalInvoiceNumber,
    operatorOib: config.operatorOib,
    originalInvoiceNumber,  // non-null only for storno invoices
  };
}

/**
 * Update mutable fiscalisation fields on an invoice record.
 * Uses a direct DB update to bypass the immutability hook (which only guards
 * the original accounting fields, not the fiscal ones).
 *
 * @param {string} invoiceId
 * @param {object} fields
 */
async function _updateInvoice(invoiceId, fields) {
  try {
    await invoiceRepo.updateFiscalFields(invoiceId, fields);
  } catch (updateErr) {
    logger.error("Fiscalisation: failed to update invoice record", {
      invoiceId,
      fields: Object.keys(fields),
      error: updateErr.message,
    });
  }
}

module.exports = { fiscalizeInvoice, buildFiscalInvoiceNumber };
