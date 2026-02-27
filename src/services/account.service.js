const bcrypt = require("bcrypt");
const userRepo = require("../repos/user.repo");
const orderService = require("./order.service");
const { sequelize } = require("../db"); // Import sequelize instance
const SALT_ROUNDS = 10;

module.exports = {
  async register({ email, username, password }) {
    // Start a transaction
    const t = await sequelize.transaction();
    
    try {
      // Check email
      const existingEmail = await userRepo.findByEmail(email); // Reads often don't need the transaction lock if isolation level is standard, but good to keep consistent if using FOR UPDATE
      if (existingEmail) {
        const err = new Error("Email already in use.");
        err.status = 409;
        throw err;
      }

      // Check username
      if (username) {
        const existingUsername = await userRepo.findByUsername(username);
        if (existingUsername) {
          const err = new Error("Username already taken.");
          err.status = 409;
          throw err;
        }
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await userRepo.create({ email, username, passwordHash }, { transaction: t });

      await t.commit();

      // Claim any paid guest orders that used this email (e.g. checkout as guest then register)
      try {
        await orderService.claimGuestOrdersByEmail(email, user.id);
      } catch (claimErr) {
        const logger = require("../config/logger");
        logger.warn("Claim guest orders after register failed", { userId: user.id, error: claimErr });
      }

      return user;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  },
};
