const addressRepo = require("../repos/address.repo");

const LABEL_DELIVERY = "delivery";
const LABEL_BILLING = "billing";

async function listByUser(userId) {
  return await addressRepo.findByUser(userId);
}

/** Get user's delivery address (label 'delivery'). */
async function getDeliveryAddress(userId) {
  if (!userId) return null;
  return await addressRepo.findByUserAndLabel(userId, LABEL_DELIVERY);
}

/** Get user's billing address (label 'billing'). If none, returns delivery address (same as delivery). */
async function getBillingAddress(userId) {
  if (!userId) return null;
  const billing = await addressRepo.findByUserAndLabel(userId, LABEL_BILLING);
  if (billing) return billing;
  return await getDeliveryAddress(userId);
}

/** Save or update delivery address (label 'delivery'). */
async function saveDeliveryAddress(userId, data) {
  if (!userId) return null;
  const payload = {
    label: LABEL_DELIVERY,
    line1: data.line1,
    line2: data.line2 ?? null,
    city: data.city,
    state: data.state ?? null,
    postcode: data.postcode,
    country: data.country,
    isDefault: data.isDefault ?? false,
  };
  const existing = await addressRepo.findByUserAndLabel(userId, LABEL_DELIVERY);
  if (existing) return await addressRepo.update(existing.id, payload);
  return await addressRepo.create({ userId, ...payload });
}

/** Save or update billing address (label 'billing'). */
async function saveBillingAddress(userId, data) {
  if (!userId) return null;
  const payload = {
    label: LABEL_BILLING,
    line1: data.line1,
    line2: data.line2 ?? null,
    city: data.city,
    state: data.state ?? null,
    postcode: data.postcode,
    country: data.country,
    isDefault: false,
  };
  const existing = await addressRepo.findByUserAndLabel(userId, LABEL_BILLING);
  if (existing) return await addressRepo.update(existing.id, payload);
  return await addressRepo.create({ userId, ...payload });
}

/** Copy delivery address to billing (Same as delivery). */
async function saveBillingSameAsDelivery(userId) {
  const delivery = await getDeliveryAddress(userId);
  if (!delivery) return null;
  return await saveBillingAddress(userId, {
    line1: delivery.line1,
    line2: delivery.line2,
    city: delivery.city,
    state: delivery.state,
    postcode: delivery.postcode,
    country: delivery.country,
  });
}

async function getById(id, userId) {
  const address = await addressRepo.findById(id);
  if (!address) return null;
  if (address.userId && address.userId !== userId) return null;
  return address;
}

async function create(userId, data) {
  return await addressRepo.create({
    ...data,
    userId: userId || null,
  });
}

async function update(id, userId, data) {
  const address = await getById(id, userId);
  if (!address) return null;
  return await addressRepo.update(id, data);
}

async function remove(id, userId) {
  const address = await getById(id, userId);
  if (!address) return false;
  return await addressRepo.delete(id);
}

module.exports = {
  listByUser,
  getById,
  create,
  update,
  remove,
  getDeliveryAddress,
  getBillingAddress,
  saveDeliveryAddress,
  saveBillingAddress,
  saveBillingSameAsDelivery,
  LABEL_DELIVERY,
  LABEL_BILLING,
};
