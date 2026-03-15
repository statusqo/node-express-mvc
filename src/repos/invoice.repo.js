const { Op } = require("sequelize");
const { Invoice } = require("../models");

module.exports = {
  async findById(id) {
    if (!id) return null;
    const invoice = await Invoice.findByPk(id);
    return invoice ? invoice.get({ plain: true }) : null;
  },

  async findOne(where) {
    const invoice = await Invoice.findOne({ where });
    return invoice ? invoice.get({ plain: true }) : null;
  },

  async findAll(where, order = [["generatedAt", "DESC"]]) {
    const invoices = await Invoice.findAll({
      where: Object.keys(where).length ? where : undefined,
      order,
    });
    return invoices.map((i) => i.get({ plain: true }));
  },

  async create(data, options = {}) {
    const invoice = await Invoice.create(data, options);
    return invoice.get({ plain: true });
  },

  /**
   * Find invoices that need fiscalisation retried.
   * Returns invoices with status 'failed' or 'pending' that are:
   *   - old enough (minAgeSeconds) — avoids picking up in-flight fiscalisations
   *   - young enough (maxAgeDays)  — stops retrying permanently lost invoices
   *
   * 'pending' invoices can appear if the app crashed between invoice creation and
   * the first fiscalisation attempt. They are treated the same as 'failed'.
   *
   * @param {{ minAgeSeconds?: number, maxAgeDays?: number }} opts
   * @returns {Promise<object[]>} plain invoice objects, oldest first
   */
  async findFailedFiscalizations({ minAgeSeconds = 60, maxAgeDays = 7 } = {}) {
    const minAge = new Date(Date.now() - minAgeSeconds * 1_000);
    const maxAge = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1_000);
    const invoices = await Invoice.findAll({
      where: {
        fiscalizationStatus: { [Op.in]: ["failed", "pending"] },
        createdAt: { [Op.lt]: minAge, [Op.gt]: maxAge },
      },
      order: [["createdAt", "ASC"]], // oldest first
    });
    return invoices.map((i) => i.get({ plain: true }));
  },

  /**
   * Find the storno invoice that cancels a given original invoice.
   * Returns null if no storno has been created yet.
   *
   * @param {string} originalInvoiceId - id of the original invoice
   * @returns {Promise<object|null>} plain invoice object or null
   */
  async findByOriginalInvoiceId(originalInvoiceId) {
    if (!originalInvoiceId) return null;
    const invoice = await Invoice.findOne({ where: { stornoOfInvoiceId: originalInvoiceId } });
    return invoice ? invoice.get({ plain: true }) : null;
  },

  /**
   * Update mutable fiscalisation fields on an invoice record.
   *
   * Uses the static Model.update (bulk update) which does NOT trigger individual
   * instance beforeUpdate hooks, so fiscal fields can be written freely.
   * The immutable-fields hook on Invoice only fires on instance .save()/.update().
   *
   * @param {string} id
   * @param {object} fields - Only the fiscal fields should ever be passed here
   */
  async updateFiscalFields(id, fields, transaction = null) {
    const opts = { where: { id } };
    if (transaction) opts.transaction = transaction;
    await Invoice.update(fields, opts);
  },
};
