/**
 * Invoice service — PDF generation and invoice record management.
 * Generates regular receipts (private persons) and R1 receipts (legal persons / companies).
 * Integrates with fiscalization.service.js for Croatian fiscalisation (ZKI + JIR).
 */
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const invoiceRepo = require("../repos/invoice.repo");
const { sequelize } = require("../db");
const logger = require("../config/logger");

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
 * Generate the next invoice number for a given type and year using an atomic
 * counter row in invoice_sequences.
 *
 * @param {"receipt"|"r1"} type
 * @param {number} year
 * @param {object} t - Sequelize transaction (must be open)
 * @returns {Promise<{ invoiceNumber: string, sequenceNumber: number }>}
 */
async function generateNextInvoiceNumber(type, year, t) {
  const now = new Date().toISOString();

  const [rows] = await sequelize.query(
    `INSERT INTO invoice_sequences (type, year, lastValue, createdAt, updatedAt)
     VALUES (:type, :year, 1, :now, :now)
     ON CONFLICT(type, year)
     DO UPDATE SET lastValue = invoice_sequences.lastValue + 1, updatedAt = :now
     RETURNING lastValue`,
    { replacements: { type, year, now }, transaction: t }
  );

  const sequenceNumber = rows[0].lastValue;
  const prefix = type === "r1" ? "R1" : "INV";
  const padded = String(sequenceNumber).padStart(6, "0");
  const invoiceNumber = `${prefix}-${year}-${padded}`;

  logger.info("Invoice sequence allocated", { type, year, sequenceNumber, invoiceNumber });

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
      const divisor   = 1 + rate / 100;
      const osnovica  = gross / divisor;
      const vatAmount = gross - osnovica;
      return { rate, osnovica, vatAmount, gross };
    });
}

// ─── PDF generation ───────────────────────────────────────────────────────────

/**
 * Build a PDF receipt/R1 buffer using pdfkit.
 * Includes VAT breakdown and optional ZKI / JIR fiscalisation codes.
 *
 * @param {object}   order
 * @param {object[]} lines         - [{title, quantity, price, vatRate}]
 * @param {string}   invoiceNumber - Human-readable invoice number (e.g. "R1-2026-000001")
 * @param {"receipt"|"r1"} type
 * @param {object}   [fiscal]      - Optional { zki, jir, fiscalInvoiceNumber }
 * @returns {Promise<Buffer>}
 */
function generatePdfBuffer(order, lines, invoiceNumber, type, fiscal = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 50 });

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const isR1     = type === "r1";
    const currency = order.currency || "EUR";
    const date     = order.createdAt
      ? new Date(order.createdAt).toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit", year: "numeric" })
      : new Date().toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit", year: "numeric" });

    // ── Header ─────────────────────────────────────────────────────────────
    doc.fontSize(20).font("Helvetica-Bold").text(isR1 ? "R1 Račun" : "Potvrda o plaćanju", { align: "left" });
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica").fillColor("#555555");
    doc.text(`Broj: ${invoiceNumber}`);
    if (fiscal.fiscalInvoiceNumber) {
      doc.text(`Fiskalni broj: ${fiscal.fiscalInvoiceNumber}`);
    }
    doc.text(`Datum: ${date}`);
    doc.moveDown(1);

    // ── Buyer info ──────────────────────────────────────────────────────────
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#000000").text("Kupac:");
    doc.fontSize(10).font("Helvetica");

    const name = [order.forename, order.surname].filter(Boolean).join(" ") || order.email || "—";
    doc.text(name);
    if (order.email) doc.text(order.email);

    if (isR1) {
      doc.moveDown(0.25);
      doc.text(`Naziv tvrtke: ${order.companyName || "—"}`);
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

    // ── Line items table ────────────────────────────────────────────────────
    doc.fontSize(11).font("Helvetica-Bold").text("Stavke:");
    doc.moveDown(0.5);

    const colX     = { item: 50, qty: 260, unit: 320, vat: 370, total: 440 };
    const tableTop = doc.y;

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#333333");
    doc.text("Opis",   colX.item,  tableTop);
    doc.text("Kol.",   colX.qty,   tableTop, { width: 50, align: "right" });
    doc.text("Cijena", colX.unit,  tableTop, { width: 45, align: "right" });
    doc.text("PDV%",   colX.vat,   tableTop, { width: 40, align: "right" });
    doc.text("Ukupno", colX.total, tableTop, { width: 70, align: "right" });

    doc.moveTo(50, doc.y + 4).lineTo(520, doc.y + 4).strokeColor("#cccccc").stroke();
    doc.moveDown(0.75);

    doc.fontSize(9).font("Helvetica").fillColor("#000000");
    let grandTotal = 0;

    (lines || []).forEach((line) => {
      const title     = line.title || "—";
      const qty       = line.quantity || 1;
      const unitPrice = Number(line.price) || 0;
      const lineTotal = qty * unitPrice;
      const vat       = line.vatRate != null ? `${line.vatRate}%` : "—";
      grandTotal += lineTotal;

      const rowY = doc.y;
      doc.text(title,                colX.item,  rowY, { width: 200 });
      doc.text(String(qty),          colX.qty,   rowY, { width: 50,  align: "right" });
      doc.text(unitPrice.toFixed(2), colX.unit,  rowY, { width: 45,  align: "right" });
      doc.text(vat,                  colX.vat,   rowY, { width: 40,  align: "right" });
      doc.text(lineTotal.toFixed(2), colX.total, rowY, { width: 70,  align: "right" });
      doc.moveDown(0.5);
    });

    doc.moveTo(50, doc.y + 2).lineTo(520, doc.y + 2).strokeColor("#cccccc").stroke();
    doc.moveDown(0.75);

    // ── VAT summary ─────────────────────────────────────────────────────────
    const vatGroups  = buildVatSummary(lines || []);
    const orderTotal = order.total != null ? Number(order.total) : grandTotal;

    if (vatGroups.length > 0) {
      const summaryX = { label: 310, value: 440 };
      doc.fontSize(9).font("Helvetica").fillColor("#333333");

      for (const g of vatGroups) {
        if (g.rate === 0) {
          doc.text(`Osnovica (0%):`, summaryX.label, doc.y, { width: 125 });
          doc.text(`${g.osnovica.toFixed(2)} ${currency}`, summaryX.value, doc.y - doc.currentLineHeight(), { width: 70, align: "right" });
        } else {
          doc.text(`Osnovica (${g.rate}%):`, summaryX.label, doc.y, { width: 125 });
          doc.text(`${g.osnovica.toFixed(2)} ${currency}`, summaryX.value, doc.y - doc.currentLineHeight(), { width: 70, align: "right" });
          doc.text(`PDV (${g.rate}%):`,      summaryX.label, doc.y, { width: 125 });
          doc.text(`${g.vatAmount.toFixed(2)} ${currency}`, summaryX.value, doc.y - doc.currentLineHeight(), { width: 70, align: "right" });
        }
      }

      doc.moveDown(0.25);
      doc.moveTo(310, doc.y).lineTo(520, doc.y).strokeColor("#cccccc").stroke();
      doc.moveDown(0.25);
    }

    // ── Grand total ─────────────────────────────────────────────────────────
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#000000");
    doc.text("Ukupno za platiti:", 310, doc.y, { width: 125 });
    doc.text(`${orderTotal.toFixed(2)} ${currency}`, 440, doc.y - doc.currentLineHeight(), { width: 70, align: "right" });

    doc.moveDown(2);

    // ── Fiscalisation footer ────────────────────────────────────────────────
    doc.fontSize(8).font("Helvetica").fillColor("#888888");

    if (fiscal.zki) {
      doc.text(`ZKI: ${fiscal.zki}`, { align: "left" });
    }
    if (fiscal.jir) {
      doc.text(`JIR: ${fiscal.jir}`, { align: "left" });
    } else if (fiscal.zki) {
      doc.text("JIR: fiskalizacija u tijeku...", { align: "left" });
    }

    doc.moveDown(0.5);
    doc.text("Hvala na vašoj narudžbi.", { align: "center" });
    if (isR1) {
      doc.text("Ovaj dokument je R1 račun izdan sukladno važećim poreznim propisima.", { align: "center" });
    }
    if (fiscal.zki) {
      doc.text("Račun izdan sukladno Zakonu o fiskalizaciji u prometu gotovinom (NN 133/12).", { align: "center" });
    }

    doc.end();
  });
}

// ─── Core invoice creation ────────────────────────────────────────────────────

/**
 * Generate and store an invoice for an order, then trigger fiscalisation.
 *
 * Operation order:
 *   1. Allocate sequence number atomically (within transaction)
 *   2. Generate initial PDF (no fiscal codes yet)
 *   3. Insert Invoice record (within transaction)
 *   4. Write PDF to disk (atomic tmp+rename)
 *   5. Commit transaction (caller's responsibility)
 *   6. Run fiscalisation outside transaction (network call)
 *   7. If fiscalisation returns codes: regenerate PDF and overwrite on disk
 *
 * Failure contract:
 *   Steps 1–4 fail → exception propagates; caller rolls back; clean state.
 *   Fiscalisation fails → invoice stays on disk, status="failed"; admin can retry.
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

  const { invoiceNumber, sequenceNumber } = await generateNextInvoiceNumber(type, year, t);

  // Initial PDF — no fiscal codes yet (regenerated after fiscalisation)
  const pdfBuffer = await generatePdfBuffer(order, lines, invoiceNumber, type, {});

  const filename     = `${invoiceNumber}.pdf`;
  const relativePath = `${INVOICE_SUBDIR}/${filename}`;

  const invoice = await invoiceRepo.create(
    {
      orderId: order.id,
      invoiceNumber,
      type,
      sequenceNumber,
      year,
      pdfPath: relativePath,
      generatedAt: new Date(),
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

  const invoicePlain = invoice; // invoiceRepo.create already returns a plain object

  // ── Fiscalisation (outside DB transaction — network call) ─────────────────
  let fiskalResult = null;
  try {
    const fiscalizationService = require("./fiscalization.service");
    fiskalResult = await fiscalizationService.fiscalizeInvoice(invoicePlain, order, lines);
  } catch (fiskalErr) {
    logger.error("Invoice fiscalisation threw unexpectedly", {
      tag:          "fiscalization_error",
      invoiceId:    invoicePlain.id,
      invoiceNumber,
      error:        fiskalErr.message,
    });
  }

  // ── Regenerate PDF with ZKI + JIR if we have fiscal codes ────────────────
  if (fiskalResult && (fiskalResult.zkiCode || fiskalResult.jir)) {
    try {
      const fiscalPdfBuffer = await generatePdfBuffer(order, lines, invoiceNumber, type, {
        zki:                fiskalResult.zkiCode,
        jir:                fiskalResult.jir,
        fiscalInvoiceNumber: fiskalResult.fiscalInvoiceNumber,
      });
      await fs.promises.writeFile(tmpPath, fiscalPdfBuffer);
      await fs.promises.rename(tmpPath, finalPath);
      logger.info("Invoice PDF regenerated with fiscal codes", { invoiceNumber });
      logger.info("Invoice generation: completed", { invoiceNumber, orderId: order.id, type });
      return { invoice: invoicePlain, pdfBuffer: fiscalPdfBuffer };
    } catch (pdfErr) {
      logger.warn("Invoice PDF regeneration with fiscal codes failed (original PDF kept)", {
        invoiceNumber, error: pdfErr.message,
      });
    }
  }

  logger.info("Invoice generation: completed", { invoiceNumber, orderId: order.id, type });
  return { invoice: invoicePlain, pdfBuffer };
}

// ─── Query helpers ────────────────────────────────────────────────────────────

async function getInvoiceForOrder(orderId) {
  return await invoiceRepo.findOne({ orderId });
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
  getInvoiceById,
  getInvoiceForOrder,
  listInvoices,
  readInvoicePdf,
  resolvePdfPath,
  generatePdfBuffer,
};
