const { StoreSetting } = require("../models");

module.exports = {
  async getByKey(key, options = {}) {
    return await StoreSetting.findByPk(key, options);
  },

  async setByKey(key, value, options = {}) {
    const str = value == null ? null : String(value);
    await StoreSetting.upsert({ key, value: str }, options);
    return await StoreSetting.findByPk(key, options);
  },
};
