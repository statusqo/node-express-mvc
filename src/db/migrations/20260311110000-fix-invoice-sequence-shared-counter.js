"use strict";

/**
 * Migrate invoice sequence tracking from per-type counters to one shared counter.
 *
 * Background:
 *   Previously invoices used separate sequences per type ('receipt', 'r1'),
 *   and the DB enforced uniqueness via UNIQUE(sequenceNumber, year, type).
 *   After switching to a single shared 'invoice' sequence key, that index is
 *   incorrect — the same sequenceNumber cannot repeat within a year regardless
 *   of type, and invoiceNumber UNIQUE already provides the string-level guard.
 *
 * This migration:
 *   1. Drops the now-incorrect (sequenceNumber, year, type) unique index.
 *   2. Upserts an 'invoice' row in invoice_sequences for each year that has
 *      existing invoices, initialising lastValue to MAX(sequenceNumber) for
 *      that year so the next invoice continues cleanly above all existing rows.
 *   3. Removes the obsolete 'receipt' and 'r1' rows from invoice_sequences.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Drop the old per-type uniqueness index (invoiceNumber UNIQUE is sufficient)
    await queryInterface.removeIndex("invoices", "invoices_sequence_year_type_unique");

    // 2. Seed the shared 'invoice' sequence for each year that already has invoices
    const [years] = await queryInterface.sequelize.query(
      `SELECT year, MAX(sequenceNumber) AS maxSeq FROM invoices GROUP BY year`
    );

    const now = new Date().toISOString();
    for (const { year, maxSeq } of years) {
      await queryInterface.sequelize.query(
        `INSERT INTO invoice_sequences (type, year, lastValue, createdAt, updatedAt)
         VALUES ('invoice', :year, :maxSeq, :now, :now)
         ON CONFLICT(type, year)
         DO UPDATE SET lastValue = MAX(invoice_sequences.lastValue, :maxSeq), updatedAt = :now`,
        { replacements: { year, maxSeq, now } }
      );
    }

    // 3. Remove the obsolete per-type rows (they are superseded by 'invoice')
    await queryInterface.sequelize.query(
      `DELETE FROM invoice_sequences WHERE type IN ('receipt', 'r1')`
    );
  },

  async down(queryInterface) {
    // Re-add the index (data may no longer satisfy it if mixed types share a sequenceNumber)
    await queryInterface.addIndex("invoices", ["sequenceNumber", "year", "type"], {
      unique: true,
      name: "invoices_sequence_year_type_unique",
    });
    // Note: restoring the per-type sequence rows is not attempted as the data
    // cannot be reliably reconstructed after the shared counter has advanced.
  },
};
