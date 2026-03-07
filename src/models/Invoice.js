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
    unique: true,
  },
  invoiceNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
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
// creation. Only the status field (voiding) is permitted to change.
// This hook is the application-layer enforcement; the DB unique constraints
// on invoiceNumber and (sequenceNumber, year, type) provide the second layer.
const IMMUTABLE_INVOICE_FIELDS = [
  "orderId",
  "invoiceNumber",
  "type",
  "sequenceNumber",
  "year",
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
