const { sequelize } = require("../../db");
const orderRepo = require("../../repos/order.repo");
const invoiceService = require("../../services/invoice.service");
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

  const order = await orderRepo.findById(orderId);
  if (!order) {
    return res.status(404).json({ error: "Order not found." });
  }

  if (order.paymentStatus !== PAYMENT_STATUS.PAID) {
    return res.status(400).json({ error: "Invoice can only be generated for paid orders." });
  }

  const existing = await invoiceService.getInvoiceForOrder(orderId);
  if (existing) {
    return res.status(409).json({
      error: "Invoice already exists for this order.",
      invoiceNumber: existing.invoiceNumber,
    });
  }

  const lines = await orderRepo.getLines(orderId);
  const orderPlain = order.get ? order.get({ plain: true }) : order;
  const linesPlain = (lines || []).map((l) => ({ title: l.title, quantity: l.quantity, price: l.price }));

  let invoice;
  let pdfBuffer;

  const t = await sequelize.transaction();
  try {
    ({ invoice, pdfBuffer } = await invoiceService.createInvoiceForOrder(orderPlain, linesPlain, t));
    await t.commit();
  } catch (err) {
    await t.rollback();
    logger.error("Admin: invoice regeneration failed", { orderId, error: err.message });
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
      return res.status(200).json({
        invoiceNumber: invoice.invoiceNumber,
        warning: "Invoice created but email delivery failed.",
      });
    }
  }

  return res.status(200).json({ invoiceNumber: invoice.invoiceNumber });
}

module.exports = { regenerateInvoice };
