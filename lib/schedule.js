/**
 * lib/schedule.js — pure schedule + adherence evaluation engine.
 *
 * Zero I/O. Zero clock access. Every input is explicit.
 * Functions are deterministic and 100% unit-testable.
 *
 * Public API:
 *   DEFAULT_SCHEDULE       — Mon-Fri 9-5 CST baseline (used when none configured)
 *   ADHERENCE_STATUSES     — frozen list of possible status values
 *   TOLERANCES             — minute tolerances for late / early / break overage
 *   resolveScheduleForDate(rows, dateStr)   — pick versioned schedule for a date
 *   parseTimeStrToMinutes(hhmm)              — '09:30' → 570
 *   minutesBetween(hhmmA, hhmmB)             — handles cross-midnight
 *   evaluateAdherence({schedule, actuals, now})
 *   evaluateBulk(schedulesByAgent, actualsByAgent, dateStr, now)
 */
'use strict';

// ─── Constants ──────────────────────────────────────────────────────────
const ADHERENCE_STATUSES = Object.freeze([
  'on-time',
  'minor-late',
  'late',
  'no-show',
  'early-leave',
  'overstay',
  'day-off',
  'pending',
  'unknown'
]);

const TOLERANCES = Object.freeze({
  minorLateMin: 5,    // ±5 min of start = on-time
  lateMin: 15,        // >15 min after start = late
  earlyLeaveMin: 5,   // >5 min before end = early-leave
  overstayMin: 15,    // >15 min after end = overstay
  breakOverMin: 5     // > policy + 5 min = break overage flag
});

// Default schedule — Mon-Fri 9:00-17:00 America/Chicago
const DEFAULT_SCHEDULE = Object.freeze({
  source: 'default',
  byDayOfWeek: Object.freeze({
    0: { isWorkingDay: false },                            // Sun
    1: { isWorkingDay: true, start: '09:00', end: '17:00', timezone: 'America/Chicago' },  // Mon
    2: { isWorkingDay: true, start: '09:00', end: '17:00', timezone: 'America/Chicago' },
    3: { isWorkingDay: true, start: '09:00', end: '17:00', timezone: 'America/Chicago' },
    4: { isWorkingDay: true, start: '09:00', end: '17:00', timezone: 'America/Chicago' },
    5: { isWorkingDay: true, start: '09:00', end: '17:00', timezone: 'America/Chicago' },
    6: { isWorkingDay: false }                             // Sat
  })
});

// ─── Helpers ────────────────────────────────────────────────────────────

/** Safe Number coercion with default. */
function num(x, def) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

/** Parse 'HH:MM' to minutes-since-midnight. Returns null if malformed. */
function parseTimeStrToMinutes(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const mins = Number(m[2]);
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;
  return hours * 60 + mins;
}

/** Format minutes-since-midnight back to 'HH:MM'. Wraps around 24h. */
function formatMinutes(m) {
  const total = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const mm = total % 60;
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

/**
 * Compute minutes between two HH:MM strings, with cross-midnight support.
 * If end <= start (e.g. 22:00 → 06:00), end is treated as next-day.
 * Returns null on malformed input.
 */
function minutesBetween(startStr, endStr) {
  const s = parseTimeStrToMinutes(startStr);
  const e = parseTimeStrToMinutes(endStr);
  if (s == null || e == null) return null;
  let diff = e - s;
  if (diff <= 0) diff += 24 * 60;  // cross-midnight
  return diff;
}

/** YYYY-MM-DD → JS Date at UTC midnight. */
function dateStrToUtcDate(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Day-of-week 0..6 (Sun..Sat) for a YYYY-MM-DD date. */
function dayOfWeekForDate(dateStr) {
  const d = dateStrToUtcDate(dateStr);
  return d ? d.getUTCDay() : null;
}

// ─── Resolve schedule for a specific date ───────────────────────────────

/**
 * Given an array of agent_schedules rows for one agent and a target date,
 * return the schedule rules for THAT date's day-of-week. Picks the
 * most-recent row where effective_from <= date AND
 * (effective_to IS NULL OR effective_to >= date).
 *
 * If no row matches, falls back to DEFAULT_SCHEDULE.
 *
 * @param {Array} rows  — possibly empty array of schedule rows
 * @param {string} dateStr — YYYY-MM-DD
 * @returns {Object} { source, isWorkingDay, start?, end?, timezone? }
 */
function resolveScheduleForDate(rows, dateStr) {
  const dow = dayOfWeekForDate(dateStr);
  if (dow == null) return null;  // malformed date

  if (!Array.isArray(rows) || rows.length === 0) {
    return { source: 'default', ...DEFAULT_SCHEDULE.byDayOfWeek[dow] };
  }

  // Filter to rows applying on dateStr for this DOW
  const applicable = rows.filter(r =>
    r && r.day_of_week === dow &&
    typeof r.effective_from === 'string' &&
    r.effective_from <= dateStr &&
    (!r.effective_to || r.effective_to >= dateStr)
  );

  if (applicable.length === 0) {
    return { source: 'default', ...DEFAULT_SCHEDULE.byDayOfWeek[dow] };
  }

  // Newest effective_from wins
  applicable.sort((a, b) => (b.effective_from > a.effective_from ? 1 : -1));
  const row = applicable[0];
  return {
    source: 'configured',
    isWorkingDay: row.is_working_day !== 0,
    start: row.start_time,
    end: row.end_time,
    timezone: row.timezone || 'America/Chicago',
    rowId: row.id
  };
}

// ─── Single-agent adherence ─────────────────────────────────────────────

/**
 * Compute adherence for one agent on one date.
 *
 * @param {Object} args
 * @param {Object} args.schedule — { isWorkingDay, start, end, timezone }
 * @param {Object} args.actuals — { firstLoginMinute, lastLogoutMinute, breakMinutes, scheduledBreakMinutes }
 * @param {Object} args.now    — { dateStr, nowMinute }  — current date + minute-of-day in schedule.timezone
 * @returns {Object} { status, flags, startVarianceMin, endVarianceMin, breakOverageMin, summary, dateStr }
 *
 * All time inputs are MINUTES-OF-DAY in the schedule's timezone, NOT epoch ms.
 * The caller is responsible for converting wallclock to localized minutes.
 *
 * `now.dateStr` is the date being evaluated (YYYY-MM-DD).
 * `now.nowMinute` is current time-of-day in same tz. Pass 1440 (= next day midnight)
 *   to evaluate end-of-day after the shift has closed.
 */
function evaluateAdherence(args) {
  try {
    const s = (args && args.schedule) || {};
    const a = (args && args.actuals) || {};
    const n = (args && args.now) || {};

    const result = {
      dateStr: n.dateStr || null,
      status: 'unknown',
      flags: [],
      startVarianceMin: null,
      endVarianceMin: null,
      breakOverageMin: null,
      summary: ''
    };

    // Day off — short circuit
    if (s.isWorkingDay === false) {
      result.status = 'day-off';
      result.summary = 'Scheduled day off';
      return result;
    }

    const startMin = parseTimeStrToMinutes(s.start);
    const endMin = parseTimeStrToMinutes(s.end);
    if (startMin == null || endMin == null) {
      // Treat as default 9-5 to avoid crashing reports on bad config
      return evaluateAdherence({
        schedule: { ...s, isWorkingDay: true, start: '09:00', end: '17:00' },
        actuals: a,
        now: n
      });
    }

    const firstLogin = num(a.firstLoginMinute, null);
    const lastLogout = num(a.lastLogoutMinute, null);
    const breakMin = num(a.breakMinutes, 0);
    const policyBreak = num(a.scheduledBreakMinutes, 60);  // default 60 min total break budget
    const nowMin = num(n.nowMinute, null);

    // Break overage flag (compounding — can fire alongside any status)
    if (breakMin > policyBreak + TOLERANCES.breakOverMin) {
      result.breakOverageMin = breakMin - policyBreak;
      result.flags.push('break-overage');
    }

    // No login at all
    if (firstLogin == null) {
      if (nowMin == null) {
        result.status = 'unknown';
        result.summary = 'No login data and no time provided';
        return result;
      }
      // Cross-midnight: end < start means end is "next day"
      const shiftEndedForToday = nowMin >= endMin && endMin > startMin;
      // Past shift end → no-show
      if (shiftEndedForToday) {
        result.status = 'no-show';
        result.summary = 'No login by end of shift';
        return result;
      }
      // Before shift start → pending
      if (nowMin < startMin) {
        result.status = 'pending';
        result.summary = 'Shift has not started yet';
        return result;
      }
      // During shift but no login → also pending (graceful — they might still show)
      result.status = 'pending';
      result.summary = 'Shift started — agent has not logged in yet';
      return result;
    }

    // We have a login time — compute start variance
    result.startVarianceMin = firstLogin - startMin;

    if (result.startVarianceMin > TOLERANCES.lateMin) {
      result.status = 'late';
      result.summary = 'Logged in ' + result.startVarianceMin + ' min late';
    } else if (result.startVarianceMin > TOLERANCES.minorLateMin) {
      result.status = 'minor-late';
      result.summary = 'Logged in ' + result.startVarianceMin + ' min late';
    } else if (result.startVarianceMin < -TOLERANCES.minorLateMin) {
      result.status = 'on-time';  // early login still counts as on-time
      result.summary = 'Logged in ' + Math.abs(result.startVarianceMin) + ' min early';
    } else {
      result.status = 'on-time';
      result.summary = 'Logged in within tolerance';
    }

    // End-of-shift evaluation (only if we have a logout AND shift has ended)
    if (lastLogout != null) {
      result.endVarianceMin = lastLogout - endMin;
      // Early leave: left >5 min before scheduled end
      if (result.endVarianceMin < -TOLERANCES.earlyLeaveMin) {
        result.flags.push('early-leave');
        // If primary status was on-time, escalate to early-leave
        if (result.status === 'on-time') {
          result.status = 'early-leave';
          result.summary = 'Logged out ' + Math.abs(result.endVarianceMin) + ' min early';
        } else {
          result.summary += '; logged out ' + Math.abs(result.endVarianceMin) + ' min early';
        }
      } else if (result.endVarianceMin > TOLERANCES.overstayMin) {
        result.flags.push('overstay');
        result.summary += '; overstayed by ' + result.endVarianceMin + ' min';
      }
    }

    return result;
  } catch (e) {
    // Engine never throws — return unknown with error flag
    return {
      dateStr: (args && args.now && args.now.dateStr) || null,
      status: 'unknown',
      flags: ['error'],
      startVarianceMin: null,
      endVarianceMin: null,
      breakOverageMin: null,
      summary: 'Adherence error: ' + (e && e.message),
      _error: true
    };
  }
}

// ─── Bulk adherence ─────────────────────────────────────────────────────

/**
 * Evaluate adherence for every agent in `schedulesByAgent`.
 *
 * @param {Object} schedulesByAgent — { [email]: scheduleRowsArray }
 * @param {Object} actualsByAgent   — { [email]: {firstLoginMinute,...} }
 * @param {string} dateStr          — YYYY-MM-DD being evaluated
 * @param {number} nowMinute        — minutes-of-day in business tz
 * @returns {Array} adherence records, sorted by status severity
 */
function evaluateBulk(schedulesByAgent, actualsByAgent, dateStr, nowMinute) {
  const sba = schedulesByAgent || {};
  const aba = actualsByAgent || {};
  const emails = Object.keys(sba).length ? Object.keys(sba) : Object.keys(aba);

  const records = emails.map(email => {
    const schedule = resolveScheduleForDate(sba[email] || [], dateStr);
    const actuals = aba[email] || {};
    const adherence = evaluateAdherence({
      schedule,
      actuals,
      now: { dateStr, nowMinute }
    });
    return { email, schedule, ...adherence };
  });

  // Sort: no-show / late first, then minor-late, then on-time, then day-off.
  // Use ?? not ||  — `severityRank['no-show'] === 0` and `0 || 9` would
  // wrongly demote no-show to rank 9.
  const severityRank = {
    'no-show': 0, 'late': 1, 'early-leave': 2, 'overstay': 3,
    'minor-late': 4, 'unknown': 5, 'pending': 6,
    'on-time': 7, 'day-off': 8
  };
  records.sort((a, b) => (severityRank[a.status] ?? 9) - (severityRank[b.status] ?? 9));
  return records;
}

// ─── Exports ────────────────────────────────────────────────────────────
module.exports = {
  DEFAULT_SCHEDULE,
  ADHERENCE_STATUSES,
  TOLERANCES,
  resolveScheduleForDate,
  parseTimeStrToMinutes,
  formatMinutes,
  minutesBetween,
  dayOfWeekForDate,
  evaluateAdherence,
  evaluateBulk
};
