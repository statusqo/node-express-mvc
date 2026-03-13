"use strict";

/**
 * Fix invoice_sequences to scope counters by (premise, device, year).
 *
 * Croatian law requires invoice numbers to be sequential per business
 * premise + device + calendar year. The previous schema used a generic
 * "type" string key which did not enforce this.
 *
 * Changes:
 *  1. Recreate invoice_sequences with (premise, device, year) primary key.
 *     Migrate existing rows: derive premise/device from the invoices table.
 *  2. Backfill invoices.premisesId and invoices.deviceId for rows that already
 *     have the SEQ/PREMISE/DEVICE format but were created before this column
 *     was populated at creation time.
 */
module.exports = {
  async up(queryInterface) {
    const seq = queryInterface.sequelize;
    const now = new Date().toISOString();

    // ── 1. Recreate invoice_sequences ────────────────────────────────────────

    await seq.query(`
      CREATE TABLE invoice_sequences_new (
        premise   VARCHAR(20)  NOT NULL,
        device    VARCHAR(20)  NOT NULL,
        year      INTEGER      NOT NULL,
        lastValue INTEGER      NOT NULL DEFAULT 0,
        createdAt DATETIME     NOT NULL,
        updatedAt DATETIME     NOT NULL,
        PRIMARY KEY (premise, device, year)
      )
    `);

    // For each existing row, determine the premise/device by looking at the
    // invoices table (the invoiceNumber encodes them as SEQ/PREMISE/DEVICE).
    const [oldRows] = await seq.query(
      `SELECT year, lastValue FROM invoice_sequences`
    );

    for (const row of oldRows) {
      // Find any invoice for this year that uses the new number format
      const [sample] = await seq.query(
        `SELECT invoiceNumber FROM invoices
         WHERE year = :year AND invoiceNumber LIKE '%/%/%'
         LIMIT 1`,
        { replacements: { year: row.year } }
      );

      let premise = "INTERNET1";
      let device  = "1";
      if (sample.length > 0) {
        const parts = sample[0].invoiceNumber.split("/");
        if (parts.length === 3) {
          premise = parts[1];
          device  = parts[2];
        }
      }

      await seq.query(
        `INSERT INTO invoice_sequences_new (premise, device, year, lastValue, createdAt, updatedAt)
         VALUES (:premise, :device, :year, :lastValue, :now, :now)`,
        { replacements: { premise, device, year: row.year, lastValue: row.lastValue, now } }
      );
    }

    await seq.query(`DROP TABLE invoice_sequences`);
    await seq.query(`ALTER TABLE invoice_sequences_new RENAME TO invoice_sequences`);

    // ── 2. Backfill invoices.premisesId / deviceId ───────────────────────────
    // Invoices created before this fix have null premisesId/deviceId even
    // though the invoiceNumber already encodes the correct values.

    const [invoiceRows] = await seq.query(
      `SELECT id, invoiceNumber FROM invoices
       WHERE invoiceNumber LIKE '%/%/%'
         AND (premisesId IS NULL OR deviceId IS NULL)`
    );

    for (const inv of invoiceRows) {
      const parts = inv.invoiceNumber.split("/");
      if (parts.length !== 3) continue;
      const [, premise, device] = parts;
      await seq.query(
        `UPDATE invoices SET premisesId = :premise, deviceId = :device
         WHERE id = :id AND (premisesId IS NULL OR deviceId IS NULL)`,
        { replacements: { premise, device, id: inv.id } }
      );
    }
  },

  async down(queryInterface) {
    const seq = queryInterface.sequelize;
    const now = new Date().toISOString();

    await seq.query(`
      CREATE TABLE invoice_sequences_old (
        type      VARCHAR(10)  NOT NULL,
        year      INTEGER      NOT NULL,
        lastValue INTEGER      NOT NULL DEFAULT 0,
        createdAt DATETIME     NOT NULL,
        updatedAt DATETIME     NOT NULL,
        PRIMARY KEY (type, year)
      )
    `);

    const [rows] = await seq.query(
      `SELECT premise, device, year, lastValue FROM invoice_sequences`
    );

    for (const row of rows) {
      await seq.query(
        `INSERT INTO invoice_sequences_old (type, year, lastValue, createdAt, updatedAt)
         VALUES ('invoice', :year, :lastValue, :now, :now)
         ON CONFLICT(type, year)
         DO UPDATE SET lastValue = MAX(invoice_sequences_old.lastValue, :lastValue)`,
        { replacements: { year: row.year, lastValue: row.lastValue, now } }
      );
    }

    await seq.query(`DROP TABLE invoice_sequences`);
    await seq.query(`ALTER TABLE invoice_sequences_old RENAME TO invoice_sequences`);
  },
};
