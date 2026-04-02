/**
 * Build a date → time → events structure for the admin Events timeline view.
 * Preserves chronological order from the input array (assumed pre-sorted by the repo).
 */

const NO_DATE_KEY = "__nodate";
const NO_TIME_KEY = "__notime";

/**
 * @param {unknown} startDate
 * @returns {string}
 */
function normalizeDateKey(startDate) {
  if (startDate == null || String(startDate).trim() === "") return NO_DATE_KEY;
  const s = String(startDate);
  return s.length >= 10 ? s.substring(0, 10) : NO_DATE_KEY;
}

/**
 * @param {unknown} startTime
 * @returns {string}
 */
function normalizeTimeKey(startTime) {
  if (startTime == null || String(startTime).trim() === "") return NO_TIME_KEY;
  const s = String(startTime);
  return s.length >= 5 ? s.substring(0, 5) : NO_TIME_KEY;
}

/**
 * @param {string} ymd
 * @param {number} deltaDays
 * @returns {string}
 */
function addDaysYmd(ymd, deltaDays) {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().substring(0, 10);
}

/**
 * @param {string} dateKey
 * @param {string} locale
 * @returns {string}
 */
function formatDateHeading(dateKey, locale) {
  if (dateKey === NO_DATE_KEY) return "Bez datuma";
  const [y, mo, d] = dateKey.split("-").map((n) => parseInt(n, 10));
  if (!y || !mo || !d) return dateKey;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(dt);
  } catch {
    return dateKey;
  }
}

/**
 * @param {string} timeKey
 * @returns {string}
 */
function formatTimeLabel(timeKey) {
  if (timeKey === NO_TIME_KEY) return "Bez vremena";
  return timeKey;
}

/**
 * @param {string} dateKey
 * @param {string} todayYmd
 * @param {string} tomorrowYmd
 * @returns {string|null}
 */
function upcomingDateBadge(dateKey, todayYmd, tomorrowYmd) {
  if (dateKey === NO_DATE_KEY) return null;
  if (dateKey === todayYmd) return "Danas";
  if (dateKey === tomorrowYmd) return "Sutra";
  return null;
}

/**
 * @param {Array<object>} events
 * @param {{ view?: 'upcoming'|'past', locale?: string }} [options]
 * @returns {Array<{
 *   dateKey: string,
 *   dateHeading: string,
 *   dateBadge: string|null,
 *   isToday: boolean,
 *   sectionId: string,
 *   timeSlots: Array<{ timeKey: string, timeLabel: string, events: object[] }>
 * }>}
 */
function buildEventsTimeline(events, options = {}) {
  const view = options.view === "past" ? "past" : "upcoming";
  const locale = options.locale || "hr-HR";
  const list = Array.isArray(events) ? events : [];
  if (list.length === 0) return [];

  const todayYmd = new Date().toISOString().substring(0, 10);
  const tomorrowYmd = addDaysYmd(todayYmd, 1);

  /** @type {string[]} */
  const dateOrder = [];
  /** @type {Map<string, Map<string, object[]>>} */
  const byDate = new Map();

  for (const ev of list) {
    const dateKey = normalizeDateKey(ev.startDate);
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, new Map());
      dateOrder.push(dateKey);
    }
    const timeKey = normalizeTimeKey(ev.startTime);
    const timeMap = byDate.get(dateKey);
    if (!timeMap.has(timeKey)) {
      timeMap.set(timeKey, []);
    }
    timeMap.get(timeKey).push(ev);
  }

  return dateOrder.map((dateKey) => {
    const timeMap = byDate.get(dateKey);
    const timeKeys = Array.from(timeMap.keys());
    const timeSlots = timeKeys.map((tk) => ({
      timeKey: tk,
      timeLabel: formatTimeLabel(tk),
      events: timeMap.get(tk) || [],
    }));

    const safeId =
      dateKey === NO_DATE_KEY ? "nodate" : dateKey.replace(/[^0-9-]/g, "") || "nodate";

    return {
      dateKey,
      dateHeading: formatDateHeading(dateKey, locale),
      dateBadge: view === "upcoming" ? upcomingDateBadge(dateKey, todayYmd, tomorrowYmd) : null,
      isToday: dateKey !== NO_DATE_KEY && dateKey === todayYmd,
      sectionId: `evt-day-${safeId}`,
      timeSlots,
    };
  });
}

module.exports = {
  buildEventsTimeline,
  NO_DATE_KEY,
  NO_TIME_KEY,
};
