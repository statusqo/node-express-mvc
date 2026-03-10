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
   * Update mutable fiscalisation fields on an invoice record.
   *
   * Uses the static Model.update (bulk update) which does NOT trigger individual
   * instance beforeUpdate hooks, so fiscal fields can be written freely.
   * The immutable-fields hook on Invoice only fires on instance .save()/.update().
   *
   * @param {string} id
   * @param {object} fields - Only the fiscal fields should ever be passed here
   */
  async updateFiscalFields(id, fields) {
    await Invoice.update(fields, { where: { id } });
  },
};
