const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/client");

const Invoice = sequelize.define("Invoice", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  orderId: {
    type: DataTypes.UUID,
    allowNull: false,
    // Uniqueness is enforced by a partial DB index (WHERE stornoOfInvoiceId IS NULL)
    // so that storno invoices can share the same orderId as the original.
  },
  // Set on storno invoices: UUID of the original invoice being cancelled.
  // Null on original invoices.
  stornoOfInvoiceId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  // Denormalized reverse pointer set on the original invoice when its storno is created.
  // Allows fetching the storno invoice without a join.
  stornoInvoiceId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  invoiceNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  // Croatian fiscal format: "SEQ/PREMISES/DEVICE" (e.g. "42/INTERNET1/1")
  fiscalInvoiceNumber: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // Zaštitni kod izdavatelja — 32-char hex, computed before FINA submission
  zkiCode: {
    type: DataTypes.STRING(32),
    allowNull: true,
  },
  // Fiscalisation lifecycle: pending → fiscalized | failed | not_required
  fiscalizationStatus: {
    type: DataTypes.ENUM("pending", "fiscalized", "failed", "not_required"),
    allowNull: false,
    defaultValue: "pending",
  },
  // Jedinstveni identifikator računa — UUID returned by Tax Administration
  fiscalizationJir: {
    type: DataTypes.STRING(36),
    allowNull: true,
  },
  fiscalizedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Full SOAP XML sent and received — stored for legal audit trail
  fiscalizationRequest: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  fiscalizationResponse: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // ── Fiscal parameters — who signed it and on which device ──────────────────
  // Snapshotted from the FINA certificate / config at the moment of fiscalisation.
  // Nullable until fiscalisation succeeds (or not_required).
  companyOib: {
    type: DataTypes.STRING(11),
    allowNull: true,
  },
  premisesId: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  deviceId: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  operatorOib: {
    type: DataTypes.STRING(11),
    allowNull: true,
  },
  type: {
    type: DataTypes.ENUM("receipt", "r1"),
    allowNull: false,
  },
  sequenceNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  // ── Accounting snapshot — written at invoice creation, never mutated ────────
  // Gross order total (VAT-inclusive), in EUR.
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true, // nullable for historical rows pre-dating this field
  },
  // Total VAT extracted from lines (gross − net across all VAT groups).
  vatTotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  // FINA payment method code: K=card, G=cash, T=transfer, O=other.
  paymentMethod: {
    type: DataTypes.STRING(1),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM("issued", "voided"),
    allowNull: false,
    defaultValue: "issued",
  },
  pdfPath: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  generatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: "invoices",
});

// Invoice records are legal accounting documents and must not be mutated after
// creation. Only fiscalisation fields and status (voiding) may change.
// This hook is the application-layer enforcement; the DB unique constraint on
// invoiceNumber provides the second layer.
const IMMUTABLE_INVOICE_FIELDS = [
  "orderId",
  "stornoOfInvoiceId",
  "invoiceNumber",
  "type",
  "sequenceNumber",
  "year",
  "premisesId",
  "deviceId",
  "total",
  "vatTotal",
  "paymentMethod",
  "pdfPath",
  "generatedAt",
];

Invoice.addHook("beforeUpdate", (invoice) => {
  for (const field of IMMUTABLE_INVOICE_FIELDS) {
    if (invoice.changed(field)) {
      throw new Error(
        `Invoice field "${field}" is immutable after creation and cannot be changed.`
      );
    }
  }
});

module.exports = Invoice;
