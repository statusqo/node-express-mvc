/**
 * Invoice service — PDF generation and invoice record management.
 * Generates regular receipts (private persons) and R1 receipts (legal persons / companies).
 * Integrates with fiscalization.service.js for Croatian fiscalisation (ZKI + JIR).
 */
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const invoiceRepo = require("../repos/invoice.repo");
const { sequelize } = require("../db");
const logger = require("../config/logger");
const { getCompanyConfig } = require("../config/company");
const { getFiscalizationConfig } = require("../config/fiscalization");

const FONTS_DIR  = path.resolve(__dirname, "../assets/fonts");
const FONT_REGULAR = path.join(FONTS_DIR, "Roboto-Regular.ttf");
const FONT_BOLD    = path.join(FONTS_DIR, "Roboto-Medium.ttf");

// All invoice PDFs live under storage/invoices/ relative to the project root.
// Only the relative segment (e.g. "invoices/INV-2026-000001.pdf") is persisted
// in the database so the app can be moved between directories without breaking
// stored paths.
const STORAGE_ROOT = path.resolve(__dirname, "../../storage");
const INVOICE_SUBDIR = "invoices";
const INVOICE_DIR = path.join(STORAGE_ROOT, INVOICE_SUBDIR);

/**
 * Resolve a stored relative pdfPath to an absolute filesystem path.
 * @param {string} relativePath - value from invoice.pdfPath (e.g. "invoices/INV-2026-000001.pdf")
 * @returns {string} absolute path
 */
function resolvePdfPath(relativePath) {
  return path.join(STORAGE_ROOT, relativePath);
}

/**
 * Generate the next invoice number using an atomic shared counter per year.
 * All invoice types (receipt + R1) share one sequence to prevent numbering gaps
 * and comply with Croatian fiscal law (Zakon o fiskalizaciji).
 *
 * Format: BROJ_RAČUNA/OZNAKA_POSLOVNOG_PROSTORA/OZNAKA_NAPLATNOG_UREĐAJA
 * Example: 7/WEB/1
 *
 * @param {number} year
 * @param {string} premisesId - Oznaka poslovnog prostora (e.g. "WEB", "INTERNET1")
 * @param {string} deviceId   - Oznaka naplatnog uređaja (e.g. "1")
 * @param {object} t          - Sequelize transaction (must be open)
 * @returns {Promise<{ invoiceNumber: string, sequenceNumber: number }>}
 */
async function generateNextInvoiceNumber(year, premisesId, deviceId, t) {
  const now = new Date().toISOString();

  await sequelize.query(
    `INSERT INTO invoice_sequences (premise, device, year, lastValue, createdAt, updatedAt)
     VALUES (:premise, :device, :year, 1, :now, :now)
     ON CONFLICT(premise, device, year)
     DO UPDATE SET lastValue = invoice_sequences.lastValue + 1, updatedAt = :now`,
    { replacements: { premise: premisesId, device: deviceId, year, now }, transaction: t }
  );

  const [rows] = await sequelize.query(
    `SELECT lastValue FROM invoice_sequences WHERE premise = :premise AND device = :device AND year = :year`,
    { replacements: { premise: premisesId, device: deviceId, year }, transaction: t }
  );

  const sequenceNumber = rows[0].lastValue;
  const invoiceNumber  = `${sequenceNumber}/${premisesId}/${deviceId}`;

  logger.info("Invoice sequence allocated", { year, premisesId, deviceId, sequenceNumber, invoiceNumber });

  return { invoiceNumber, sequenceNumber };
}

// ─── VAT helpers ─────────────────────────────────────────────────────────────

/**
 * Compute VAT summary groups from lines. Prices are gross (VAT-inclusive).
 * Returns groups sorted ascending by rate.
 *
 * @param {Array<{price: number, quantity: number, vatRate: number|null}>} lines
 * @returns {Array<{rate: number, osnovica: number, vatAmount: number, gross: number}>}
 */
function buildVatSummary(lines) {
  const groups = new Map();
  for (const line of lines) {
    const rate      = line.vatRate != null ? Number(line.vatRate) : 0;
    const lineGross = Number(line.price) * (line.quantity || 1);
    const existing  = groups.get(rate) || { gross: 0 };
    existing.gross += lineGross;
    groups.set(rate, existing);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([rate, { gross }]) => {
      const divisor = 1 + rate / 100;
      // Work in integer cents to avoid floating-point rounding drift.
      // vatAmount is derived from rounded grossCents - rounded osnovicaCents so
      // that osnovica + vatAmount always equals gross exactly (matches FINA logic).
      const grossCents    = Math.round(gross * 100);
      const osnovicaCents = Math.round(grossCents / divisor);
      const vatAmountCents = grossCents - osnovicaCents;
      return { rate, osnovica: osnovicaCents / 100, vatAmount: vatAmountCents / 100, gross };
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAYMENT_METHOD_LABELS = { K: "Kartica", G: "Gotovina", T: "Transakcijski račun", O: "Ostalo" };

/**
 * Build the Porezna uprava verification URL encoded in the QR code.
 * Format: https://porezna.gov.hr/HR01/?jir=<JIR>&datv=YYYYMMDD_HHmmss&iznos=X.XX
 */
function buildFiscalVerificationUrl(jir, invoiceDate, total) {
  const d = invoiceDate instanceof Date ? invoiceDate : new Date(invoiceDate);
  const pad = (n) => String(n).padStart(2, "0");
  const datv = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const iznos = Number(total).toFixed(2);
  return `https://porezna.gov.hr/HR01/?jir=${jir}&datv=${datv}&iznos=${iznos}`;
}

// ─── PDF generation ───────────────────────────────────────────────────────────

/**
 * Build a PDF receipt/R1 buffer using pdfkit.
 *
 * @param {object}   order
 * @param {object[]} lines         - [{title, quantity, price, vatRate}]
 * @param {string}   invoiceNumber - Internal invoice number (e.g. "7/WEB/1")
 * @param {"receipt"|"r1"} type
 * @param {object}   [fiscal]      - Optional fiscal data:
 *   { zki, jir, fiscalInvoiceNumber, operatorOib, paymentMethod, invoiceDate,
 *     isStorno, originalInvoiceNumber }
 *   Set isStorno=true and originalInvoiceNumber to the cancelled invoice's number
 *   when generating a storno PDF. Line amounts are expected to already be negative.
 * @returns {Promise<Buffer>}
 */
async function generatePdfBuffer(order, lines, invoiceNumber, type, fiscal = {}) {
  const company  = getCompanyConfig();
  const isR1     = type === "r1";
  const isStorno = !!fiscal.isStorno;
  const currency = order.currency || "EUR";

  const invoiceDate = fiscal.invoiceDate
    ? (fiscal.invoiceDate instanceof Date ? fiscal.invoiceDate : new Date(fiscal.invoiceDate))
    : (order.createdAt ? new Date(order.createdAt) : new Date());

  const dateStr = invoiceDate.toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = invoiceDate.toLocaleTimeString("hr-HR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // Pre-generate QR code buffer if we have a JIR.
  // For storno invoices the verification URL uses the absolute (positive) total
  // because the Porezna uprava lookup expects a positive iznos value.
  let qrBuffer = null;
  if (fiscal.jir) {
    try {
      const qrTotal = isStorno
        ? Math.abs(Number(order.total || 0))
        : Number(order.total || 0);
      const url = buildFiscalVerificationUrl(fiscal.jir, invoiceDate, qrTotal);
      qrBuffer = await QRCode.toBuffer(url, { type: "png", width: 120, margin: 1 });
    } catch (_) { /* non-fatal */ }
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Regular", FONT_REGULAR);
    doc.registerFont("Bold",    FONT_BOLD);

    const L = 50;   // left margin
    const R = 545;  // right edge
    const W = R - L; // usable width

    // ── Company header (right-aligned block) ──────────────────────────────
    if (company.name || company.oib) {
      const companyTop = doc.y;
      doc.fontSize(11).font("Bold").fillColor("#000000")
        .text(company.name || "", L, companyTop, { align: "right", width: W });
      doc.fontSize(9).font("Regular").fillColor("#444444");
      if (company.addressLine1) doc.text(company.addressLine1, { align: "right", width: W });
      if (company.addressLine2) doc.text(company.addressLine2, { align: "right", width: W });
      if (company.oib)          doc.text(`OIB: ${company.oib}`, { align: "right", width: W });
      if (isR1 && company.vatId) doc.text(`PDV ID: ${company.vatId}`, { align: "right", width: W });
      doc.moveDown(1.5);
    }

    // ── Invoice title + number ─────────────────────────────────────────────
    let titleLabel;
    if (isStorno) {
      titleLabel = isR1 ? "Storno R1 Račun" : "Storno Račun";
    } else {
      titleLabel = isR1 ? "R1 Račun" : "Račun";
    }
    doc.fontSize(18).font("Bold").fillColor("#000000")
      .text(titleLabel, { align: "left" });
    doc.moveDown(0.4);

    doc.fontSize(10).font("Regular").fillColor("#333333");

    doc.text(`Broj računa: ${invoiceNumber}`);
    if (isStorno && fiscal.originalInvoiceNumber) {
      doc.text(`Storno za račun: ${fiscal.originalInvoiceNumber}`);
    }
    doc.text(`Datum: ${dateStr}`);
    doc.text(`Vrijeme: ${timeStr}`);
    doc.moveDown(1);

    // ── Customer ──────────────────────────────────────────────────────────
    doc.fontSize(10).font("Bold").fillColor("#000000").text("Kupac:");
    doc.fontSize(10).font("Regular").fillColor("#333333");

    const customerName = [order.forename, order.surname].filter(Boolean).join(" ") || order.email || "—";
    doc.text(customerName);
    if (order.email) doc.text(order.email);

    if (isR1) {
      doc.moveDown(0.25);
      doc.text(`Tvrtka: ${order.companyName || "—"}`);
      doc.text(`OIB: ${order.companyOib || "—"}`);
    }

    const addrParts = [
      order.billingLine1,
      order.billingLine2,
      [order.billingCity, order.billingState, order.billingPostcode].filter(Boolean).join(", "),
      order.billingCountry,
    ].filter(Boolean);
    if (addrParts.length) {
      doc.moveDown(0.25);
      addrParts.forEach((p) => doc.text(p));
    }

    doc.moveDown(1);

    // ── Line items table ──────────────────────────────────────────────────
    const col = { item: L, qty: 290, unit: 340, vat: 390, total: 460 };
    const tableTop = doc.y;

    doc.fontSize(9).font("Bold").fillColor("#333333");
    doc.text("Opis",    col.item,  tableTop, { width: 230 });
    doc.text("Kol.",    col.qty,   tableTop, { width: 45,  align: "right" });
    doc.text("Cijena",  col.unit,  tableTop, { width: 45,  align: "right" });
    doc.text("PDV%",    col.vat,   tableTop, { width: 40,  align: "right" });
    doc.text("Ukupno",  col.total, tableTop, { width: 70,  align: "right" });

    doc.moveTo(L, doc.y + 3).lineTo(R, doc.y + 3).strokeColor("#cccccc").stroke();
    doc.moveDown(0.75);

    doc.fontSize(9).font("Regular").fillColor("#000000");
    let grandTotal = 0;

    (lines || []).forEach((line) => {
      const title     = line.title || "—";
      const qty       = line.quantity || 1;
      const unitPrice = Number(line.price) || 0;
      const lineTotal = qty * unitPrice;
      const vatLabel  = line.vatRate != null ? `${line.vatRate}%` : "—";
      grandTotal += lineTotal;

      const rowY = doc.y;
      doc.text(title,                 col.item,  rowY, { width: 230 });
      doc.text(String(qty),           col.qty,   rowY, { width: 45,  align: "right" });
      doc.text(unitPrice.toFixed(2),  col.unit,  rowY, { width: 45,  align: "right" });
      doc.text(vatLabel,              col.vat,   rowY, { width: 40,  align: "right" });
      doc.text(lineTotal.toFixed(2),  col.total, rowY, { width: 70,  align: "right" });
      doc.moveDown(0.6);
    });

    doc.moveTo(L, doc.y + 2).lineTo(R, doc.y + 2).strokeColor("#cccccc").stroke();
    doc.moveDown(0.75);

    // ── VAT summary + totals (right-aligned) ──────────────────────────────
    const vatGroups  = buildVatSummary(lines || []);
    const orderTotal = order.total != null ? Number(order.total) : grandTotal;
    const sumL = 330;
    const sumV = 460;

    doc.fontSize(9).font("Regular").fillColor("#555555");
    for (const g of vatGroups) {
      if (g.rate === 0) {
        doc.text(`Osnovica (0%):`,      sumL, doc.y, { width: 125 });
        doc.text(`${g.osnovica.toFixed(2)} ${currency}`,  sumV, doc.y - doc.currentLineHeight(), { width: 70, align: "right" });
      } else {
        doc.text(`Osnovica (${g.rate}%):`, sumL, doc.y, { width: 125 });
        doc.text(`${g.osnovica.toFixed(2)} ${currency}`,  sumV, doc.y - doc.currentLineHeight(), { width: 70, align: "right" });
        doc.text(`PDV (${g.rate}%):`,      sumL, doc.y, { width: 125 });
        doc.text(`${g.vatAmount.toFixed(2)} ${currency}`, sumV, doc.y - doc.currentLineHeight(), { width: 70, align: "right" });
      }
    }

    doc.moveDown(0.3);
    doc.moveTo(sumL, doc.y).lineTo(R, doc.y).strokeColor("#999999").stroke();
    doc.moveDown(0.3);

    doc.fontSize(12).font("Bold").fillColor("#000000");
    doc.text("UKUPNO:",            sumL, doc.y, { width: 125 });
    doc.text(`${orderTotal.toFixed(2)} ${currency}`, sumV, doc.y - doc.currentLineHeight(), { width: 70, align: "right" });

    doc.moveDown(1.5);

    // ── Payment method + operator OIB ─────────────────────────────────────
    // Reset x to left margin — previous text commands left cursor at sumL (330)
    doc.fontSize(9).font("Regular").fillColor("#333333");

    const pmCode  = fiscal.paymentMethod;
    const pmLabel = pmCode ? (PAYMENT_METHOD_LABELS[pmCode] || pmCode) : null;
    if (pmLabel) {
      doc.text(`Način plaćanja: ${pmLabel}`, L, doc.y, { width: W });
    }
    if (fiscal.operatorOib) {
      doc.text(`Operator OIB: ${fiscal.operatorOib}`, L, doc.y, { width: W });
    }

    doc.moveDown(1);

    // ── Fiscal codes ──────────────────────────────────────────────────────
    if (fiscal.zki || fiscal.jir) {
      doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor("#dddddd").stroke();
      doc.moveDown(0.5);

      doc.fontSize(8).font("Regular").fillColor("#555555");
      if (fiscal.zki) doc.text(`ZKI: ${fiscal.zki}`, L, doc.y, { width: W });
      if (fiscal.jir) {
        doc.text(`JIR: ${fiscal.jir}`, L, doc.y, { width: W });
      } else if (fiscal.zki) {
        doc.text("JIR: fiskalizacija u tijeku...", L, doc.y, { width: W });
      }
      doc.moveDown(0.5);
      doc.fontSize(7).fillColor("#888888")
        .text("Račun izdan sukladno Zakonu o fiskalizaciji u prometu gotovinom (NN 133/12).", L, doc.y, { width: W, align: "center" });
      doc.moveDown(0.75);
    }

    // ── QR code ──────────────────────────────────────────────────────────
    if (qrBuffer) {
      try {
        doc.image(qrBuffer, L, doc.y, { width: 80 });
        doc.moveDown(0.5);
        doc.fontSize(7).fillColor("#888888").text("Skenirajte za provjeru računa", L, doc.y, { width: 80, align: "center" });
      } catch (_) { /* non-fatal */ }
      doc.moveDown(1);
    }

    // ── Footer ────────────────────────────────────────────────────────────
    doc.fontSize(9).font("Regular").fillColor("#888888")
      .text("Hvala na vašoj narudžbi.", L, doc.y, { width: W, align: "center" });
    if (isR1) {
      doc.text("Ovaj dokument je R1 račun izdan sukladno važećim poreznim propisima.", L, doc.y, { width: W, align: "center" });
    }

    doc.end();
  });
}

// ─── Core invoice creation ────────────────────────────────────────────────────

/**
 * Generate and store an invoice for an order (DB record + initial PDF).
 * Does NOT run fiscalisation — caller must commit the transaction first,
 * then call fiscalizeAndUpdatePdf() separately.
 *
 * Operation order:
 *   1. Compute accounting snapshot (total, vatTotal, paymentMethod)
 *   2. Allocate sequence number atomically (within transaction)
 *   3. Generate initial PDF (no fiscal codes yet)
 *   4. Insert Invoice record (within transaction)
 *   5. Write PDF to disk (atomic tmp+rename)
 *   6. Return — caller commits transaction, then calls fiscalizeAndUpdatePdf()
 *
 * Failure contract:
 *   Steps 1–5 fail → exception propagates; caller rolls back; clean state.
 *   Fiscalisation is handled outside this function after the commit.
 *
 * @param {object}   order
 * @param {object[]} lines - [{title, quantity, price, vatRate}]
 * @param {object}   t     - Sequelize transaction (caller commits/rolls back)
 * @returns {Promise<{ invoice: object, pdfBuffer: Buffer }>}
 */
async function createInvoiceForOrder(order, lines, t) {
  const type = order.personType === "legal" ? "r1" : "receipt";
  const year = new Date(order.createdAt || Date.now()).getFullYear();

  logger.info("Invoice generation: started", { orderId: order.id, type, year });

  // ── Accounting snapshot ───────────────────────────────────────────────────
  const vatGroups    = buildVatSummary(lines);
  const total        = lines.reduce((sum, l) => sum + Number(l.price) * (l.quantity || 1), 0);
  const vatTotal     = vatGroups.reduce((sum, g) => sum + g.vatAmount, 0);
  const paymentMethod = order.stripePaymentIntentId ? "K" : "O";

  const fiscalConfig = getFiscalizationConfig();
  const premisesId   = fiscalConfig.businessPremisesId || "MAIN";
  const deviceId     = fiscalConfig.deviceId || "1";

  const { invoiceNumber, sequenceNumber } = await generateNextInvoiceNumber(year, premisesId, deviceId, t);

  const invoiceDate = new Date();

  // Initial PDF — no fiscal codes yet (regenerated after fiscalisation)
  const pdfBuffer = await generatePdfBuffer(order, lines, invoiceNumber, type, { paymentMethod, invoiceDate });

  // Slashes in invoiceNumber (e.g. "7/WEB/1") are not valid in filenames — replace with dashes
  const filename     = `${invoiceNumber.replace(/\//g, "-")}.pdf`;
  const relativePath = `${INVOICE_SUBDIR}/${filename}`;

  const invoice = await invoiceRepo.create(
    {
      orderId: order.id,
      invoiceNumber,
      type,
      sequenceNumber,
      year,
      premisesId,
      deviceId,
      total:             parseFloat(total.toFixed(2)),
      vatTotal:          parseFloat(vatTotal.toFixed(2)),
      paymentMethod,
      pdfPath:           relativePath,
      generatedAt:       new Date(),
      fiscalizationStatus: "pending",
    },
    { transaction: t }
  );

  const finalPath = path.join(INVOICE_DIR, filename);
  const tmpPath   = `${finalPath}.tmp`;

  await fs.promises.mkdir(INVOICE_DIR, { recursive: true });

  try {
    await fs.promises.writeFile(tmpPath, pdfBuffer);
    await fs.promises.rename(tmpPath, finalPath);
  } catch (writeErr) {
    try { await fs.promises.unlink(tmpPath); } catch (_) { /* ignore */ }
    throw writeErr;
  }

  logger.info("Invoice PDF written to disk", { invoiceNumber, pdfPath: relativePath });
  logger.info("Invoice generation: completed (pre-fiscal)", { invoiceNumber, orderId: order.id, type });

  return { invoice, pdfBuffer };
}

/**
 * Run fiscalisation for an already-committed invoice, then regenerate the PDF
 * on disk with ZKI + JIR if the submission succeeds.
 *
 * Call this AFTER the invoice transaction has been committed.
 * Safe to call from multiple places (payment webhook, free-order flow, admin retry).
 *
 * @param {object}   invoice - Plain invoice object from DB (post-commit)
 * @param {object}   order
 * @param {object[]} lines   - [{title, quantity, price, vatRate}]
 * @returns {Promise<{ fiskalResult: object|null, pdfBuffer: Buffer|null }>}
 *   pdfBuffer is the regenerated fiscal PDF on success, null otherwise.
 */
async function fiscalizeAndUpdatePdf(invoice, order, lines) {
  const fiscalizationService = require("./fiscalization.service");

  let fiskalResult = null;
  try {
    fiskalResult = await fiscalizationService.fiscalizeInvoice(invoice, order, lines);
  } catch (fiskalErr) {
    logger.error("Invoice fiscalisation threw unexpectedly", {
      tag:          "fiscalization_error",
      invoiceId:    invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      error:        fiskalErr.message,
    });
    return { fiskalResult: null, pdfBuffer: null };
  }

  if (!fiskalResult || (!fiskalResult.zkiCode && !fiskalResult.jir)) {
    return { fiskalResult, pdfBuffer: null };
  }

  // ── Regenerate PDF with ZKI + JIR ─────────────────────────────────────────
  const isStorno = !!invoice.stornoOfInvoiceId;
  const fiscalOpts = {
    zki:                 fiskalResult.zkiCode,
    jir:                 fiskalResult.jir,
    fiscalInvoiceNumber: fiskalResult.fiscalInvoiceNumber,
    operatorOib:         fiskalResult.operatorOib,
    paymentMethod:       invoice.paymentMethod,
    invoiceDate:         new Date(invoice.generatedAt),
    isStorno,
  };
  if (isStorno && fiskalResult.originalInvoiceNumber) {
    fiscalOpts.originalInvoiceNumber = fiskalResult.originalInvoiceNumber;
  }

  try {
    const fiscalPdfBuffer = await generatePdfBuffer(order, lines, invoice.invoiceNumber, invoice.type, fiscalOpts);
    // Derive the write path from the stored pdfPath rather than recomputing the
    // filename — storno PDFs use a "-storno" suffix that must be preserved.
    const finalPath = invoice.pdfPath
      ? resolvePdfPath(invoice.pdfPath)
      : path.join(INVOICE_DIR, `${invoice.invoiceNumber.replace(/\//g, "-")}.pdf`);
    const tmpPath   = `${finalPath}.tmp`;
    await fs.promises.writeFile(tmpPath, fiscalPdfBuffer);
    await fs.promises.rename(tmpPath, finalPath);
    logger.info("Invoice PDF regenerated with fiscal codes", { invoiceNumber: invoice.invoiceNumber });
    return { fiskalResult, pdfBuffer: fiscalPdfBuffer };
  } catch (pdfErr) {
    logger.warn("Invoice PDF regeneration with fiscal codes failed (original PDF kept)", {
      invoiceNumber: invoice.invoiceNumber, error: pdfErr.message,
    });
    return { fiskalResult, pdfBuffer: null };
  }
}

// ─── Storno invoice creation ──────────────────────────────────────────────────

/**
 * Create a storno (cancellation) invoice for an already-committed original invoice.
 *
 * Must be called inside an open Sequelize transaction. The caller commits after
 * this returns, then calls fiscalizeAndUpdatePdf() outside the transaction.
 *
 * Operation order:
 *   1. Validate: original not already voided, no storno already exists
 *   2. Allocate a new sequence number (same counter as originals — correct per law)
 *   3. Generate initial storno PDF (no fiscal codes yet)
 *   4. Insert storno Invoice record (stornoOfInvoiceId → original.id, negative totals)
 *   5. Mark original invoice status → 'voided' and set its stornoInvoiceId pointer
 *   6. Write PDF to disk atomically
 *
 * @param {object}   originalInvoice - Plain invoice object from DB (committed)
 * @param {object}   order           - Plain order object
 * @param {object[]} lines           - Original order lines [{title, quantity, price, vatRate}]
 * @param {object}   t               - Sequelize transaction (caller commits/rolls back)
 * @returns {Promise<{ stornoInvoice: object, pdfBuffer: Buffer }>}
 */
async function createStornoInvoiceForRefund(originalInvoice, order, lines, t) {
  if (originalInvoice.status === "voided") {
    throw new Error(`Invoice ${originalInvoice.invoiceNumber} is already voided; cannot create storno.`);
  }
  if (originalInvoice.stornoInvoiceId) {
    throw new Error(`Invoice ${originalInvoice.invoiceNumber} already has a storno invoice.`);
  }

  const year       = new Date(originalInvoice.generatedAt || Date.now()).getFullYear();
  const premisesId = originalInvoice.premisesId || getFiscalizationConfig().businessPremisesId || "MAIN";
  const deviceId   = originalInvoice.deviceId   || getFiscalizationConfig().deviceId || "1";

  logger.info("Storno invoice creation: started", {
    originalInvoiceId:     originalInvoice.id,
    originalInvoiceNumber: originalInvoice.invoiceNumber,
  });

  const { invoiceNumber, sequenceNumber } = await generateNextInvoiceNumber(year, premisesId, deviceId, t);

  // Storno totals are the negatives of the original
  const total    = -(Number(originalInvoice.total)    || 0);
  const vatTotal = -(Number(originalInvoice.vatTotal) || 0);

  const invoiceDate = new Date();

  // Negate line prices so the PDF and fiscal XML reflect the correct negative amounts.
  const stornoLines = lines.map((l) => ({
    ...l,
    price: -(Number(l.price) || 0),
  }));

  const pdfBuffer = await generatePdfBuffer(order, stornoLines, invoiceNumber, originalInvoice.type, {
    paymentMethod:          originalInvoice.paymentMethod,
    invoiceDate,
    isStorno:               true,
    originalInvoiceNumber:  originalInvoice.invoiceNumber,
  });

  const filename     = `${invoiceNumber.replace(/\//g, "-")}-storno.pdf`;
  const relativePath = `${INVOICE_SUBDIR}/${filename}`;

  const stornoInvoice = await invoiceRepo.create(
    {
      orderId:             originalInvoice.orderId,
      stornoOfInvoiceId:   originalInvoice.id,
      invoiceNumber,
      type:                originalInvoice.type,
      sequenceNumber,
      year,
      premisesId,
      deviceId,
      total:               parseFloat(total.toFixed(2)),
      vatTotal:            parseFloat(vatTotal.toFixed(2)),
      paymentMethod:       originalInvoice.paymentMethod,
      pdfPath:             relativePath,
      generatedAt:         invoiceDate,
      fiscalizationStatus: "pending",
    },
    { transaction: t }
  );

  // Mark the original invoice as voided and record the reverse pointer.
  // updateFiscalFields uses Model.update (bulk) which bypasses the immutability
  // hook — this is intentional: status and stornoInvoiceId are mutable fields.
  await invoiceRepo.updateFiscalFields(originalInvoice.id, {
    status:          "voided",
    stornoInvoiceId: stornoInvoice.id,
  }, t);

  const finalPath = path.join(INVOICE_DIR, filename);
  const tmpPath   = `${finalPath}.tmp`;

  await fs.promises.mkdir(INVOICE_DIR, { recursive: true });
  try {
    await fs.promises.writeFile(tmpPath, pdfBuffer);
    await fs.promises.rename(tmpPath, finalPath);
  } catch (writeErr) {
    try { await fs.promises.unlink(tmpPath); } catch (_) { /* ignore */ }
    throw writeErr;
  }

  logger.info("Storno invoice created (pre-fiscal)", {
    invoiceNumber,
    originalInvoiceNumber: originalInvoice.invoiceNumber,
    orderId: originalInvoice.orderId,
  });

  return { stornoInvoice, pdfBuffer };
}

// ─── Query helpers ────────────────────────────────────────────────────────────

async function getInvoiceForOrder(orderId) {
  // Explicitly exclude storno invoices — only the original invoice per order.
  return await invoiceRepo.findOne({ orderId, stornoOfInvoiceId: null });
}

async function getStornoInvoiceForOrder(orderId) {
  const { Op } = require("sequelize");
  return await invoiceRepo.findOne({ orderId, stornoOfInvoiceId: { [Op.ne]: null } });
}

async function readInvoicePdf(invoice) {
  if (!invoice || !invoice.pdfPath) return null;
  const absolutePath = resolvePdfPath(invoice.pdfPath);
  try {
    return await fs.promises.readFile(absolutePath);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function listInvoices(filters = {}) {
  const where = {};
  if (filters.type && ["receipt", "r1"].includes(filters.type)) {
    where.type = filters.type;
  }
  if (filters.status && ["issued", "voided"].includes(filters.status)) {
    where.status = filters.status;
  }
  if (filters.year && Number.isInteger(Number(filters.year))) {
    where.year = Number(filters.year);
  }
  if (filters.fiscalizationStatus && ["pending", "fiscalized", "failed", "not_required"].includes(filters.fiscalizationStatus)) {
    where.fiscalizationStatus = filters.fiscalizationStatus;
  }
  return await invoiceRepo.findAll(where);
}

async function getInvoiceById(id) {
  return await invoiceRepo.findById(id);
}

module.exports = {
  createInvoiceForOrder,
  createStornoInvoiceForRefund,
  fiscalizeAndUpdatePdf,
  getInvoiceById,
  getInvoiceForOrder,
  getStornoInvoiceForOrder,
  listInvoices,
  readInvoicePdf,
  resolvePdfPath,
  generatePdfBuffer,
};
