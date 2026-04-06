const { sequelize } = require("../db");
const paymentMethodRepo = require("../repos/paymentMethod.repo");
const { getDefaultGateway } = require("../gateways");

async function listByUser(userId) {
  return await paymentMethodRepo.findByUser(userId);
}

async function getById(id, userId) {
  const pm = await paymentMethodRepo.findById(id);
  if (!pm) return null;
  if (String(pm.userId) !== String(userId)) return null;
  return pm;
}

async function create(userId, data) {
  return await paymentMethodRepo.create({
    ...data,
    userId,
  });
}

async function update(id, userId, data) {
  const pm = await getById(id, userId);
  if (!pm) return null;
  return await paymentMethodRepo.update(id, data);
}

async function setDefault(id, userId) {
  const pm = await getById(id, userId);
  if (!pm) return null;
  // Clear other defaults for this user, then set this one — both writes in a single transaction.
  const list = await paymentMethodRepo.findByUser(userId);
  let result;
  await sequelize.transaction(async (t) => {
    for (const p of list) {
      if (p.id !== id && p.isDefault) await paymentMethodRepo.update(p.id, { isDefault: false }, { transaction: t });
    }
    result = await paymentMethodRepo.update(id, { isDefault: true }, { transaction: t });
  });
  return result;
}

async function remove(id, userId) {
  const pm = await getById(id, userId);
  if (!pm) return false;
  const gateway = getDefaultGateway();
  if (pm.stripePaymentMethodId && gateway) {
    try {
      await gateway.detachPaymentMethod(pm.stripePaymentMethodId);
    } catch (err) {
      const logger = require("../config/logger");
      logger.warn("paymentMethod.remove: gateway detach failed", {
        id,
        stripePaymentMethodId: pm.stripePaymentMethodId ? pm.stripePaymentMethodId.slice(-4) : "(none)",
        error: err.message,
      });
    }
  }
  return await paymentMethodRepo.delete(id);
}

module.exports = {
  listByUser,
  getById,
  create,
  update,
  setDefault,
  remove,
};
