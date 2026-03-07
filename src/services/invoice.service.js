/**
 * Invoice service — PDF generation and invoice record management.
 * Generates regular receipts (private persons) and R1 receipts (legal persons / companies).
 */
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const { Invoice } = require("../models");
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
 * A single INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING statement is used
 * so the increment and the read happen in one atomic step.  This eliminates the
 * TOCTOU window that existed when a separate SELECT followed the upsert.
 * SQLite supports RETURNING since 3.35 (2021); the query is also valid on
 * PostgreSQL should the database ever be migrated.
 *
 * @param {"receipt"|"r1"} type
 * @param {number} year
 * @param {object} t - Sequelize transaction (must be open)
 * @returns {Promise<{ invoiceNumber: string, sequenceNumber: number }>}
 */
async function generateNextInvoiceNumber(type, year, t) {
  const now = new Date().toISOString();

  // Single atomic statement: upsert the counter row and return the new value.
  // RETURNING removes the need for a second SELECT, closing the window where
  // another writer could change lastValue between the two queries.
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

/**
 * Build a PDF receipt/R1 buffer using pdfkit.
 *
 * @param {object} order - Plain order object (with personType, companyName, companyOib, etc.)
 * @param {object[]} lines - Order lines (each with .title, .quantity, .price)
 * @param {string} invoiceNumber
 * @param {"receipt"|"r1"} type
 * @returns {Promise<Buffer>}
 */
function generatePdfBuffer(order, lines, invoiceNumber, type) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 50 });

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const isR1 = type === "r1";
    const currency = order.currency || "USD";
    const date = order.createdAt
      ? new Date(order.createdAt).toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit", year: "numeric" })
      : new Date().toLocaleDateString("hr-HR", { day: "2-digit", month: "2-digit", year: "numeric" });

    // ── Header ─────────────────────────────────────────────────────────────
    doc.fontSize(20).font("Helvetica-Bold").text(isR1 ? "R1 Račun" : "Potvrda o plaćanju", { align: "left" });
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica").fillColor("#555555");
    doc.text(`Broj: ${invoiceNumber}`);
    doc.text(`Datum: ${date}`);
    doc.moveDown(1);

    // ── Buyer info ──────────────────────────────────────────────────────────
    doc.fontSize(11).font("Helvetica-Bold").fillColor("#000000").text("Kupac:", { underline: false });
    doc.fontSize(10).font("Helvetica");

    const name = [order.forename, order.surname].filter(Boolean).join(" ") || order.email || "—";
    doc.text(name);
    if (order.email) doc.text(order.email);

    if (isR1) {
      doc.moveDown(0.25);
      doc.text(`Naziv tvrtke: ${order.companyName || "—"}`);
      doc.text(`OIB: ${order.companyOib || "—"}`);
    }

    // Billing address
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

    const colX = { item: 50, qty: 310, unit: 370, total: 440 };
    const tableTop = doc.y;

    // Table header
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#333333");
    doc.text("Opis", colX.item, tableTop);
    doc.text("Kol.", colX.qty, tableTop, { width: 50, align: "right" });
    doc.text("Cijena", colX.unit, tableTop, { width: 60, align: "right" });
    doc.text("Ukupno", colX.total, tableTop, { width: 70, align: "right" });

    doc.moveTo(50, doc.y + 4).lineTo(520, doc.y + 4).strokeColor("#cccccc").stroke();
    doc.moveDown(0.75);

    // Table rows
    doc.fontSize(9).font("Helvetica").fillColor("#000000");
    let grandTotal = 0;

    (lines || []).forEach((line) => {
      const title = line.title || "—";
      const qty = line.quantity || 1;
      const unitPrice = Number(line.price) || 0;
      const lineTotal = qty * unitPrice;
      grandTotal += lineTotal;

      const rowY = doc.y;
      doc.text(title, colX.item, rowY, { width: 250 });
      doc.text(String(qty), colX.qty, rowY, { width: 50, align: "right" });
      doc.text(unitPrice.toFixed(2), colX.unit, rowY, { width: 60, align: "right" });
      doc.text(lineTotal.toFixed(2), colX.total, rowY, { width: 70, align: "right" });
      doc.moveDown(0.5);
    });

    doc.moveTo(50, doc.y + 2).lineTo(520, doc.y + 2).strokeColor("#cccccc").stroke();
    doc.moveDown(0.75);

    // Total row
    const orderTotal = order.total != null ? Number(order.total) : grandTotal;
    doc.fontSize(11).font("Helvetica-Bold");
    doc.text("Ukupno:", colX.unit, doc.y, { width: 60, align: "right" });
    doc.text(`${orderTotal.toFixed(2)} ${currency}`, colX.total, doc.y - doc.currentLineHeight(), { width: 70, align: "right" });

    doc.moveDown(2);

    // ── Footer ──────────────────────────────────────────────────────────────
    doc.fontSize(8).font("Helvetica").fillColor("#888888");
    doc.text("Hvala na vašoj narudžbi.", { align: "center" });
    if (isR1) {
      doc.text("Ovaj dokument je R1 račun izdan sukladno važećim poreznim propisima.", { align: "center" });
    }

    doc.end();
  });
}

/**
 * Generate and store an invoice for an order.
 *
 * Operation order (critical for consistency):
 *   1. Allocate sequence number atomically (within transaction)
 *   2. Generate PDF buffer (pure computation, no side effects)
 *   3. Insert Invoice record into DB (within transaction)
 *   4. Write PDF to disk via tmp+rename (after DB record exists, before commit)
 *
 * Failure contract:
 *   Step 3 fails  → no disk write; transaction rolls back; clean state.
 *   Step 4 fails  → exception propagates; caller rolls back transaction;
 *                   DB record removed; only an orphaned .tmp file may remain
 *                   on disk (no DB pointer to it, cleaned up in the catch).
 *
 * @param {object} order - Plain order object
 * @param {object[]} lines - Order lines
 * @param {object} t - Sequelize transaction (must be open, caller commits/rolls back)
 * @returns {Promise<{ invoice: object, pdfBuffer: Buffer }>}
 */
async function createInvoiceForOrder(order, lines, t) {
  const type = order.personType === "legal" ? "r1" : "receipt";
  const year = new Date(order.createdAt || Date.now()).getFullYear();

  logger.info("Invoice generation: started", { orderId: order.id, type, year });

  const { invoiceNumber, sequenceNumber } = await generateNextInvoiceNumber(type, year, t);

  const pdfBuffer = await generatePdfBuffer(order, lines, invoiceNumber, type);

  const filename = `${invoiceNumber}.pdf`;
  // Store a relative path so the value survives directory moves.
  const relativePath = `${INVOICE_SUBDIR}/${filename}`;

  // Step 3: insert DB record first — if this fails, no disk write happens.
  const invoice = await Invoice.create(
    {
      orderId: order.id,
      invoiceNumber,
      type,
      sequenceNumber,
      year,
      pdfPath: relativePath,
      generatedAt: new Date(),
    },
    { transaction: t }
  );

  // Step 4: write PDF to disk only after the DB record is safely within the
  // transaction. If the write throws, the exception propagates to the caller
  // which will roll back the transaction, removing the DB record.
  //
  // Write to a .tmp file first then rename atomically. This ensures that a
  // crash or error mid-write never leaves a partial (corrupt) file at the path
  // stored in the DB — the final filename only appears once the write is complete.
  const finalPath = path.join(INVOICE_DIR, filename);
  const tmpPath = `${finalPath}.tmp`;

  await fs.promises.mkdir(INVOICE_DIR, { recursive: true });

  try {
    await fs.promises.writeFile(tmpPath, pdfBuffer);
    await fs.promises.rename(tmpPath, finalPath);
  } catch (writeErr) {
    // Best-effort cleanup of the orphaned temp file.
    try { await fs.promises.unlink(tmpPath); } catch (_) { /* ignore */ }
    throw writeErr;
  }

  logger.info("Invoice PDF written to disk", { invoiceNumber, pdfPath: relativePath });
  logger.info("Invoice generation: completed", { invoiceNumber, orderId: order.id, type });

  return { invoice: invoice.get({ plain: true }), pdfBuffer };
}

/**
 * Get the invoice record for an order, or null if none exists.
 *
 * @param {string} orderId
 * @returns {Promise<object|null>}
 */
async function getInvoiceForOrder(orderId) {
  const invoice = await Invoice.findOne({ where: { orderId } });
  return invoice ? invoice.get({ plain: true }) : null;
}

/**
 * Read a stored invoice PDF from disk and return it as a Buffer.
 * Returns null if the invoice has no pdfPath or the file does not exist.
 *
 * @param {object} invoice - Plain invoice object with pdfPath
 * @returns {Buffer|null}
 */
function readInvoicePdf(invoice) {
  if (!invoice || !invoice.pdfPath) return null;
  const absolutePath = resolvePdfPath(invoice.pdfPath);
  if (!fs.existsSync(absolutePath)) return null;
  return fs.readFileSync(absolutePath);
}

module.exports = {
  createInvoiceForOrder,
  getInvoiceForOrder,
  readInvoicePdf,
  resolvePdfPath,
};
