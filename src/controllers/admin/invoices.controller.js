const { sequelize } = require("../../db");
const orderRepo = require("../../repos/order.repo");
const invoiceService = require("../../services/invoice.service");
const fiscalizationService = require("../../services/fiscalization.service");
const emailService = require("../../services/email.service");
const logger = require("../../config/logger");
const { PAYMENT_STATUS } = require("../../constants/order");

/**
 * POST /admin/orders/:id/regenerate-invoice
 *
 * Generates a missing invoice for a PAID order that has no invoice record.
 * Optionally resends the confirmation email with the PDF attached.
 *
 * Body params (optional):
 *   resend {boolean} — if truthy, resend the confirmation email after generating
 *
 * Returns JSON so it can be called from the admin UI or curl.
 */
async function regenerateInvoice(req, res) {
  const { id: orderId } = req.params;

  const editUrl = (req.adminPrefix || "") + "/orders/" + orderId + "/edit";

  const order = await orderRepo.findById(orderId);
  if (!order) {
    if (req.accepts("html")) {
      res.setFlash("error", "Order not found.");
      return res.redirect((req.adminPrefix || "") + "/orders");
    }
    return res.status(404).json({ error: "Order not found." });
  }

  if (order.paymentStatus !== PAYMENT_STATUS.PAID) {
    if (req.accepts("html")) {
      res.setFlash("error", "Invoice can only be generated for paid orders.");
      return res.redirect(editUrl);
    }
    return res.status(400).json({ error: "Invoice can only be generated for paid orders." });
  }

  const existing = await invoiceService.getInvoiceForOrder(orderId);
  if (existing) {
    if (req.accepts("html")) {
      res.setFlash("info", `Invoice ${existing.invoiceNumber} already exists for this order.`);
      return res.redirect(editUrl);
    }
    return res.status(409).json({
      error: "Invoice already exists for this order.",
      invoiceNumber: existing.invoiceNumber,
    });
  }

  const lines = await orderRepo.getLines(orderId);
  const orderPlain = order.get ? order.get({ plain: true }) : order;
  const linesPlain = (lines || []).map((l) => ({ title: l.title, quantity: l.quantity, price: l.price, vatRate: l.vatRate != null ? Number(l.vatRate) : null }));

  let invoice;
  let pdfBuffer;

  const t = await sequelize.transaction();
  try {
    ({ invoice, pdfBuffer } = await invoiceService.createInvoiceForOrder(orderPlain, linesPlain, t));
    await t.commit();
  } catch (err) {
    await t.rollback();
    logger.error("Admin: invoice regeneration failed", { orderId, error: err.message });
    if (req.accepts("html")) {
      res.setFlash("error", "Invoice generation failed.");
      return res.redirect(editUrl);
    }
    return res.status(500).json({ error: "Invoice generation failed.", detail: err.message });
  }

  logger.info("Admin: invoice regenerated", { orderId, invoiceNumber: invoice.invoiceNumber });

  const shouldResend = req.body && (req.body.resend === true || req.body.resend === "true");
  if (shouldResend && emailService.isMailConfigured && emailService.isMailConfigured()) {
    try {
      await emailService.sendOrderConfirmationEmail(orderPlain, linesPlain, pdfBuffer, invoice.invoiceNumber);
    } catch (emailErr) {
      logger.warn("Admin: invoice regenerated but confirmation email failed", {
        orderId,
        invoiceNumber: invoice.invoiceNumber,
        error: emailErr.message,
      });
      if (req.accepts("html")) {
        res.setFlash("warning", `Invoice ${invoice.invoiceNumber} created but email delivery failed.`);
        return res.redirect((req.adminPrefix || "") + "/orders/" + orderId + "/edit");
      }
      return res.status(200).json({
        invoiceNumber: invoice.invoiceNumber,
        warning: "Invoice created but email delivery failed.",
      });
    }
  }

  if (req.accepts("html")) {
    res.setFlash("success", `Invoice ${invoice.invoiceNumber} generated.`);
    return res.redirect((req.adminPrefix || "") + "/orders/" + orderId + "/edit");
  }
  return res.status(200).json({ invoiceNumber: invoice.invoiceNumber });
}

/**
 * POST /admin/invoices/:id/fiscalize
 *
 * Manually trigger (or re-trigger) fiscalisation for an invoice whose
 * fiscalizationStatus is "pending" or "failed".
 * Regenerates the PDF with ZKI + JIR on success.
 */
async function retryFiscalization(req, res) {
  const { id: invoiceId } = req.params;
  const invoicesUrl = (req.adminPrefix || "") + "/invoices";

  const plain = await invoiceService.getInvoiceById(invoiceId);
  if (!plain) {
    if (req.accepts("html")) {
      res.setFlash("error", "Invoice not found.");
      return res.redirect(invoicesUrl);
    }
    return res.status(404).json({ error: "Invoice not found." });
  }

  if (plain.fiscalizationStatus === "fiscalized") {
    if (req.accepts("html")) {
      res.setFlash("info", `Invoice ${plain.invoiceNumber} is already fiscalised (JIR: ${plain.fiscalizationJir}).`);
      return res.redirect(invoicesUrl);
    }
    return res.status(409).json({ error: "Invoice is already fiscalised.", jir: plain.fiscalizationJir });
  }

  // Fetch the order and lines needed for fiscalisation + PDF regeneration
  const order = await orderRepo.findById(plain.orderId);
  if (!order) {
    if (req.accepts("html")) {
      res.setFlash("error", "Associated order not found.");
      return res.redirect(invoicesUrl);
    }
    return res.status(404).json({ error: "Associated order not found." });
  }

  const lines     = await orderRepo.getLines(plain.orderId);
  const orderPlain = order.get ? order.get({ plain: true }) : order;
  const linesPlain = (lines || []).map((l) => ({ title: l.title, quantity: l.quantity, price: l.price, vatRate: l.vatRate != null ? Number(l.vatRate) : null }));

  const result = await fiscalizationService.fiscalizeInvoice(plain, orderPlain, linesPlain);

  if (result.success) {
    // Regenerate PDF with fiscal codes
    try {
      const { generatePdfBuffer, resolvePdfPath } = invoiceService;
      const path = require("path");
      const fs   = require("fs");
      const updatedPdf = await generatePdfBuffer(orderPlain, linesPlain, plain.invoiceNumber, plain.type, {
        zki:                result.zkiCode,
        jir:                result.jir,
        fiscalInvoiceNumber: result.fiscalInvoiceNumber,
      });
      const absPath = resolvePdfPath(plain.pdfPath);
      const tmpPath = `${absPath}.tmp`;
      await fs.promises.writeFile(tmpPath, updatedPdf);
      await fs.promises.rename(tmpPath, absPath);
      logger.info("Admin: invoice PDF regenerated after retry fiscalisation", { invoiceId, invoiceNumber: plain.invoiceNumber });
    } catch (pdfErr) {
      logger.warn("Admin: fiscalisation retry succeeded but PDF regeneration failed", {
        invoiceId, error: pdfErr.message,
      });
    }

    if (req.accepts("html")) {
      res.setFlash("success", `Invoice ${plain.invoiceNumber} fiscalised. JIR: ${result.jir}`);
      return res.redirect(invoicesUrl);
    }
    return res.status(200).json({ jir: result.jir, zkiCode: result.zkiCode });
  }

  // Failed
  if (req.accepts("html")) {
    res.setFlash("error", `Fiscalisation failed: ${result.error}`);
    return res.redirect(invoicesUrl);
  }
  return res.status(500).json({ error: result.error });
}

/**
 * GET /admin/invoices
 *
 * Lists all invoices with optional filters: type, status, year, fiscalizationStatus.
 */
async function listInvoices(req, res) {
  const filters = {};
  const q = req.query || {};

  if (q.type && ["receipt", "r1"].includes(q.type)) filters.type = q.type;
  if (q.status && ["issued", "voided"].includes(q.status)) filters.status = q.status;
  const yearNum = q.year ? parseInt(q.year, 10) : NaN;
  if (!isNaN(yearNum) && yearNum > 2000 && yearNum < 2100) filters.year = yearNum;
  if (q.fiscalizationStatus && ["pending", "fiscalized", "failed", "not_required"].includes(q.fiscalizationStatus)) {
    filters.fiscalizationStatus = q.fiscalizationStatus;
  }

  const invoices = await invoiceService.listInvoices(filters);

  res.render("admin/invoices/index", {
    title: "Invoices",
    invoices,
    filters: {
      type: filters.type || "",
      status: filters.status || "",
      year: filters.year ? String(filters.year) : "",
      fiscalizationStatus: filters.fiscalizationStatus || "",
    },
  });
}

module.exports = { regenerateInvoice, retryFiscalization, listInvoices };
