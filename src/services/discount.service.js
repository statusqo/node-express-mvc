const discountRepo = require("../repos/discount.repo");
const orderDiscountRepo = require("../repos/orderDiscount.repo");
const { DISCOUNT_TYPE } = require("../constants/discount");

// ---------------------------------------------------------------------------
// Pure helpers (no DB — fully unit-testable)
// ---------------------------------------------------------------------------

/**
 * Returns today's date as a YYYY-MM-DD string in server-local time.
 * Used for DATEONLY field comparisons so that "valid until April 10" covers the
 * full calendar day regardless of the server clock's time-of-day or UTC offset.
 */
function localDateStr() {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

/**
 * Rounds a number to 2 decimal places (standard currency rounding).
 * @param {number} value
 * @returns {number}
 */
function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Calculates the actual EUR amount to deduct from applicableTotal for a given discount.
 * Clamps to applicableTotal so the order total never goes below zero.
 *
 * @param {object} discount        - Discount model instance or plain object
 * @param {number} applicableTotal - Pre-discount subtotal of applicable lines in EUR
 * @returns {number} amountDeducted in EUR, rounded to 2 dp
 */
function calculateDeduction(discount, applicableTotal) {
  const total = Number(applicableTotal) || 0;
  const value = Number(discount.value) || 0;
  if (total <= 0 || value <= 0) return 0;

  let deducted;
  if (discount.type === DISCOUNT_TYPE.PERCENTAGE) {
    deducted = total * (value / 100);
  } else {
    deducted = value;
  }

  return roundMoney(Math.min(deducted, total));
}

/**
 * Distributes amountDeducted proportionally across VAT brackets defined by
 * the applicable order lines, using the largest-remainder method to ensure the
 * distributed amounts sum exactly to amountDeducted (no cent discrepancy).
 *
 * For non-VAT orders (vatEnabled = false) a single entry with no tax rate is
 * returned, mapping to a bare negative Stripe InvoiceItem.
 *
 * @param {number}  amountDeducted  - Total discount in EUR (already rounded)
 * @param {Array}   applicableLines - Lines with { price, quantity, vatRate, stripeTaxRateId }
 * @param {boolean} vatEnabled      - storeSettingService.isCheckoutVatEnabled() result
 * @returns {Array<{ vatRate: number|null, stripeTaxRateId: string|null, amount: number }>}
 */
function calculateVatDistribution(amountDeducted, applicableLines, vatEnabled) {
  if (!vatEnabled) {
    return [{ vatRate: null, stripeTaxRateId: null, amount: amountDeducted }];
  }

  // Group lines by composite key (vatRate + stripeTaxRateId).
  const groups = new Map();
  for (const line of applicableLines) {
    const vatRate = line.vatRate != null ? Number(line.vatRate) : null;
    const stripeTaxRateId = line.stripeTaxRateId || null;
    const key = `${vatRate}|${stripeTaxRateId}`;
    const subtotal = (Number(line.price) || 0) * (Number(line.quantity) || 1);
    if (!groups.has(key)) {
      groups.set(key, { vatRate, stripeTaxRateId, subtotal: 0 });
    }
    groups.get(key).subtotal += subtotal;
  }

  const entries = Array.from(groups.values());
  const grandTotal = entries.reduce((acc, g) => acc + g.subtotal, 0);

  if (grandTotal <= 0 || amountDeducted <= 0) {
    return entries.length > 0
      ? [{ vatRate: entries[0].vatRate, stripeTaxRateId: entries[0].stripeTaxRateId, amount: amountDeducted }]
      : [{ vatRate: null, stripeTaxRateId: null, amount: amountDeducted }];
  }

  // Step 1 — compute exact proportional shares in cents (integer arithmetic avoids float drift).
  const totalCents = Math.round(amountDeducted * 100);
  const shares = entries.map((g) => {
    const exact = (g.subtotal / grandTotal) * totalCents;
    const floor = Math.floor(exact);
    return { ...g, floor, remainder: exact - floor };
  });

  // Step 2 — distribute leftover cents to entries with the largest fractional remainders.
  const allocatedCents = shares.reduce((acc, s) => acc + s.floor, 0);
  let leftover = totalCents - allocatedCents;
  shares
    .map((s, i) => ({ i, remainder: s.remainder }))
    .sort((a, b) => b.remainder - a.remainder)
    .forEach(({ i }) => {
      if (leftover > 0) { shares[i].floor += 1; leftover -= 1; }
    });

  // Step 3 — convert back to EUR, drop zero-amount brackets.
  return shares
    .filter((s) => s.floor > 0)
    .map((s) => ({
      vatRate: s.vatRate,
      stripeTaxRateId: s.stripeTaxRateId,
      amount: roundMoney(s.floor / 100),
    }));
}

// ---------------------------------------------------------------------------
// Async — validation (read-only, safe to call from the preview API endpoint)
// ---------------------------------------------------------------------------

/**
 * Validates a discount code against current business rules without writing
 * anything to the database.
 *
 * Returns deliberately generic error messages for invalid/inactive/expired
 * codes to avoid leaking which codes exist in the system.
 *
 * @param {string} code             - Raw discount code entered by the customer
 * @param {number} applicableTotal  - Cart subtotal of lines this discount applies to (in EUR)
 * @param {object} [options]        - Sequelize query options (e.g. { transaction })
 * @returns {Promise<{ ok: true,  discount: object, amountDeducted: number }
 *                 | { ok: false, error: string }>}
 */
async function validateCode(code, applicableTotal, options = {}) {
  const normalised = String(code || "").trim().toUpperCase();
  if (!normalised) return { ok: false, error: "Invalid discount code." };

  const discount = await discountRepo.findByCode(normalised, options);

  if (!discount || !discount.active) {
    return { ok: false, error: "Invalid discount code." };
  }

  const today = localDateStr();
  if (discount.validFrom && today < String(discount.validFrom).slice(0, 10)) {
    return { ok: false, error: "Invalid discount code." };
  }
  if (discount.validUntil && today > String(discount.validUntil).slice(0, 10)) {
    return { ok: false, error: "Invalid discount code." };
  }
  if (discount.maxUses != null && discount.usedCount >= discount.maxUses) {
    return { ok: false, error: "Invalid discount code." };
  }

  // Specific message here because the customer needs actionable feedback.
  const total = Number(applicableTotal) || 0;
  if (discount.minOrderAmount != null && total < Number(discount.minOrderAmount)) {
    const min = Number(discount.minOrderAmount).toFixed(2);
    return { ok: false, error: `A minimum order of €${min} is required for this discount.` };
  }

  const amountDeducted = calculateDeduction(discount, total);
  return { ok: true, discount, amountDeducted };
}

// ---------------------------------------------------------------------------
// Async — application (must run inside an existing Sequelize transaction)
// ---------------------------------------------------------------------------

/**
 * Validates the discount code with a row-level lock, creates the OrderDiscount
 * snapshot, and atomically increments usedCount — all within the caller's
 * transaction. Throws on any validation failure so the caller's transaction
 * rolls back cleanly.
 *
 * @param {string}  orderId    - UUID of the newly-created Order
 * @param {string}  code       - Raw discount code from the checkout form
 * @param {Array}   orderLines - Plain objects with { price, quantity, vatRate, stripeTaxRateId, eventId }
 * @param {boolean} vatEnabled - storeSettingService.isCheckoutVatEnabled() result
 * @param {object}  options    - Must include { transaction: t }
 * @returns {Promise<number>} amountDeducted in EUR
 */
async function applyToOrder(orderId, code, orderLines, vatEnabled, options = {}) {
  const { transaction } = options;
  if (!transaction) {
    throw new Error("discount.service.applyToOrder must be called within a transaction.");
  }

  const normalised = String(code || "").trim().toUpperCase();
  if (!normalised) {
    const err = new Error("Invalid discount code.");
    err.status = 400;
    throw err;
  }

  // Row-level lock prevents two concurrent checkouts from both passing a
  // maxUses check and then both incrementing past the limit.
  const discount = await discountRepo.findByCode(normalised, { lock: true, transaction });

  if (!discount || !discount.active) {
    const err = new Error("Invalid discount code.");
    err.status = 400;
    throw err;
  }

  const today = localDateStr();
  if (discount.validFrom && today < String(discount.validFrom).slice(0, 10)) {
    const err = new Error("Invalid discount code.");
    err.status = 400;
    throw err;
  }
  if (discount.validUntil && today > String(discount.validUntil).slice(0, 10)) {
    const err = new Error("Invalid discount code.");
    err.status = 400;
    throw err;
  }
  if (discount.maxUses != null && discount.usedCount >= discount.maxUses) {
    const err = new Error("Invalid discount code.");
    err.status = 400;
    throw err;
  }

  const lineTotal = orderLines.reduce(
    (acc, line) => acc + (Number(line.price) || 0) * (Number(line.quantity) || 1),
    0,
  );

  if (discount.minOrderAmount != null && lineTotal < Number(discount.minOrderAmount)) {
    const min = Number(discount.minOrderAmount).toFixed(2);
    const err = new Error(`A minimum order of €${min} is required for this discount.`);
    err.status = 400;
    throw err;
  }

  const amountDeducted = calculateDeduction(discount, lineTotal);
  const vatDistribution = calculateVatDistribution(amountDeducted, orderLines, vatEnabled);

  await orderDiscountRepo.create(
    {
      orderId,
      discountId: discount.id,
      code: discount.code,
      type: discount.type,
      value: discount.value,
      amountDeducted,
      vatDistribution,
    },
    { transaction },
  );

  await discountRepo.incrementUsedCount(discount.id, { transaction });

  return amountDeducted;
}

// ---------------------------------------------------------------------------
// Admin CRUD
// ---------------------------------------------------------------------------

async function findAll(options) {
  return discountRepo.findAll(options);
}

async function findById(id, options) {
  return discountRepo.findById(id, options);
}

async function findByCode(code, options) {
  return discountRepo.findByCode(code, options);
}

/** Creates a new discount. Throws 409 if the code is already taken. */
async function create(data) {
  const taken = await discountRepo.isCodeTaken(data.code);
  if (taken) {
    const err = new Error("A discount with this code already exists.");
    err.status = 409;
    throw err;
  }
  return discountRepo.create(data);
}

/** Updates a discount. Re-checks code uniqueness if the code changed. */
async function update(id, data) {
  const existing = await discountRepo.findById(id);
  if (!existing) {
    const err = new Error("Discount not found.");
    err.status = 404;
    throw err;
  }
  const newCode = String(data.code || "").trim().toUpperCase();
  if (newCode !== existing.code) {
    const taken = await discountRepo.isCodeTaken(newCode, id);
    if (taken) {
      const err = new Error("A discount with this code already exists.");
      err.status = 409;
      throw err;
    }
  }
  return discountRepo.update(id, data);
}

async function deleteDiscount(id) {
  return discountRepo.delete(id);
}

module.exports = {
  // Pure helpers (exported for unit testing)
  calculateDeduction,
  calculateVatDistribution,
  // Validation (read-only)
  validateCode,
  // Application (transactional)
  applyToOrder,
  // Admin CRUD
  findAll,
  findById,
  findByCode,
  create,
  update,
  delete: deleteDiscount,
};
