const taxRateRepo = require("../repos/taxRate.repo");

module.exports = {
  findAll: (options) => taxRateRepo.findAll(options),
  findById: (id, options) => taxRateRepo.findById(id, options),
  findByStripeId: (stripeTaxRateId, options) => taxRateRepo.findByStripeId(stripeTaxRateId, options),
  create: (data, options) => taxRateRepo.create(data, options),
  update: (id, data, options) => taxRateRepo.update(id, data, options),
  delete: (id, options) => taxRateRepo.delete(id, options),
};
