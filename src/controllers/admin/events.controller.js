const eventService = require("../../services/event.service");
const registrationService = require("../../services/registration.service");

module.exports = {
  /**
   * GET /admin/events
   * All events overview. ?view=past shows past events; default shows upcoming.
   */
  async index(req, res) {
    const view = req.query.view === "past" ? "past" : "upcoming";

    const events = view === "past"
      ? await eventService.findPastForAdmin()
      : await eventService.findUpcomingForAdmin();

    res.render("admin/events/index", {
      title: "Events",
      events,
      view,
    });
  },

  /**
   * POST /admin/events/:eventId/registrants/:registrationId/cancel
   * Cancel a single registration (admin action). Issues refund if applicable.
   */
  async cancelRegistrant(req, res) {
    const { eventId, registrationId } = req.params;
    const registrantsUrl = (req.adminPrefix || "") + "/events/" + eventId + "/registrants";
    try {
      const result = await registrationService.cancelRegistration(registrationId, eventId);
      if (!result.cancelled) {
        res.setFlash("error", result.error || "Could not cancel registration.");
        return res.redirect(registrantsUrl);
      }
      res.setFlash("success", "Registration cancelled successfully.");
    } catch (err) {
      res.setFlash("error", err.message || "Could not cancel registration.");
    }
    return res.redirect(registrantsUrl);
  },

  /**
   * GET /admin/events/:eventId/registrants
   * Registrant list for a specific event.
   */
  async registrants(req, res) {
    const { eventId } = req.params;

    const event = await eventService.findByIdForAdmin(eventId);
    if (!event) {
      res.setFlash("error", "Event not found.");
      return res.redirect((req.adminPrefix || "") + "/events");
    }

    const [registrants, paidRegistrantCount] = await Promise.all([
      registrationService.findRegistrantsForEvent(eventId),
      registrationService.countPaidRegistrantsForEvent(eventId),
    ]);

    res.render("admin/events/registrants", {
      title: "Registrants",
      event,
      registrants,
      paidRegistrantCount,
    });
  },
};
