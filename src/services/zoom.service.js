/**
 * Zoom account service — manages admin Zoom OAuth account records.
 * Controllers use this instead of accessing AdminZoomAccount model directly.
 */
const adminZoomAccountRepo = require("../repos/adminZoomAccount.repo");

module.exports = {
  async findAccountByUserId(userId) {
    return await adminZoomAccountRepo.findByUserId(userId);
  },

  /**
   * Create or update the Zoom account for an admin user.
   * If a record already exists for the userId it is updated; otherwise a new one is created.
   * @param {object} data - { userId, zoomUserId, accessToken, refreshToken, tokenExpiresAt }
   */
  async saveAccount(data) {
    const existing = await adminZoomAccountRepo.findByUserId(data.userId);
    if (existing) {
      return await adminZoomAccountRepo.update(existing.id, data);
    }
    return await adminZoomAccountRepo.create(data);
  },
};
