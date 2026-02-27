# Meeting Sync Feature Implementation Plan

## Overview
This document outlines the complete implementation of the meeting synchronization feature (Phase 1), which flags events as synced/unsynced and provides a centralized place to sync all events at once.

---

## Phase 1: Meeting Sync Status Flag & Centralized Sync

### 1.1 Database Migration
**File:** `src/db/migrations/[TIMESTAMP]-add-meeting-sync-state.js`

Create a new migration that:
- Adds `meetingSyncState` column to `events` table
  - Type: VARCHAR(20) NOT NULL
  - DEFAULT: 'unsynced'
  - Comment: "Status: 'unsynced'|'pending'|'synced'|'error'"
- Adds `meetingSyncError` column to `events` table
  - Type: TEXT NULL
  - Comment: "Error message if sync failed"

### 1.2 Event Model Update
**File:** `src/models/Event.js`

Add these fields:
```javascript
meetingSyncState: {
  type: DataTypes.STRING(20),
  allowNull: false,
  defaultValue: 'unsynced',
  comment: "Status: 'unsynced'|'pending'|'synced'|'error'"
},
meetingSyncError: {
  type: DataTypes.TEXT,
  allowNull: true,
  comment: "Error message if sync failed"
},
```

### 1.3 Event Repository Enhancement
**File:** `src/repos/event.repo.js`

Add new methods:
- `findUnsynced(options={})` - returns all events with `meetingSyncState !== 'synced'`
- `findBySyncState(state, options={})` - filter by state
- `updateSyncState(eventId, state, errorMsg=null, options={})` - atomic update of state + error

### 1.4 Event Service Enhancement
**File:** `src/services/event.service.js`

Modify `ensureMeetingForOnlineEvent`:
- On method entry, set event's `meetingSyncState` to 'pending'
- On success (after creating EventMeeting), set to 'synced' and clear error
- On error, set to 'error' and store error message in `meetingSyncError`

Add new method `syncAllUnsynced(userId, options={})`:
```javascript
/**
 * Sync all unsynced online events (idempotent).
 * Used by admin from Settings → Meeting Provider page.
 * @param {string} userId - Admin user id
 * @param {object} options - Sequelize options
 * @returns {{ synced: number, failed: number, errors: Array<{eventId, error}> }}
 */
async syncAllUnsynced(userId, options={}) {
  const unsynced = await eventRepo.findUnsynced(options);
  const unsyncedOnline = unsynced.filter(ev => ev.isOnline);
  
  const result = { synced: 0, failed: 0, errors: [] };
  for (const ev of unsyncedOnline) {
    const syncRes = await this.ensureMeetingForOnlineEvent(ev.id, userId, options);
    if (syncRes.created) {
      result.synced++;
    } else if (syncRes.error) {
      result.failed++;
      result.errors.push({ eventId: ev.id, error: syncRes.error });
    }
  }
  return result;
}
```

### 1.5 New Admin Settings Controller
**File:** `src/controllers/admin/settings.controller.js`

Create new controller with methods:
- `meetingProviderPage(req, res)` - shows Meeting Provider settings
  - Counts unsynced events
  - Displays Zoom connection status
  - Shows list of unsynced events (if any)
- `syncAllEvents(req, res)` - POST handler that calls `eventService.syncAllUnsynced()`
  - Returns result with counts and flash message
  - Redirects back to settings page

### 1.6 Admin Routes
**File:** `src/routes/admin/index.js`

Add new routes (after existing ones, before other resource CRUDs):
```javascript
// Meeting Provider Settings
router.get("/settings/meeting-provider", asyncHandler(settingsController.meetingProviderPage));
router.post("/settings/meeting-provider/sync-all", asyncHandler(settingsController.syncAllEvents));
```

### 1.7 Meeting Provider Settings View
**File:** `src/views/admin/settings/meeting-provider.pug`

Template should display:
- Heading: "Meeting Provider Settings"
- Flash messages (if any)
- **Zoom Connection** section:
  - Status badge (green if connected, red if not)
  - "Connect Zoom" button linking to `/admin/zoom/connect`
- **Events Sync** section:
  - Badge showing count of unsynced events (if > 0)
  - If unsynced events exist:
    - List showing: event startDate, startTime, product title, sync state
    - "Sync All Events" button (POST to `/admin/settings/meeting-provider/sync-all`)
  - If all synced:
    - Message: "All online events are in sync with your meeting provider."
  - If error:
    - Show list of events that failed to sync + error messages

### 1.8 Admin Sidebar Navigation Update
**File:** `src/views/fragments/admin/dash-nav.pug`

Replace or relocate the "Connect Zoom" link:
- Old: Direct link to `/admin/zoom/connect`
- New: Link to `/admin/settings/meeting-provider`
  - Optional: Add notification badge if unsynced events exist
  - Badge should be visibly distinct (e.g., red dot or "!" icon)

### 1.9 Event Type Products Events List View
**File:** `src/views/admin/event-type-products/events.pug`

Enhance the events table to show sync status:
- Add column: **Sync Status** (before Actions)
- For each event row:
  - If `event.isOnline && event.meetingSyncState === 'synced'`: green checkmark ✓ or circle
  - If `event.isOnline && event.meetingSyncState === 'unsynced'`: red dash ✗ or circle
  - If `event.isOnline && event.meetingSyncState === 'error'`: warning icon + hover tooltip with error message
  - If not online: N/A or blank
- Optional: Add a tooltip on hover showing the error message

### 1.10 Zoom Controller Enhancement
**File:** `src/controllers/admin/zoom.controller.js`

Modify `callback` method:
- After successfully storing `AdminZoomAccount`, set all previously unsynced events to `meetingSyncState = 'unsynced'` (resets them for sync on next save)
- Flash message: "Zoom account connected. Please sync existing events if needed."

---

## Phase 2: Graceful Deletion (Future)

Once Phase 1 is complete and working, implement:
- Webhook handlers for Zoom meeting deletion
- Service layer for cascading deletion (refunds + unregister + cleanup)
- Admin confirmation flow before cascade
- Archiving/soft-deletion support

---

## Implementation Checklist

### Database & Models
- [ ] Create migration file
- [ ] Update Event model with new fields
- [ ] Verify migration runs and tables are correct

### Repository Layer
- [ ] Add `findUnsynced()` method
- [ ] Add `findBySyncState()` method
- [ ] Add `updateSyncState()` method

### Service Layer
- [ ] Modify `ensureMeetingForOnlineEvent()` to set sync states
- [ ] Implement new `syncAllUnsynced()` method
- [ ] Add tests (unit) for sync state transitions

### Controller Layer
- [ ] Create `src/controllers/admin/settings.controller.js`
- [ ] Implement `meetingProviderPage()` method
- [ ] Implement `syncAllEvents()` method (POST handler)
- [ ] Enhance `zoom.controller.js` callback

### Routing
- [ ] Add new routes to admin router
- [ ] Verify routes are accessible and protected by auth

### Views & UI
- [ ] Create `src/views/admin/settings/` directory
- [ ] Create `meeting-provider.pug` template
- [ ] Update `event-type-products/events.pug` with sync status column
- [ ] Update admin sidebar navigation fragment
- [ ] Style the sync status badges (CSS in `src/public/css/admin.css`)

### Integration Testing
- [ ] Test connecting Zoom
- [ ] Test creating an event before Zoom connection
- [ ] Test viewing settings page (unsynced count displays)
- [ ] Test sync all button (events transition to synced)
- [ ] Test error handling (invalid Zoom token, network error, etc.)
- [ ] Verify flash messages display correctly

---

## Key Implementation Notes

1. **Idempotency**: The sync flow must be fully idempotent. Clicking "Sync All" multiple times should not cause issues.

2. **Transaction Usage**: All `meetingSyncState` updates should use the same Sequelize transaction as the EventMeeting creation for atomicity.

3. **Error Handling**: If syncing one event fails, the process should continue with the next event and report all failures at the end.

4. **Permissions**: The `/admin/settings/meeting-provider` route must require `req.user.isAdmin` (use existing `requireAuth` middleware).

5. **Message Clarity**:
   - Success: "5 events synced successfully."
   - Partial: "3 events synced. 1 failed: [error]"
   - None: "All events already synced."

6. **Timezone Handling** (Future enhancement):
   - Consider storing admin's timezone preference so `ensureMeetingForOnlineEvent()` can convert times correctly (see Phase 4 in earlier discussion).

---

## Files to Create/Modify

### New Files
- `src/db/migrations/[TIMESTAMP]-add-meeting-sync-state.js`
- `src/controllers/admin/settings.controller.js`
- `src/views/admin/settings/meeting-provider.pug`

### Modified Files
- `src/models/Event.js`
- `src/repos/event.repo.js`
- `src/services/event.service.js`
- `src/controllers/admin/zoom.controller.js`
- `src/routes/admin/index.js`
- `src/views/fragments/admin/dash-nav.pug`
- `src/views/admin/event-type-products/events.pug`
- `src/public/css/admin.css` (for badge styling)

---

## Questions for Review

1. Should unsynced events also include events created offline-first or only those created after initial Zoom connection?
   - **Recommendation**: All `isOnline` events default to `unsynced` and are marked `synced` only after a meeting is created.

2. Should admins be able to manually "reset" a synced event's state back to `unsynced` (e.g., to recreate the meeting)?
   - **Recommendation**: Not in Phase 1; add in Phase 3.

3. Should the admin sidebar badge appear always or only when unsynced count > 0?
   - **Recommendation**: Only show when count > 0 to reduce visual clutter.

4. For the Settings page, should we show all unsynced events or paginate/limit visibility?
   - **Recommendation**: Start with a simple list; paginate if count > 50.
