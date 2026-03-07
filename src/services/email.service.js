const nodemailer = require("nodemailer");
const config = require("../config");

let cachedTransporter;

function ensureMailConfig() {
  const { host, port, user, pass, from } = config.mail;
  if (!host || !port || !user || !pass || !from) {
    const err = new Error("Email is not configured. Check SMTP_* and MAIL_* env vars.");
    err.status = 500;
    throw err;
  }
}

function sanitizeHeaderValue(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function isMailConfigured() {
  const { host, port, user, pass, from } = config.mail;
  return !!(host && port && user && pass && from);
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  ensureMailConfig();

  cachedTransporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: { user: config.mail.user, pass: config.mail.pass },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: {
      rejectUnauthorized: true
    }
  });

  return cachedTransporter;
}

async function sendContactEmail({ name, email, message }) {
  if (!config.mail.to) {
    const err = new Error("Mail admin recipient (MAIL_TO) is not configured.");
    err.status = 500;
    throw err;
  }
  const transporter = getTransporter();
  const safeName = sanitizeHeaderValue(name);
  const safeEmail = sanitizeHeaderValue(email);

  await transporter.sendMail({
    from: config.mail.from,
    to: config.mail.to,
    replyTo: { name: safeName, address: safeEmail },
    subject: `New contact form message from ${safeName}`,
    text: `Name: ${safeName}\nEmail: ${safeEmail}\n\n${String(message || "").trim()}`
  });
}

/**
 * Send order confirmation to the customer. No-op if mail is not configured.
 * @param {Object} order - Order plain object: email, id, total, currency, forename
 * @param {Array} lines - Order lines (optional, for line items in body)
 * @param {Buffer|null} pdfBuffer - Optional PDF receipt to attach
 * @param {string|null} invoiceNumber - Invoice number used as attachment filename
 */
async function sendOrderConfirmationEmail(order, lines = [], pdfBuffer = null, invoiceNumber = null) {
  if (!isMailConfigured()) return;
  const to = sanitizeHeaderValue(order.email);
  if (!to) return;

  const transporter = getTransporter();
  const subject = "Order confirmation";
  const lineList = (lines || []).map((l) => `  - ${l.title || "Item"} x ${l.quantity || 1} @ ${l.price || 0} ${order.currency || "USD"}`).join("\n");
  const text = `Thank you for your order.\n\nOrder ID: ${order.id}\nTotal: ${order.total} ${order.currency || "USD"}\n\n${lineList ? "Items:\n" + lineList : ""}\n`;

  const mailOptions = {
    from: config.mail.from,
    to,
    subject,
    text,
  };

  if (pdfBuffer && invoiceNumber) {
    mailOptions.attachments = [{
      filename: `${invoiceNumber}.pdf`,
      content: pdfBuffer,
      contentType: "application/pdf",
    }];
  }

  await transporter.sendMail(mailOptions);
}

/**
 * Send event cancellation notification. No-op if mail not configured.
 * @param {Object} opts - { to, eventTitle, startDate, startTime, wasRefunded? }
 *   wasRefunded defaults to true (paid order that has been refunded).
 *   Pass wasRefunded: false for unpaid/voided orders where no charge was made.
 */
async function sendEventCancellationEmail(opts = {}) {
  if (!isMailConfigured()) return;
  const to = sanitizeHeaderValue(opts.to);
  if (!to) return;
  const eventTitle = String(opts.eventTitle || "Event").substring(0, 200);
  const startDate = opts.startDate ? String(opts.startDate).substring(0, 10) : "";
  const startTime = opts.startTime != null ? String(opts.startTime).substring(0, 5) : "";
  const when = startDate && startTime ? `${startDate} at ${startTime}` : startDate || "the scheduled time";
  const wasRefunded = opts.wasRefunded !== false; // default true
  const subject = wasRefunded ? "Event cancelled – refund processed" : "Event cancelled";
  const refundNote = wasRefunded ? " Your order has been refunded." : "";
  const text = `Your registration for "${eventTitle}" (${when}) has been cancelled.${refundNote} If you have any questions, please contact us.`;

  const transporter = getTransporter();
  await transporter.sendMail({
    from: config.mail.from,
    to,
    subject,
    text,
  });
}

module.exports = { sendContactEmail, sendOrderConfirmationEmail, sendEventCancellationEmail, isMailConfigured };
