const { UserGatewayProfile } = require("../models");

module.exports = {
  async findByUserAndGateway(userId, gateway, options = {}) {
    if (!userId || !gateway) return null;
    return await UserGatewayProfile.findOne({
      where: { userId, gateway },
      ...options,
    });
  },

  async findByUser(userId, options = {}) {
    if (!userId) return [];
    return await UserGatewayProfile.findAll({
      where: { userId },
      ...options,
    });
  },

  async create(data, options = {}) {
    return await UserGatewayProfile.create(data, options);
  },

  async upsert(data, options = {}) {
    const { userId, gateway, externalCustomerId } = data;
    const existing = await this.findByUserAndGateway(userId, gateway, options);
    if (existing) {
      await existing.update({ externalCustomerId }, options);
      return existing;
    }
    return await this.create(data, options);
  },

  async update(id, data, options = {}) {
    const row = await UserGatewayProfile.findByPk(id, options);
    if (!row) return null;
    return await row.update(data, options);
  },

  async deleteByUserId(userId, options = {}) {
    if (!userId) return 0;
    const result = await UserGatewayProfile.destroy({
      where: { userId },
      ...options,
    });
    return result;
  },
};
