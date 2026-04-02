const eventService = require("../../services/event.service");
const registrationService = require("../../services/registration.service");
const { validateRegistrantAdminUpdate } = require("../../validators/registrantAdmin.schema");

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
   * POST /admin/events/:eventId/registrants/:registrationId/update
   */
  async registrantUpdate(req, res) {
    const { eventId, registrationId } = req.params;
    const redirectUrl = (req.adminPrefix || "") + "/events/" + eventId + "/registrants/" + registrationId + "/edit";
    const parsed = validateRegistrantAdminUpdate(req.body);
    if (!parsed.ok) {
      const msg = parsed.errors && parsed.errors[0] ? parsed.errors[0].message : "Invalid details.";
      res.setFlash("error", msg);
      return res.redirect(302, redirectUrl);
    }
    try {
      const result = await registrationService.updateRegistrationForAdmin(registrationId, eventId, parsed.data);
      if (!result.ok) {
        res.setFlash("error", result.error || "Could not update registrant.");
      } else {
        res.setFlash("success", "Registrant details saved.");
      }
    } catch (err) {
      res.setFlash("error", err.message || "Could not update registrant.");
    }
    return res.redirect(302, redirectUrl);
  },

  /**
   * POST /admin/events/:eventId/registrants/:registrationId/retry-zoom
   * Adds the attendee to the Zoom meeting (admin recovery).
   */
  async registrantRetryZoom(req, res) {
    const { eventId, registrationId } = req.params;
    const redirectUrl = (req.adminPrefix || "") + "/events/" + eventId + "/registrants/" + registrationId + "/edit";
    try {
      const result = await registrationService.retryZoomSyncForRegistration(registrationId, eventId);
      if (!result.ok) {
        res.setFlash("error", result.error || "Could not add registrant to Zoom.");
      } else if (result.alreadySynced) {
        res.setFlash("success", "This registration is already linked to Zoom.");
      } else {
        res.setFlash("success", "Registrant added to Zoom.");
      }
    } catch (err) {
      res.setFlash("error", err.message || "Could not add registrant to Zoom.");
    }
    return res.redirect(302, redirectUrl);
  },

  /**
   * POST /admin/events/:eventId/registrants/:registrationId/remove-zoom
   * Removes the attendee from Zoom only; registration remains active.
   */
  async registrantRemoveZoom(req, res) {
    const { eventId, registrationId } = req.params;
    const redirectUrl = (req.adminPrefix || "") + "/events/" + eventId + "/registrants/" + registrationId + "/edit";
    try {
      const result = await registrationService.removeZoomFromRegistration(registrationId, eventId);
      if (!result.ok) {
        res.setFlash("error", result.error || "Could not remove registrant from Zoom.");
      } else if (result.alreadyRemoved) {
        res.setFlash("success", "This registration was not linked to Zoom.");
      } else {
        res.setFlash("success", "Registrant removed from Zoom. You can edit details or add them again.");
      }
    } catch (err) {
      res.setFlash("error", err.message || "Could not remove registrant from Zoom.");
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
