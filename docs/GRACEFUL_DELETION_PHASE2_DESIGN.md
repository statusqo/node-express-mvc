# Phase 2 & 3: Graceful Deletion & Cascading Operations

This document outlines approaches to handle the dangerous operations of:
1. **Point 2**: Gracefully handling Zoom meeting deletions on the app side
2. **Point 3**: Gracefully handling event deletions while keeping Zoom consistent
3. **Both**: Safe unregistration, refunding, and cascading cleanup

---

## Design Philosophy

**Principle**: Never silently cascade destructive operations. Always:
- Require explicit admin confirmation
- Log all changes (audit trail)
- Provide rollback/recovery options where possible
- Handle partial failures gracefully (some refunds succeed, others fail)

---

## Point 2: Remote Meeting Deletion (Zoom deletes, app must react)

### Current State
- No webhook support implemented
- No mechanism to detect external deletions
- Stale EventMeeting rows remain in DB

### Proposed Solution: Webhook-Based Detection + Confirmation Flow

#### 2.1 Webhook Infrastructure
**File:** `src/routes/webhooks/index.js` (new)

```javascript
const express = require("express");
const zoomWebhookController = require("../../controllers/webhooks/zoom.controller");

const router = express.Router();

// Zoom webhook (requires verification per Zoom's spec)
router.post("/zoom", async (req, res) => {
  // 1. Verify webhook signature (Zoom sends X-Zm-Request-Timestamp + X-Zm-Signature)
  // 2. Extract event type from body: req.body.event, req.body.payload.object
  // 3. Enqueue async task or handle immediately
  // 4. Return 200 immediately to Zoom
});

module.exports = router;
```

#### 2.2 Async Task Queue
Add a simple job queue (e.g., `node-queue` or `bull` with Redis):
- **Job Type**: `meeting.remote_deleted`
- **Payload**: `{ providerMeetingId, eventId, adminId }`
- **Handler**: Queues a notification for admin review

#### 2.3 Notification/Alert System
**Model:** `src/models/Alert.js` (new)

```javascript
const Alert = sequelize.define("Alert", {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  adminId: { type: DataTypes.UUID, allowNull: false }, // which admin sees this
  type: { type: DataTypes.STRING, allowNull: false }, // 'meeting.deleted', 'sync.failed', etc.
  severity: { type: DataTypes.STRING, defaultValue: 'warning' }, // 'info'|'warning'|'error'
  title: { type: DataTypes.STRING, allowNull: false },
  message: { type: DataTypes.TEXT },
  actionUrl: { type: DataTypes.STRING }, // link to review/action page
  metadata: { type: DataTypes.JSON }, // { eventId, meetingId, registrationCount, totalRefund, etc. }
  acknowledged: { type: DataTypes.BOOLEAN, defaultValue: false },
  actionTaken: { type: DataTypes.BOOLEAN, defaultValue: false },
  actionLog: { type: DataTypes.TEXT }, // what action admin took
  expiresAt: { type: DataTypes.DATE },
  timestamps: true,
});
```

#### 2.4 Admin Alert Dashboard
**File:** `src/views/admin/alerts/index.pug` (new)

Shows unacknowledged alerts:
- Meeting deleted remotely → "Review and cascade delete" button
- Sync failed → "Review error and retry"
- etc.

#### 2.5 Cascade Delete Confirmation
**Route:** `GET /admin/alerts/:alertId/review` → shows:
- Which event/meeting was deleted
- Number of registrations + total refund amount
- Confirmation to proceed or dismiss
- Option to manually clean up (keep Meeting/Event but mark archived)

**Route:** `POST /admin/alerts/:alertId/confirm-cascade` → executes:
1. Load all Registrations for the event
2. For each registration:
   - Look up the Order
   - Issue refund via `orderService.fullRefund(orderId, reason='Meeting deleted on provider')`
   - Mark Registration as `status: 'cancelled'`
3. Delete EventMeeting row
4. Delete Event row
5. Log audit entry
6. Mark alert as `actionTaken: true`

---

## Point 3: Event Deletion from App (cascade to Zoom)

### Current State
- `eventService.delete()` only deletes DB rows
- No Zoom cleanup
- Orphaned meetings remain accessible on Zoom

### Proposed Solution: Optional Cascade Delete

#### 3.1 Event Deletion Flow

Modify `eventService.delete()` to:
1. Check if event has EventMeeting
2. If yes AND event has registrations:
   - Don't allow direct delete
   - Return `{ deleted: false, requiresConfirmation: true, registrationCount: N, estimatedRefund: $ }`
3. If allowed (no regs OR admin confirmed cascade):
   - Call `provider.deleteMeeting()` (new method in interface)
   - Unregister all registrations
   - Issue refunds
   - Delete the event

#### 3.2 Meeting Interface Enhancement
**File:** `src/gateways/meeting.interface.js` (update)

Add required method signature:
```javascript
/**
 * @interface MeetingProvider
 * @method deleteMeeting(meeting) - delete a remote meeting
 * @method addRegistrant(meeting, registration) - add attendee
 * @method createMeeting(event, userId) - create meeting
 */
```

#### 3.3 Zoom Gateway Update
**File:** `src/gateways/zoom.meeting.gateway.js` (update)

Add `deleteMeeting`:
```javascript
async function deleteMeeting(meeting) {
  if (!meeting.providerMeetingId) {
    throw new Error("No provider meeting ID to delete.");
  }
  const account = await AdminZoomAccount.findByPk(meeting.hostAccountId);
  if (!account?.accessToken) {
    throw new Error("Zoom access token missing.");
  }
  
  await zoomRequest(account.accessToken, `/meetings/${meeting.providerMeetingId}`, {
    method: "DELETE",
  });
  
  logger.info({ meetingId: meeting.providerMeetingId }, "Zoom meeting deleted");
}

module.exports = { createMeeting, addRegistrant, deleteMeeting };
```

#### 3.4 Event Deletion Controller (Events Page)
**File:** `src/controllers/admin/eventTypeProducts.controller.js` (update)

Current flow (inline delete via `saveEventsForProduct`):
- Admin includes event in `deletedIds` array
- `eventService.delete()` is called per event
- Currently fails if registrations exist

**New flow**:
1. When admin clicks "Remove" on event row:
   - Send AJAX request to check if deletion requires confirmation
   - If yes: show modal with "Confirm Cascade Deletion"
   - If no: proceed immediately
2. Modal shows:
   - Count of registrations
   - Estimated total refund
   - Warning: "This will unregister all users, issue refunds, and delete the meeting."
   - Buttons: "Cancel" | "Confirm Delete"
3. On confirm: POST to new endpoint `/admin/webinars/{productSlug}/delete-event` with event ID
4. Handler calls `eventService.cascadeDeleteEvent(eventId, adminId, reason='Admin deleted event')`

#### 3.5 New Service Method
**File:** `src/services/event.service.js` (add)

```javascript
/**
 * Cascade delete: unregister all users, refund, delete Zoom meeting, delete event.
 * Requires admin confirmation (should be pre-validated at controller level).
 * @param {string} eventId
 * @param {string} adminId - for audit logging
 * @param {string} reason - refund reason
 * @returns {{ deleted: boolean, refundsIssued: number, errors?: [] }}
 */
async cascadeDeleteEvent(eventId, adminId, reason = "Event cancelled", options = {}) {
  const t = options.transaction || (await sequelize.transaction());
  const ownTransaction = !options.transaction;
  
  try {
    const event = await eventRepo.findById(eventId, {
      include: [
        { model: EventMeeting, as: "EventMeeting" },
        { model: Registration, as: "Registrations", include: [OrderLine] },
      ],
      ...options,
      transaction: t,
    });
    
    if (!event) throw new Error("Event not found.");
    
    let refundCount = 0;
    const errors = [];
    
    // 1. Unregister and refund all registrations
    for (const reg of event.Registrations || []) {
      try {
        // Mark registration as cancelled
        await reg.update({ status: 'cancelled' }, { transaction: t });
        
        // Refund the order line
        if (reg.orderId) {
          const refundRes = await require("./order.service").refundOrderLine(
            reg.orderId,
            reg.orderLineId,
            { reason, adminId },
            { transaction: t }
          );
          if (refundRes.success) refundCount++;
        }
      } catch (e) {
        errors.push({ registrationId: reg.id, error: e.message });
      }
    }
    
    // 2. Delete Zoom meeting
    if (event.EventMeeting) {
      try {
        const provider = getMeetingProvider();
        if (provider?.deleteMeeting) {
          await provider.deleteMeeting(event.EventMeeting);
        }
        await event.EventMeeting.destroy({ transaction: t });
      } catch (e) {
        errors.push({ stage: 'meeting_delete', error: e.message });
      }
    }
    
    // 3. Delete the event
    await eventRepo.delete(eventId, { transaction: t });
    
    // 4. Audit log
    await require("../models").AuditLog?.create?.(
      {
        adminId,
        action: 'event_cascade_delete',
        resourceType: 'Event',
        resourceId: eventId,
        details: JSON.stringify({ refundCount, errors, reason }),
      },
      { transaction: t }
    );
    
    if (ownTransaction) await t.commit();
    
    return { deleted: true, refundsIssued: refundCount, errors: errors.length > 0 ? errors : undefined };
  } catch (e) {
    if (ownTransaction) await t.rollback();
    throw e;
  }
}
```

---

## Point 2 & 3: Shared Unregistration/Refund Logic

Both scenarios need robust refund handling. Recommend creating a dedicated service:

### `src/services/refund.service.js` (new)

```javascript
/**
 * Refund an order line and update transaction records.
 * Used by cascade deletions, event cancellations, admin manual refunds.
 */
module.exports = {
  async refundOrderLine(orderId, orderLineId, { reason, adminId }, options = {}) {
    const transaction = options.transaction || (await sequelize.transaction());
    const ownTx = !options.transaction;
    
    try {
      const orderLine = await OrderLine.findByPk(orderLineId, { transaction });
      const order = await Order.findByPk(orderId, { transaction });
      
      if (!orderLine || !order) throw new Error("Order line or order not found.");
      
      // Determine refund processor (Stripe, PayPal, etc.)
      const lastTx = await Transaction.findOne({
        where: { orderId },
        order: [['createdAt', 'DESC']],
        transaction,
      });
      
      if (!lastTx) throw new Error("No payment transaction found.");
      
      // Issue refund via gateway
      const refundResult = await require("../gateways/index").getPaymentGateway(lastTx.provider || 'stripe')
        .refund(lastTx.providerTransactionId, orderLine.price);
      
      if (!refundResult.success) throw new Error(refundResult.error || "Refund failed.");
      
      // Create refund transaction
      await Transaction.create({
        orderId,
        provider: lastTx.provider,
        type: 'refund',
        amount: orderLine.price,
        providerTransactionId: refundResult.providerRefundId,
        status: 'completed',
        metadata: JSON.stringify({ reason, adminId, originalTxId: lastTx.id }),
      }, { transaction });
      
      // Create or update RefundRequest
      await RefundRequest.create({
        orderId,
        requestedByUserId: order.userId || null,
        processedByUserId: adminId,
        reason,
        status: 'approved',
        refundAmount: orderLine.price,
      }, { transaction });
      
      if (ownTx) await transaction.commit();
      return { success: true, refundAmount: orderLine.price };
    } catch (e) {
      if (ownTx) await transaction.rollback();
      return { success: false, error: e.message };
    }
  },

  /**
   * Refund an entire order (all lines).
   */
  async refundFullOrder(orderId, { reason, adminId }, options = {}) {
    // Similar pattern, iterate all OrderLines
  },
};
```

---

## UI/UX for Dangerous Operations

### Pattern 1: Confirmation Modal (Point 3: Delete Event)

```pug
.modal-overlay(id="deleteEventModal")
  .modal
    h3 Delete Event?
    p This will:
      ul
        li Unregister #{event.registrationCount} attendees
        li Issue refunds totaling $#{event.totalRefund}
        li Delete the Zoom meeting
        li Delete the event permanently
    .modal-actions
      button.btn.btn-secondary(type="button" onclick="closeModal()") Cancel
      button.btn.btn-danger(type="button" onclick="confirmDelete()") Delete Event
```

### Pattern 2: Alert Review (Point 2: Remote Deletion)

```pug
.alert-review
  h3 Meeting Deleted on Provider
  p The meeting "Event 2026-02-23 16:20" was deleted on Zoom.
  .details
    p Registrations: 5
    p Estimated refund: $250
  .actions
    button.btn.btn-warning(onclick="showCascadeModal()") Review & Cascade Delete
    button.btn.btn-secondary(onclick="dismissAlert()") Dismiss (Keep Event)
```

---

## Audit Trail / Logging

Create `src/models/AuditLog.js`:
```javascript
const AuditLog = sequelize.define("AuditLog", {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  adminId: { type: DataTypes.UUID },
  action: { type: DataTypes.STRING }, // 'event_cascade_delete', 'meeting_remote_deleted', etc.
  resourceType: { type: DataTypes.STRING }, // 'Event', 'EventMeeting', 'Registration'
  resourceId: { type: DataTypes.UUID },
  details: { type: DataTypes.JSON }, // extra context
  createdAt: { type: DataTypes.DATE },
});
```

Every deletion or cascade operation logs here.

---

## Summary Table

| Scenario | User | Trigger | Confirmation | Side Effects | Recovery |
|----------|------|---------|--------------|--------------|----------|
| **Point 2: Remote Delete** | Admin | Webhook from Zoom | Review alert + explicit "Cascade" | Unregister, refund, delete event | Can be dismissed; event remains in DB (marked archived) |
| **Point 3: App Delete** | Admin | Click "Remove" on event | Modal if registrations exist | Call `cascadeDeleteEvent()` | Refunds issued; deleted events logged in audit trail |

---

## Implementation Recommendations

### Phase 2A (Recommended First)
- Implement `cascadeDeleteEvent()` service method
- Add confirmation modal UI for event deletion (Point 3)
- Add `deleteMeeting()` to Zoom gateway
- Modify `eventTypeProducts.controller` to call cascade delete

### Phase 2B (After 2A Stabilizes)
- Add webhook support for Zoom (`meeting.deleted` event)
- Implement alert system
- Add alert review UI
- Test webhook delivery (use ngrok for local dev)

### Phase 2C (Future)
- Soft-delete / archive support
- Partial refund handling (if admin wants to keep event but cancel some registrations)
- Batch deletion UI (delete multiple events at once)

---

## Questions for Your Review

1. **On webhook delays**: Should remote deletions be queued as async jobs or handled immediately?
   - **Recommendation**: Queue async; handle immediately for critical operations. Use Redis queue.

2. **On confirmation cadence**: If admin dismisses a "remote delete" alert, should the webhook be retried?
   - **Recommendation**: No; alert persists. Admin can manually trigger cascade later.

3. **On refund failures**: If 5 out of 10 refunds fail, should the cascade stop or continue?
   - **Recommendation**: Continue and report all failures in result; don't cascade delete until all refunds succeed.

4. **On audit trail visibility**: Should admins have a dedicated "Audit Log" viewer?
   - **Recommendation**: Yes, add `/admin/audit-logs` as a future phase.
