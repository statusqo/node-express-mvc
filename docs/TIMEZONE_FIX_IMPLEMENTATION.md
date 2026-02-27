# Point 4: Fixing the Timezone Issue

## Problem Summary

The app sends start times to Zoom as UTC, but it hard-codes `timezone: "UTC"` in the request. This causes Zoom to interpret the time as UTC wall-clock time, not the time in the admin's local zone.

**Example**:
- Admin enters: "2026-02-23 16:20" (intended: 4:20 PM in their local timezone)
- Code parses: `new Date("2026-02-23T16:20:00")` (interpreted as local time by Node)
- If admin is in Pacific (UTC-8), this becomes `2026-02-23T24:20:00Z` → `2026-02-24T00:20:00Z`
- Code sends to Zoom: `start_time: "2026-02-24T00:20:00Z"` with `timezone: "UTC"`
- Zoom shows: `2026-02-24 00:20 UTC` (which displays as `Feb 23, 4:20 PM Pacific`)
- ✓ Coincidence: They match! But only for Pacific timezone.
- ✗ For UTC+5 zone, it becomes wrong: `00:20 UTC` shows as `5:20 AM UTC+5` (off by many hours).

## Root Cause

The app doesn't know the **admin's timezone** when creating a meeting, so it can't properly convert local → UTC.

## Solution 1: Store Admin Timezone (Recommended)

### 1.1 Add Timezone to User Model
**File:** `src/models/User.js`

```javascript
timezone: {
  type: DataTypes.STRING(50),
  allowNull: true,
  comment: "IANA timezone string, e.g. 'America/Los_Angeles'",
  defaultValue: 'UTC',
},
```

### 1.2 Add Migration
**File:** `src/db/migrations/[TIMESTAMP]-add-timezone-to-users.js`

```sql
ALTER TABLE users ADD COLUMN timezone VARCHAR(50) DEFAULT 'UTC';
```

### 1.3 Admin Settings Page (Update)
**File:** `src/views/admin/settings/profile.pug` (new or extend existing)

Add timezone selector:
```pug
form(method="POST" action=(adminPrefix || '') + "/settings/profile")
  label Timezone
  select(name="timezone")
    option(value="UTC") UTC
    option(value="America/New_York") Eastern Time
    option(value="America/Chicago") Central Time
    option(value="America/Denver") Mountain Time
    option(value="America/Los_Angeles") Pacific Time
    option(value="Europe/London") London
    option(value="Europe/Paris") Paris
    // ... add full IANA list
  button(type="submit") Save Timezone
```

### 1.4 Update Zoom Gateway
**File:** `src/gateways/zoom.meeting.gateway.js`

Modify `createMeeting` to accept and use admin's timezone:

```javascript
async function createMeeting(event, userId) {
  const account = await AdminZoomAccount.findOne({ 
    where: { userId },
    include: [{ model: User, as: 'User' }], // or however the relationship is named
  });
  if (!account?.accessToken) {
    throw new Error("Zoom host account or access token missing...");
  }

  const adminTimezone = account.User?.timezone || 'UTC';
  const startDate = String(event.startDate).substring(0, 10);
  const startTime = String(event.startTime).substring(0, 5);
  
  // Parse the date/time as if it were in the admin's timezone
  let start;
  if (startDate && startTime) {
    // Create a local DateTime string
    const localDateTime = `${startDate}T${startTime}:00`;
    
    // Convert local time to UTC using the admin's timezone
    const utcStart = convertLocalToUTC(localDateTime, adminTimezone);
    start = utcStart;
  } else {
    start = new Date();
  }

  const duration = Math.max(15, Math.min(480, Number(event.durationMinutes) || 60));
  const topic = (event.title || `Event ${startDate} ${startTime}`).substring(0, 200);

  const body = {
    topic,
    type: 2, // scheduled
    start_time: start.toISOString(),
    duration,
    timezone: adminTimezone,  // ← NOW respect admin's timezone
    settings: {
      approval_type: 0,
      registration_type: 1,
      join_before_host: false,
    },
  };

  const zoomUserId = account.zoomUserId || "me";
  const data = await zoomRequest(account.accessToken, `/users/${zoomUserId}/meetings`, {
    method: "POST",
    body,
  });

  // ... rest of method
}

/**
 * Convert a local date/time string to UTC using a timezone.
 * @param {string} localDateTime - ISO-like string: "2026-02-23T16:20:00"
 * @param {string} timezone - IANA timezone: "America/Los_Angeles"
 * @returns {Date} UTC date object
 */
function convertLocalToUTC(localDateTime, timezone = "UTC") {
  try {
    // Use Intl API to get timezone offset
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Parse the local time string
    const [y, m, d, ...rest] = localDateTime.match(/\d+/g);
    const localDate = new Date(`${y}-${m}-${d}T${rest[0]}:${rest[1]}:${rest[2]}`);

    // Get what the formatter thinks the UTC time is
    const parts = formatter.formatToParts(localDate);
    const tzYear = parseInt(parts.find(p => p.type === 'year').value);
    const tzMonth = parseInt(parts.find(p => p.type === 'month').value);
    const tzDay = parseInt(parts.find(p => p.type === 'day').value);
    const tzHour = parseInt(parts.find(p => p.type === 'hour').value);
    const tzMinute = parseInt(parts.find(p => p.type === 'minute').value);
    const tzSecond = parseInt(parts.find(p => p.type === 'second').value);

    // Reconstruct as UTC, using the offset we calculated
    const offset = (new Date(y, parseInt(m) - 1, d, rest[0], rest[1], rest[2]).getTime() - new Date(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond).getTime());
    const utcDate = new Date(localDate.getTime() - offset);

    return utcDate;
  } catch (e) {
    // Fallback to UTC
    const parts = localDateTime.split('T');
    return new Date(parts[0] + 'T' + parts[1] + 'Z');
  }
}
```

### 1.5 Install Date/Timezone Library (Alternative, Simpler)
Use `date-fns-tz` or `moment-timezone` instead of manual conversion:

```javascript
const { toZonedTime, format } = require('date-fns-tz');

// In createMeeting:
const localDateTime = `${event.startDate}T${event.startTime}:00`;
const utcDate = toZonedTime(localDateTime, account.User.timezone);  // much simpler!
```

Then update `package.json`:
```json
{
  "dependencies": {
    "date-fns-tz": "^2.0.0"
  }
}
```

---

## Solution 2: Client-Side Timezone Detection (Fallback)

If you don't want to store timezone per user, detect it in the browser:

**File:** `src/views/admin/event-type-products/events.pug`

Add hidden field to the form:
```pug
input(type="hidden" name="adminTimezone" id="adminTimezone")
script.
  document.getElementById('adminTimezone').value = Intl.DateTimeFormat().resolvedOptions().timeZone;
```

Then in `eventTypeProducts.controller.js`, pass this to `eventService.ensureMeetingForOnlineEvent`:
```javascript
const adminTimezone = req.body.adminTimezone || 'UTC';
const result = await eventService.ensureMeetingForOnlineEvent(ev.id, req.user.id, { adminTimezone });
```

And in `event.service.js`, pass it to the gateway:
```javascript
const result = await provider.createMeeting(plain, userId, { adminTimezone: options.adminTimezone });
```

**Pros**: No DB changes, works immediately.
**Cons**: Sent on every save, not persisted, may differ across devices.

---

## Solution 3: Let Zoom Handle It (Simplest)

Remove the hard-coded `timezone: "UTC"` and let Zoom use the **host account's timezone**:

**File:** `src/gateways/zoom.meeting.gateway.js`

```javascript
const body = {
  topic,
  type: 2,
  start_time: start.toISOString(),  // still UTC ISO string
  duration,
  // ← REMOVE: timezone: "UTC",
  settings: { … },
};
```

Zoom will then interpret the `start_time` as UTC (which it is, since you send ISO) and display it relative to the **Zoom account owner's stated timezone** (set in their Zoom profile settings).

**Pros**: Zero code changes beyond removing one line.
**Cons**: Relies on Zoom account admin to have correct timezone set in their Zoom profile (not in your app).

---

## Recommendation

**Use Solution 1 (Store Admin Timezone)**:
- Most explicit and reliable.
- Admin's intent is captured.
- Works even if Zoom account timezone differs.
- Better UX if you support multiple admins with different zones.

**Fallback to Solution 3** if you're time-constrained:
- One-line fix.
- Tell admins to set their Zoom profile timezone.

---

## Implementation Steps (Solution 1)

### Phase 4 Checklist

- [ ] Create migration: add `timezone` column to users
- [ ] Update User model with timezone field
- [ ] Create admin settings profile page with timezone selector
- [ ] Update Zoom gateway to use admin's timezone
- [ ] Install `date-fns-tz` package
- [ ] Add `convertLocalToUTC()` helper function
- [ ] Update `createMeeting()` to fetch admin timezone and convert
- [ ] Test with one admin in Pacific, another in UTC+5
- [ ] Verify Zoom shows correct time in both cases
- [ ] Update docs/ZOOM_INTEGRATION_TESTING.md with timezone setup step

---

## Testing Checklist

After implementation:

1. **Create admin in Pacific TZ**
   - Set event: 2026-02-23 16:20
   - Expected Zoom time: 2026-02-23 16:20 Pacific (= 2026-02-24 00:20 UTC)
   - ✓ Verify Zoom shows both times correctly

2. **Create admin in UTC+5 TZ** (e.g., Pakistan)
   - Set event: 2026-02-23 16:20
   - Expected Zoom time: 2026-02-23 16:20 UTC+5 (= 2026-02-23 11:20 UTC)
   - ✓ Verify Zoom shows both times correctly

3. **Change admin's timezone**
   - Re-edit event (don't change date/time)
   - Save
   - Zoom meeting should NOT be re-created (already synced)
   - Old meeting time should remain unchanged

4. **Edge cases**
   - Admin in UTC selecting UTC (all ISO, no conversion)
   - Daylight saving transitions (test around DST boundary dates)
   - Multiple admins sharing same Zoom account

---

## Code Snippet (Full Solution 1)

```javascript
// zoom.meeting.gateway.js - updated createMeeting function

const { toZonedTime, formatISO } = require('date-fns-tz');

async function createMeeting(event, userId, options = {}) {
  const account = await AdminZoomAccount.findOne({ 
    where: { userId },
    include: [{ model: User }],
  });
  if (!account?.accessToken) {
    throw new Error("Zoom host account or access token missing...");
  }

  // Use admin's timezone, or fall back to 'UTC'
  const adminTimezone = account.User?.timezone || 'UTC';

  const startDate = event.startDate ? String(event.startDate).substring(0, 10) : null;
  const startTime = event.startTime ? String(event.startTime).substring(0, 5) : null;

  let start;
  if (startDate && startTime) {
    const localDateTime = new Date(`${startDate}T${startTime}:00`);
    // Convert to UTC based on admin's timezone
    start = toZonedTime(localDateTime, adminTimezone);
  } else if (startDate) {
    start = new Date(`${startDate}T09:00:00`);
  } else {
    start = new Date();
  }

  const duration = Math.max(15, Math.min(480, Number(event.durationMinutes) || 60));
  const topic = (event.title || `Event ${startDate || ''} ${startTime || ''}`.trim() || 'Online event')
    .substring(0, 200);

  const body = {
    topic,
    type: 2,
    start_time: start.toISOString(),
    duration,
    timezone: adminTimezone,  // ← Now uses admin's actual timezone
    settings: {
      approval_type: 0,
      registration_type: 1,
      join_before_host: false,
    },
  };

  const zoomUserId = account.zoomUserId || 'me';
  const data = await zoomRequest(account.accessToken, `/users/${zoomUserId}/meetings`, {
    method: 'POST',
    body,
  });

  const joinUrl = data.join_url || '';
  const startUrl = data.start_url || '';
  const providerMeetingId = data.id ? String(data.id) : '';
  if (!providerMeetingId || !joinUrl) {
    throw new Error('Zoom did not return meeting id or join URL.');
  }

  logger.info({ zoomMeetingId: providerMeetingId, eventId: event.id }, 'Zoom meeting created');
  return {
    providerMeetingId,
    joinUrl,
    startUrl,
    provider: 'zoom',
    hostAccountId: account.id,
  };
}
```

---

## Summary

| Approach | Effort | Reliability | Recommendation |
|----------|--------|-------------|---|
| **Solution 1**: Store timezone | Medium | High | ✓ Best for multi-admin, future-proof |
| **Solution 2**: Client-side detect | Low | Medium | Good lightweight fallback |
| **Solution 3**: Remove timezone | Minimal | Depends on Zoom | ✓ Quick fix if Zoom profile is set |

For your use case (single or few admins, wanting reliability), **Solution 1** is worth the effort.
