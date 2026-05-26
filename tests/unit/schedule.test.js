/**
 * Unit tests for lib/schedule.js
 *
 * Coverage target: every adherence status + edge cases (DST-adjacent days,
 * cross-midnight shifts, malformed input, no-show, early-leave, overstay,
 * break overage, versioned schedule lookup, fallback to default).
 */
import { describe, it, expect } from 'vitest';
import {
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
} from '../../lib/schedule.js';

// ─── Public surface ────────────────────────────────────────────────────
describe('schedule — public surface', () => {
  it('exports the 9 stable status values', () => {
    expect(ADHERENCE_STATUSES).toEqual([
      'on-time', 'minor-late', 'late', 'no-show', 'early-leave',
      'overstay', 'day-off', 'pending', 'unknown'
    ]);
  });

  it('TOLERANCES has positive minute values', () => {
    for (const v of Object.values(TOLERANCES)) {
      expect(v).toBeGreaterThan(0);
    }
  });

  it('DEFAULT_SCHEDULE covers all 7 days of week', () => {
    for (let d = 0; d < 7; d++) {
      expect(DEFAULT_SCHEDULE.byDayOfWeek[d]).toBeDefined();
    }
    // Mon-Fri are working days
    expect(DEFAULT_SCHEDULE.byDayOfWeek[1].isWorkingDay).toBe(true);
    expect(DEFAULT_SCHEDULE.byDayOfWeek[5].isWorkingDay).toBe(true);
    // Sat/Sun are off
    expect(DEFAULT_SCHEDULE.byDayOfWeek[0].isWorkingDay).toBe(false);
    expect(DEFAULT_SCHEDULE.byDayOfWeek[6].isWorkingDay).toBe(false);
  });
});

// ─── Time helpers ──────────────────────────────────────────────────────
describe('time helpers', () => {
  it('parseTimeStrToMinutes parses HH:MM correctly', () => {
    expect(parseTimeStrToMinutes('09:00')).toBe(540);
    expect(parseTimeStrToMinutes('17:30')).toBe(1050);
    expect(parseTimeStrToMinutes('00:00')).toBe(0);
    expect(parseTimeStrToMinutes('23:59')).toBe(1439);
    expect(parseTimeStrToMinutes('9:00')).toBe(540);  // single-digit hour ok
  });

  it('parseTimeStrToMinutes rejects malformed input', () => {
    expect(parseTimeStrToMinutes('9:0')).toBeNull();
    expect(parseTimeStrToMinutes('25:00')).toBeNull();
    expect(parseTimeStrToMinutes('09:60')).toBeNull();
    expect(parseTimeStrToMinutes('')).toBeNull();
    expect(parseTimeStrToMinutes(null)).toBeNull();
    expect(parseTimeStrToMinutes(540)).toBeNull();
  });

  it('formatMinutes pads correctly and wraps 24h', () => {
    expect(formatMinutes(0)).toBe('00:00');
    expect(formatMinutes(540)).toBe('09:00');
    expect(formatMinutes(1439)).toBe('23:59');
    expect(formatMinutes(1440)).toBe('00:00');
    expect(formatMinutes(1500)).toBe('01:00');
    expect(formatMinutes(-30)).toBe('23:30');
  });

  it('minutesBetween handles same-day and cross-midnight', () => {
    expect(minutesBetween('09:00', '17:00')).toBe(480);
    expect(minutesBetween('22:00', '06:00')).toBe(480);  // cross midnight
    expect(minutesBetween('17:00', '09:00')).toBe(960);  // next-day 9am
    expect(minutesBetween('00:00', '00:00')).toBe(1440); // full day
    expect(minutesBetween('bad', '17:00')).toBeNull();
  });

  it('dayOfWeekForDate returns 0..6', () => {
    expect(dayOfWeekForDate('2026-05-25')).toBe(1);  // Monday
    expect(dayOfWeekForDate('2026-05-30')).toBe(6);  // Saturday
    expect(dayOfWeekForDate('2026-05-31')).toBe(0);  // Sunday
    expect(dayOfWeekForDate('bad-date')).toBeNull();
    expect(dayOfWeekForDate(null)).toBeNull();
  });
});

// ─── Schedule resolution ───────────────────────────────────────────────
describe('resolveScheduleForDate', () => {
  it('returns default schedule when no rows', () => {
    const r = resolveScheduleForDate([], '2026-05-26');  // Tuesday
    expect(r.source).toBe('default');
    expect(r.isWorkingDay).toBe(true);
    expect(r.start).toBe('09:00');
    expect(r.end).toBe('17:00');
  });

  it('returns default with isWorkingDay=false on weekends when no rows', () => {
    const sat = resolveScheduleForDate([], '2026-05-30');  // Sat
    expect(sat.source).toBe('default');
    expect(sat.isWorkingDay).toBe(false);
  });

  it('returns configured schedule when row matches', () => {
    const rows = [
      { id: 1, day_of_week: 2, start_time: '08:00', end_time: '16:00',
        timezone: 'America/Chicago', is_working_day: 1,
        effective_from: '2026-01-01', effective_to: null }
    ];
    const r = resolveScheduleForDate(rows, '2026-05-26');  // Tuesday
    expect(r.source).toBe('configured');
    expect(r.start).toBe('08:00');
    expect(r.end).toBe('16:00');
  });

  it('picks the most-recent effective_from when multiple rows', () => {
    const rows = [
      { id: 1, day_of_week: 2, start_time: '08:00', end_time: '16:00',
        is_working_day: 1, effective_from: '2026-01-01', effective_to: null },
      { id: 2, day_of_week: 2, start_time: '10:00', end_time: '18:00',
        is_working_day: 1, effective_from: '2026-05-01', effective_to: null }
    ];
    const r = resolveScheduleForDate(rows, '2026-05-26');
    expect(r.start).toBe('10:00');  // newer row wins
    expect(r.rowId).toBe(2);
  });

  it('respects effective_to (end-dated) schedules', () => {
    const rows = [
      // Active Jan 1 – Apr 30
      { id: 1, day_of_week: 2, start_time: '08:00', end_time: '16:00',
        is_working_day: 1, effective_from: '2026-01-01', effective_to: '2026-04-30' },
      // Active May 1 onward
      { id: 2, day_of_week: 2, start_time: '10:00', end_time: '18:00',
        is_working_day: 1, effective_from: '2026-05-01', effective_to: null }
    ];
    // Mar 3 → row 1
    const mar = resolveScheduleForDate(rows, '2026-03-03');
    expect(mar.start).toBe('08:00');
    // May 26 → row 2
    const may = resolveScheduleForDate(rows, '2026-05-26');
    expect(may.start).toBe('10:00');
  });

  it('falls back to default if no row matches the date', () => {
    const rows = [
      { id: 1, day_of_week: 2, start_time: '08:00', end_time: '16:00',
        is_working_day: 1, effective_from: '2030-01-01', effective_to: null }
    ];
    const r = resolveScheduleForDate(rows, '2026-05-26');
    expect(r.source).toBe('default');
  });

  it('returns null for malformed date', () => {
    expect(resolveScheduleForDate([], 'not-a-date')).toBeNull();
    expect(resolveScheduleForDate(null, 'not-a-date')).toBeNull();
  });
});

// ─── Adherence — primary statuses ──────────────────────────────────────
describe('evaluateAdherence — primary statuses', () => {
  const sched = { isWorkingDay: true, start: '09:00', end: '17:00', timezone: 'America/Chicago' };
  const tueDay = { dateStr: '2026-05-26', nowMinute: 1440 };  // after-shift evaluation

  it('on-time when login within tolerance of start', () => {
    // start = 540; ±5 min is on-time
    const r = evaluateAdherence({
      schedule: sched,
      actuals: { firstLoginMinute: 542, lastLogoutMinute: 1020 },  // 9:02 login, 5:00 logout
      now: tueDay
    });
    expect(r.status).toBe('on-time');
    expect(r.startVarianceMin).toBe(2);
  });

  it('on-time when logging in early', () => {
    const r = evaluateAdherence({
      schedule: sched,
      actuals: { firstLoginMinute: 510 },  // 8:30am
      now: tueDay
    });
    expect(r.status).toBe('on-time');
    expect(r.startVarianceMin).toBe(-30);
    expect(r.summary).toContain('early');
  });

  it('minor-late when 5–15 min after start', () => {
    const r = evaluateAdherence({
      schedule: sched,
      actuals: { firstLoginMinute: 548 },  // 8 min late
      now: tueDay
    });
    expect(r.status).toBe('minor-late');
    expect(r.startVarianceMin).toBe(8);
  });

  it('late when >15 min after start', () => {
    const r = evaluateAdherence({
      schedule: sched,
      actuals: { firstLoginMinute: 570 },  // 30 min late
      now: tueDay
    });
    expect(r.status).toBe('late');
    expect(r.startVarianceMin).toBe(30);
  });

  it('no-show when no login and shift has ended', () => {
    const r = evaluateAdherence({
      schedule: sched,
      actuals: {},
      now: { dateStr: '2026-05-26', nowMinute: 1100 }  // 6:20pm — past 5pm
    });
    expect(r.status).toBe('no-show');
  });

  it('pending when no login but shift has not started', () => {
    const r = evaluateAdherence({
      schedule: sched,
      actuals: {},
      now: { dateStr: '2026-05-26', nowMinute: 480 }  // 8am — before shift
    });
    expect(r.status).toBe('pending');
  });

  it('pending when shift in progress but no login yet (graceful)', () => {
    const r = evaluateAdherence({
      schedule: sched,
      actuals: {},
      now: { dateStr: '2026-05-26', nowMinute: 600 }  // 10am — during shift
    });
    expect(r.status).toBe('pending');
    expect(r.summary).toContain('logged in yet');
  });

  it('day-off when isWorkingDay is false', () => {
    const r = evaluateAdherence({
      schedule: { isWorkingDay: false },
      actuals: { firstLoginMinute: 540 },  // even with login data
      now: tueDay
    });
    expect(r.status).toBe('day-off');
  });
});

// ─── Adherence — end-of-shift behaviors ────────────────────────────────
describe('evaluateAdherence — end-of-shift', () => {
  const sched = { isWorkingDay: true, start: '09:00', end: '17:00' };
  const tueDay = { dateStr: '2026-05-26', nowMinute: 1440 };

  it('early-leave escalates status when leaving >5 min early', () => {
    // On-time start, but left 30 min early
    const r = evaluateAdherence({
      schedule: sched,
      actuals: { firstLoginMinute: 540, lastLogoutMinute: 990 },  // 4:30pm logout
      now: tueDay
    });
    expect(r.status).toBe('early-leave');
    expect(r.flags).toContain('early-leave');
    expect(r.endVarianceMin).toBe(-30);
  });

  it('overstay flag (not primary status) when leaving >15 min late', () => {
    const r = evaluateAdherence({
      schedule: sched,
      actuals: { firstLoginMinute: 540, lastLogoutMinute: 1050 },  // 5:30pm logout
      now: tueDay
    });
    expect(r.flags).toContain('overstay');
    expect(r.endVarianceMin).toBe(30);
  });

  it('late primary status persists with early-leave flag', () => {
    // Late by 30 min AND left 30 min early
    const r = evaluateAdherence({
      schedule: sched,
      actuals: { firstLoginMinute: 570, lastLogoutMinute: 990 },
      now: tueDay
    });
    expect(r.status).toBe('late');  // primary = late, not early-leave
    expect(r.flags).toContain('early-leave');
  });
});

// ─── Break overage (compounding flag) ──────────────────────────────────
describe('evaluateAdherence — break overage', () => {
  const sched = { isWorkingDay: true, start: '09:00', end: '17:00' };
  const tueDay = { dateStr: '2026-05-26', nowMinute: 1440 };

  it('flags break-overage when breaks exceed policy + tolerance', () => {
    const r = evaluateAdherence({
      schedule: sched,
      actuals: { firstLoginMinute: 540, lastLogoutMinute: 1020, breakMinutes: 90, scheduledBreakMinutes: 60 },
      now: tueDay
    });
    expect(r.flags).toContain('break-overage');
    expect(r.breakOverageMin).toBe(30);
  });

  it('does not flag when within tolerance', () => {
    const r = evaluateAdherence({
      schedule: sched,
      actuals: { firstLoginMinute: 540, lastLogoutMinute: 1020, breakMinutes: 63, scheduledBreakMinutes: 60 },
      now: tueDay
    });
    expect(r.flags).not.toContain('break-overage');
  });

  it('breaks compound with primary status — late + break-over', () => {
    const r = evaluateAdherence({
      schedule: sched,
      actuals: { firstLoginMinute: 570, lastLogoutMinute: 1020, breakMinutes: 95, scheduledBreakMinutes: 60 },
      now: tueDay
    });
    expect(r.status).toBe('late');
    expect(r.flags).toContain('break-overage');
  });
});

// ─── Cross-midnight shifts ─────────────────────────────────────────────
describe('evaluateAdherence — cross-midnight shifts', () => {
  it('handles 22:00 → 06:00 night shift correctly', () => {
    const sched = { isWorkingDay: true, start: '22:00', end: '06:00' };
    // Login at 22:05 (5 min late but within tolerance)
    const r = evaluateAdherence({
      schedule: sched,
      actuals: { firstLoginMinute: 1325 },  // 22:05
      now: { dateStr: '2026-05-26', nowMinute: 1440 }
    });
    expect(r.status).toBe('on-time');
  });

  it('cross-midnight: no-show check does not falsely trip', () => {
    // Shift 22:00 → 06:00, now is 23:00 (in shift), no login yet
    const sched = { isWorkingDay: true, start: '22:00', end: '06:00' };
    const r = evaluateAdherence({
      schedule: sched,
      actuals: {},
      now: { dateStr: '2026-05-26', nowMinute: 1380 }  // 23:00
    });
    expect(r.status).toBe('pending');
  });
});

// ─── Engine guarantees ─────────────────────────────────────────────────
describe('evaluateAdherence — guarantees', () => {
  it('never throws on null/undefined/malformed input', () => {
    const inputs = [
      null, undefined, {},
      { schedule: null, actuals: null, now: null },
      { schedule: { isWorkingDay: true, start: 'BAD', end: 'BAD' }, actuals: {}, now: { nowMinute: 1000 } },
      { schedule: { isWorkingDay: true }, actuals: { firstLoginMinute: 'not-a-number' }, now: {} },
      { schedule: { isWorkingDay: true, start: '09:00', end: '17:00' }, actuals: { firstLoginMinute: NaN }, now: { nowMinute: NaN } }
    ];
    for (const input of inputs) {
      expect(() => evaluateAdherence(input)).not.toThrow();
      const r = evaluateAdherence(input);
      expect(r).toHaveProperty('status');
      expect(ADHERENCE_STATUSES).toContain(r.status);
    }
  });

  it('returns unknown when no login and no time provided', () => {
    const r = evaluateAdherence({
      schedule: { isWorkingDay: true, start: '09:00', end: '17:00' },
      actuals: {},
      now: {}
    });
    expect(r.status).toBe('unknown');
  });

  it('falls back to default 9-5 when schedule has bad start/end', () => {
    const r = evaluateAdherence({
      schedule: { isWorkingDay: true, start: 'BAD', end: 'BAD' },
      actuals: { firstLoginMinute: 540, lastLogoutMinute: 1020 },
      now: { dateStr: '2026-05-26', nowMinute: 1440 }
    });
    // After fallback, this would be on-time vs 9-5
    expect(r.status).toBe('on-time');
  });
});

// ─── Bulk evaluation ───────────────────────────────────────────────────
describe('evaluateBulk', () => {
  it('returns one record per agent, sorted by severity', () => {
    const schedulesByAgent = {
      'a@x.com': [],   // default
      'b@x.com': [],
      'c@x.com': []
    };
    const actualsByAgent = {
      'a@x.com': { firstLoginMinute: 540 },                     // on-time
      'b@x.com': { firstLoginMinute: 600 },                     // late by 60
      'c@x.com': {}                                              // no-show (now=after-shift)
    };
    const records = evaluateBulk(schedulesByAgent, actualsByAgent, '2026-05-26', 1440);
    expect(records.length).toBe(3);
    // No-show should be first (highest severity)
    expect(records[0].status).toBe('no-show');
    expect(records[0].email).toBe('c@x.com');
    // On-time should be last
    expect(records[records.length - 1].email).toBe('a@x.com');
  });

  it('handles empty inputs', () => {
    expect(evaluateBulk({}, {}, '2026-05-26', 1000)).toEqual([]);
    expect(evaluateBulk(null, null, '2026-05-26', 1000)).toEqual([]);
  });

  it('uses actualsByAgent emails when schedulesByAgent is empty', () => {
    const records = evaluateBulk({}, { 'x@x.com': { firstLoginMinute: 540 } }, '2026-05-26', 1440);
    expect(records.length).toBe(1);
    expect(records[0].schedule.source).toBe('default');
  });
});
