"use strict";

/**
 * Add storno (cancellation invoice) support to the invoices table.
 *
 * Changes:
 *  1. Add stornoOfInvoiceId — UUID FK to invoices.id, set on the storno invoice
 *     to identify which original invoice it cancels.
 *  2. Add stornoInvoiceId — UUID, denormalized reverse pointer on the original
 *     invoice so it is easy to find its storno without a join.
 *  3. Replace the plain UNIQUE constraint on orderId with a partial unique index
 *     (WHERE stornoOfInvoiceId IS NULL) so that:
 *       - Only one original invoice per order is allowed (unchanged business rule).
 *       - A storno invoice can reference the same orderId as the original without
 *         violating the constraint.
 *
 * SQLite cannot modify existing constraints via ALTER TABLE, so we recreate the
 * invoices table to remove the orderId uniqueness constraint, then add new columns
 * and a partial unique index.
 *
 * Croatian fiscalization law (Zakon o fiskalizaciji):
 *   A storno (cancellation) invoice is a new fiscal document with a new sequential
 *   number, negative amounts, and a StornRac element referencing the original.
 *   It must be independently fiscalized and receives its own ZKI + JIR from FINA.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const seq = queryInterface.sequelize;
    const now = new Date().toISOString();

    // ── 1. Recreate invoices table without the UNIQUE constraint on orderId ──
    //
    // We keep all existing columns and their constraints intact; we only drop
    // the orderId uniqueness so storno invoices can share the same orderId.
    // A partial unique index applied afterwards restores the original business rule
    // for non-storno invoices.

    await seq.query(`
      CREATE TABLE invoices_new (
        id                    TEXT         NOT NULL PRIMARY KEY,
        orderId               TEXT         NOT NULL
                                           REFERENCES orders(id)
                                           ON UPDATE CASCADE
                                           ON DELETE CASCADE,
        stornoOfInvoiceId     TEXT         REFERENCES invoices_new(id),
        stornoInvoiceId       TEXT,
        invoiceNumber         TEXT         NOT NULL UNIQUE,
        fiscalInvoiceNumber   TEXT,
        zkiCode               TEXT,
        fiscalizationStatus   TEXT         NOT NULL DEFAULT 'pending',
        fiscalizationJir      TEXT,
        fiscalizedAt          DATETIME,
        fiscalizationRequest  TEXT,
        fiscalizationResponse TEXT,
        companyOib            TEXT,
        premisesId            TEXT,
        deviceId              TEXT,
        operatorOib           TEXT,
        type                  TEXT         NOT NULL,
        sequenceNumber        INTEGER      NOT NULL,
        year                  INTEGER      NOT NULL,
        total                 DECIMAL(10,2),
        vatTotal              DECIMAL(10,2),
        paymentMethod         TEXT,
        status                TEXT         NOT NULL DEFAULT 'issued',
        pdfPath               TEXT,
        generatedAt           DATETIME     NOT NULL,
        createdAt             DATETIME     NOT NULL,
        updatedAt             DATETIME     NOT NULL
      )
    `);

    // Copy all existing data
    await seq.query(`
      INSERT INTO invoices_new (
        id, orderId, invoiceNumber, fiscalInvoiceNumber, zkiCode,
        fiscalizationStatus, fiscalizationJir, fiscalizedAt,
        fiscalizationRequest, fiscalizationResponse,
        companyOib, premisesId, deviceId, operatorOib,
        type, sequenceNumber, year,
        total, vatTotal, paymentMethod,
        status, pdfPath, generatedAt, createdAt, updatedAt
      )
      SELECT
        id, orderId, invoiceNumber, fiscalInvoiceNumber, zkiCode,
        fiscalizationStatus, fiscalizationJir, fiscalizedAt,
        fiscalizationRequest, fiscalizationResponse,
        companyOib, premisesId, deviceId, operatorOib,
        type, sequenceNumber, year,
        total, vatTotal, paymentMethod,
        status, pdfPath, generatedAt, createdAt, updatedAt
      FROM invoices
    `);

    await seq.query(`DROP TABLE invoices`);
    await seq.query(`ALTER TABLE invoices_new RENAME TO invoices`);

    // ── 2. Partial unique index on orderId (original invoices only) ──────────
    // Only one original (non-storno) invoice is allowed per order.
    // Storno invoices (stornoOfInvoiceId IS NOT NULL) are exempt.
    await seq.query(`
      CREATE UNIQUE INDEX idx_invoices_order_original
        ON invoices (orderId)
       WHERE stornoOfInvoiceId IS NULL
    `);

    // ── 3. Restore the year+type index ───────────────────────────────────────
    await seq.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_year_type
        ON invoices (year, type)
    `);
  },

  async down(queryInterface) {
    const seq = queryInterface.sequelize;

    // Reverse: recreate original table with plain UNIQUE on orderId, no storno cols
    await seq.query(`
      CREATE TABLE invoices_old (
        id                    TEXT         NOT NULL PRIMARY KEY,
        orderId               TEXT         NOT NULL UNIQUE
                                           REFERENCES orders(id)
                                           ON UPDATE CASCADE
                                           ON DELETE CASCADE,
        invoiceNumber         TEXT         NOT NULL UNIQUE,
        fiscalInvoiceNumber   TEXT,
        zkiCode               TEXT,
        fiscalizationStatus   TEXT         NOT NULL DEFAULT 'pending',
        fiscalizationJir      TEXT,
        fiscalizedAt          DATETIME,
        fiscalizationRequest  TEXT,
        fiscalizationResponse TEXT,
        companyOib            TEXT,
        premisesId            TEXT,
        deviceId              TEXT,
        operatorOib           TEXT,
        type                  TEXT         NOT NULL,
        sequenceNumber        INTEGER      NOT NULL,
        year                  INTEGER      NOT NULL,
        total                 DECIMAL(10,2),
        vatTotal              DECIMAL(10,2),
        paymentMethod         TEXT,
        status                TEXT         NOT NULL DEFAULT 'issued',
        pdfPath               TEXT,
        generatedAt           DATETIME     NOT NULL,
        createdAt             DATETIME     NOT NULL,
        updatedAt             DATETIME     NOT NULL
      )
    `);

    // Only copy original (non-storno) invoices back
    await seq.query(`
      INSERT INTO invoices_old (
        id, orderId, invoiceNumber, fiscalInvoiceNumber, zkiCode,
        fiscalizationStatus, fiscalizationJir, fiscalizedAt,
        fiscalizationRequest, fiscalizationResponse,
        companyOib, premisesId, deviceId, operatorOib,
        type, sequenceNumber, year,
        total, vatTotal, paymentMethod,
        status, pdfPath, generatedAt, createdAt, updatedAt
      )
      SELECT
        id, orderId, invoiceNumber, fiscalInvoiceNumber, zkiCode,
        fiscalizationStatus, fiscalizationJir, fiscalizedAt,
        fiscalizationRequest, fiscalizationResponse,
        companyOib, premisesId, deviceId, operatorOib,
        type, sequenceNumber, year,
        total, vatTotal, paymentMethod,
        status, pdfPath, generatedAt, createdAt, updatedAt
      FROM invoices
      WHERE stornoOfInvoiceId IS NULL
    `);

    await seq.query(`DROP TABLE invoices`);
    await seq.query(`ALTER TABLE invoices_old RENAME TO invoices`);

    await seq.query(`
      CREATE INDEX IF NOT EXISTS invoices_year_type
        ON invoices (year, type)
    `);
  },
};
