"use strict";

/**
 * Rename provider-specific column names to generic ones for meeting abstraction:
 * - registrations.zoomRegistrantId -> providerRegistrantId
 * - event_meetings.hostZoomAccountId -> hostAccountId
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.renameColumn(
      "registrations",
      "zoomRegistrantId",
      "providerRegistrantId"
    );
    await queryInterface.renameColumn(
      "event_meetings",
      "hostZoomAccountId",
      "hostAccountId"
    );
  },

  async down(queryInterface) {
    await queryInterface.renameColumn(
      "registrations",
      "providerRegistrantId",
      "zoomRegistrantId"
    );
    await queryInterface.renameColumn(
      "event_meetings",
      "hostAccountId",
      "hostZoomAccountId"
    );
  },
};
