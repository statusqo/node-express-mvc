const { EventMeeting } = require("../models");

module.exports = {
  async findByEventId(eventId, options = {}) {
    if (!eventId) return null;
    return await EventMeeting.findOne({ where: { eventId }, ...options });
  },

  async findByZoomMeetingId(zoomMeetingId, options = {}) {
    if (!zoomMeetingId) return null;
    return await EventMeeting.findOne({ where: { zoomMeetingId }, ...options });
  },

  async create(data, options = {}) {
    return await EventMeeting.create(data, options);
  },

  async destroyByEventId(eventId, options = {}) {
    if (!eventId) return;
    await EventMeeting.destroy({ where: { eventId }, ...options });
  },
};
