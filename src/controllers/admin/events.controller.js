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
   * GET /admin/events/:eventId/registrants/:registrationId/edit
   */
  async registrantEditForm(req, res) {
    const { eventId, registrationId } = req.params;
    const event = await eventService.findByIdForAdmin(eventId);
    if (!event) {
      res.setFlash("error", "Event not found.");
      return res.redirect((req.adminPrefix || "") + "/events");
    }
    const data = await registrationService.getRegistrationForAdminEdit(registrationId, eventId);
    if (!data) {
      res.setFlash("error", "Registration not found.");
      return res.redirect((req.adminPrefix || "") + "/events/" + eventId + "/registrants");
    }
    const paidRegistrantCount = await registrationService.countPaidRegistrantsForEvent(eventId);
    res.render("admin/events/registrant-edit", {
      title: "Edit registrant",
      event,
      registration: data.registration,
      eventRow: data.event,
      meeting: data.meeting,
      paidRegistrantCount,
    });
  },

  /**
   * POST /admin/events/:eventId/registrants/:registrationId/retry-zoom
   */
  async registrantRetryZoom(req, res) {
    const { eventId, registrationId } = req.params;
    const redirectUrl = (req.adminPrefix || "") + "/events/" + eventId + "/registrants/" + registrationId + "/edit";
    try {
      const result = await registrationService.retryZoomSyncForRegistration(registrationId, eventId);
      if (!result.ok) {
        res.setFlash("error", result.error || "Zoom sync failed.");
      } else if (result.alreadySynced) {
        res.setFlash("success", "This registration is already linked to Zoom.");
      } else {
        res.setFlash("success", "Zoom sync completed.");
      }
    } catch (err) {
      res.setFlash("error", err.message || "Zoom sync failed.");
    }
    return res.redirect(302, redirectUrl);
  },

  /**
   * POST /admin/events/:eventId/registrants/:registrationId/cancel
   * Cancel a single registration from an event (admin action). Issues refund if applicable.
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
