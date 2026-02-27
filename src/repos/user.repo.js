const { User } = require("../models");
const { Op } = require("sequelize");

module.exports = {
  async findById(id, options = {}) {
    if (!id) return null;
    return await User.findByPk(id, options);
  },

  async findByIdForAdmin(id, options = {}) {
    if (!id) return null;
    return await User.findByPk(id, {
      attributes: { exclude: ["passwordHash"] },
      ...options,
    });
  },

  async findByEmail(email, options = {}) {
    if (!email) return null;
    return await User.findOne({ 
      where: { email: String(email).toLowerCase() },
      ...options
    });
  },

  async findByUsername(username, options = {}) {
    if (!username) return null;
    return await User.findOne({ 
      where: { username: String(username) },
      ...options
    });
  },

  async findByGoogleId(googleId, options = {}) {
    if (!googleId || typeof googleId !== "string") return null;
    return await User.findOne({
      where: { googleId: String(googleId).trim() },
      attributes: { exclude: ["passwordHash"] },
      ...options,
    });
  },

  async findByIdentifier(identifier, options = {}) {
    const trimmed = typeof identifier === 'string' ? identifier.trim() : '';
    if (!trimmed) return null;
    return await User.findOne({
      where: {
        [Op.or]: [
          { email: trimmed.toLowerCase() },
          { username: trimmed }
        ]
      },
      attributes: ["id", "email", "username", "passwordHash", "isAdmin", "forename", "surname", "mobile", "stripeCustomerId", "createdAt", "updatedAt"],
      ...options
    });
  },

  async findAll(options = {}) {
    return await User.findAll({
      order: [["createdAt", "DESC"]],
      attributes: { exclude: ["passwordHash"] },
      ...options,
    });
  },

  async create({ email, username, passwordHash, isAdmin, googleId, forename, surname }, options = {}) {
    const data = {
      email: String(email).toLowerCase(),
      username: username ? String(username) : null,
      passwordHash: passwordHash || null,
      isAdmin: isAdmin === true,
    };
    if (googleId !== undefined && googleId !== null) data.googleId = String(googleId).trim();
    if (forename !== undefined) data.forename = forename ? String(forename).trim() : null;
    if (surname !== undefined) data.surname = surname ? String(surname).trim() : null;
    return await User.create(data, options);
  },

  async update(id, data, options = {}) {
    const user = await User.findByPk(id, options);
    if (!user) return null;
    const { email, username, passwordHash, isAdmin, forename, surname, mobile, stripeCustomerId, googleId } = data;
    const updateData = {};
    if (email !== undefined) updateData.email = String(email).toLowerCase();
    if (username !== undefined) updateData.username = username ? String(username) : null;
    if (passwordHash !== undefined) updateData.passwordHash = passwordHash;
    if (isAdmin !== undefined) updateData.isAdmin = !!isAdmin;
    if (forename !== undefined) updateData.forename = forename ? String(forename).trim() : null;
    if (surname !== undefined) updateData.surname = surname ? String(surname).trim() : null;
    if (mobile !== undefined) updateData.mobile = mobile ? String(mobile).trim() : null;
    if (stripeCustomerId !== undefined) updateData.stripeCustomerId = stripeCustomerId ? String(stripeCustomerId).trim() : null;
    if (googleId !== undefined) updateData.googleId = googleId ? String(googleId).trim() : null;
    return await user.update(updateData, options);
  },

  async delete(id, options = {}) {
    const user = await User.findByPk(id, options);
    if (!user) return false;
    await user.destroy(options);
    return true;
  },

  async count(options = {}) {
    return await User.count(options);
  },
};
