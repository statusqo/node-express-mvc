/**
 * User service - production-grade user operations.
 * Handles cascading deletes explicitly to avoid FK constraint failures across SQLite/PostgreSQL.
 * Follows Routes → Controllers → Services → Repos → Models architecture.
 */
const { sequelize } = require("../db/client");
const userRepo = require("../repos/user.repo");
const paymentMethodRepo = require("../repos/paymentMethod.repo");
const cartRepo = require("../repos/cart.repo");
const addressRepo = require("../repos/address.repo");
const orderRepo = require("../repos/order.repo");
const logger = require("../config/logger");

/**
 * Delete a user and all related data in dependency order within a transaction.
 * Does not rely on DB-level CASCADE; handles everything explicitly for reliability.
 *
 * @param {string} id - User UUID
 * @returns {Promise<{ deleted: boolean; error?: string }>}
 */
async function deleteUser(id) {
  if (!id) {
    return { deleted: false, error: "User ID is required." };
  }

  const user = await userRepo.findById(id);
  if (!user) {
    return { deleted: false, error: "User not found." };
  }

  const t = await sequelize.transaction();
  try {
    await paymentMethodRepo.deleteByUserId(id, { transaction: t });

    const carts = await cartRepo.findAllByUserId(id, { transaction: t });
    for (const cart of carts) {
      await cartRepo.delete(cart.id, { transaction: t });
    }

    await addressRepo.unlinkUser(id, { transaction: t });
    await orderRepo.unlinkUser(id, { transaction: t });
    await userRepo.delete(id, { transaction: t });

    await t.commit();
    logger.info("User deleted", { userId: id });
    return { deleted: true };
  } catch (err) {
    await t.rollback();
    logger.error("User delete failed", { userId: id, error: err.message, stack: err.stack });
    return {
      deleted: false,
      error: err.message || "Failed to delete user.",
    };
  }
}

/**
 * List all users for admin (excludes password hash).
 * @param {object} [options] - Sequelize options
 */
async function listUsers(options = {}) {
  return await userRepo.findAll(options);
}

/**
 * Get user by ID for admin/session (excludes password hash).
 * @param {string} id - User UUID
 * @param {object} [options] - Sequelize options
 */
async function getUserById(id, options = {}) {
  return await userRepo.findByIdForAdmin(id, options);
}

/**
 * Find user by email.
 * @param {string} email - User email
 * @param {object} [options] - Sequelize options
 */
async function findByEmail(email, options = {}) {
  return await userRepo.findByEmail(email, options);
}

/**
 * Find user by username.
 * @param {string} username - Username
 * @param {object} [options] - Sequelize options
 */
async function findByUsername(username, options = {}) {
  return await userRepo.findByUsername(username, options);
}

/**
 * Create a new user.
 * @param {object} data - { email, username?, passwordHash, isAdmin? }
 * @param {object} [options] - Sequelize options
 */
async function createUser(data, options = {}) {
  return await userRepo.create(data, options);
}

/**
 * Update a user.
 * @param {string} id - User UUID
 * @param {object} data - Partial user fields
 * @param {object} [options] - Sequelize options
 */
async function updateUser(id, data, options = {}) {
  return await userRepo.update(id, data, options);
}

/**
 * Update user profile (forename, surname, mobile). Used by account controller.
 * @param {string} id - User UUID
 * @param {object} data - { forename?, surname?, mobile? }
 * @param {object} [options] - Sequelize options
 */
async function updateProfile(id, data, options = {}) {
  return await userRepo.update(id, data, options);
}

module.exports = {
  deleteUser,
  listUsers,
  getUserById,
  findByEmail,
  findByUsername,
  createUser,
  updateUser,
  updateProfile,
};
