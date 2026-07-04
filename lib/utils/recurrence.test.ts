import { describe, it, expect } from 'vitest'
import {
  recurrenceStepDays,
  ensureRecurringDeadline,
  nextRecurrenceDeadline,
  recurringLabel,
  parseEveryNDays,
  isPastDeadline,
} from './recurrence'

// Fixed "now": 2026-07-04T12:00Z (a Saturday)
const NOW = new Date('2026-07-04T12:00Z').getTime()

// ─── recurrenceStepDays ──────────────────────────────────────────────────────
// Maps a task's recurrence fields to an interval in days.

describe('recurrenceStepDays', () => {
  it('returns 1 for daily', () => {
    expect(recurrenceStepDays({ recurring: 'daily' })).toBe(1)
  })

  it('returns 7 for weekly', () => {
    expect(recurrenceStepDays({ recurring: 'weekly' })).toBe(7)
  })

  it('returns null for none / missing', () => {
    expect(recurrenceStepDays({ recurring: 'none' })).toBeNull()
    expect(recurrenceStepDays({})).toBeNull()
    expect(recurrenceStepDays({ recurring: null })).toBeNull()
  })

  it('recurringDays overrides the base cadence (every 2 days)', () => {
    expect(recurrenceStepDays({ recurring: 'daily', recurringDays: 2 })).toBe(2)
  })

  it('ignores recurringDays when not recurring at all', () => {
    expect(recurrenceStepDays({ recurring: 'none', recurringDays: 2 })).toBeNull()
  })
})

// ─── ensureRecurringDeadline ─────────────────────────────────────────────────
// Backfills a concrete date (date-only, no invented clock time) for recurring
// tasks saved without a deadline. Non-recurring tasks are left untouched.

describe('ensureRecurringDeadline', () => {
  it('backfills today (date-only) for a daily task with no deadline', () => {
    expect(ensureRecurringDeadline(null, { recurring: 'daily' }, NOW)).toBe('2026-07-04')
  })

  it('backfills today (date-only) for a weekly task with no deadline', () => {
    expect(ensureRecurringDeadline(null, { recurring: 'weekly' }, NOW)).toBe('2026-07-04')
  })

  it('backfills today for an every-2-days task with no deadline', () => {
    expect(ensureRecurringDeadline(null, { recurring: 'daily', recurringDays: 2 }, NOW)).toBe('2026-07-04')
  })

  it('leaves an existing deadline unchanged', () => {
    expect(ensureRecurringDeadline('2026-07-05T10:00', { recurring: 'daily' }, NOW)).toBe('2026-07-05T10:00')
  })

  it('leaves non-recurring tasks without a deadline as null', () => {
    expect(ensureRecurringDeadline(null, { recurring: 'none' }, NOW)).toBeNull()
    expect(ensureRecurringDeadline(undefined, {}, NOW)).toBeNull()
  })
})

// ─── nextRecurrenceDeadline ──────────────────────────────────────────────────
// Deadline for the next instance created when a recurring task is completed.

describe('nextRecurrenceDeadline', () => {
  it('advances a daily task with a time by one day, preserving the time', () => {
    expect(nextRecurrenceDeadline('2026-07-04T10:00', { recurring: 'daily' }, NOW)).toBe('2026-07-05T10:00')
  })

  it('advances a weekly task by seven days, preserving the time', () => {
    expect(nextRecurrenceDeadline('2026-07-04T18:30', { recurring: 'weekly' }, NOW)).toBe('2026-07-11T18:30')
  })

  it('advances an every-2-days task by two days', () => {
    expect(nextRecurrenceDeadline('2026-07-04', { recurring: 'daily', recurringDays: 2 }, NOW)).toBe('2026-07-06')
  })

  it('keeps date-only deadlines date-only (no invented time)', () => {
    expect(nextRecurrenceDeadline('2026-07-04', { recurring: 'daily' }, NOW)).toBe('2026-07-05')
  })

  it('uses today as the base when the task had no deadline', () => {
    expect(nextRecurrenceDeadline(null, { recurring: 'daily' }, NOW)).toBe('2026-07-05')
    expect(nextRecurrenceDeadline(null, { recurring: 'daily', recurringDays: 2 }, NOW)).toBe('2026-07-06')
  })

  it('returns null for non-recurring tasks', () => {
    expect(nextRecurrenceDeadline('2026-07-04T10:00', { recurring: 'none' }, NOW)).toBeNull()
  })

  it('crosses month boundaries correctly', () => {
    expect(nextRecurrenceDeadline('2026-07-31T09:00', { recurring: 'daily' }, NOW)).toBe('2026-08-01T09:00')
  })
})

// ─── recurringLabel ──────────────────────────────────────────────────────────
// Human-readable badge text for a task's recurrence.

describe('recurringLabel', () => {
  it('labels every-N-hours tasks', () => {
    expect(recurringLabel({ recurring: 'daily', recurringHours: 8 })).toBe('Every 8h')
  })

  it('labels every-N-days tasks', () => {
    expect(recurringLabel({ recurring: 'daily', recurringDays: 2 })).toBe('Every 2 days')
  })

  it('labels plain daily and weekly', () => {
    expect(recurringLabel({ recurring: 'daily' })).toBe('daily')
    expect(recurringLabel({ recurring: 'weekly' })).toBe('weekly')
  })

  it('returns null for non-recurring tasks', () => {
    expect(recurringLabel({ recurring: 'none' })).toBeNull()
    expect(recurringLabel({})).toBeNull()
  })
})

// ─── isPastDeadline ──────────────────────────────────────────────────────────
// Decides whether a task should enter the "past deadline" flow when saved.
// Date-only deadlines count as end-of-day; recurring tasks never count as
// past at save time (their next occurrence is computed automatically).

describe('isPastDeadline', () => {
  it('treats a date-only deadline of today as NOT past (end of day)', () => {
    expect(isPastDeadline('2026-07-04', 'none', NOW)).toBe(false)
  })

  it('treats a date-only deadline of yesterday as past', () => {
    expect(isPastDeadline('2026-07-03', 'none', NOW)).toBe(true)
  })

  it('treats a timed deadline earlier today as past for one-off tasks', () => {
    expect(isPastDeadline('2026-07-04T10:00', 'none', NOW)).toBe(true)
  })

  it('never flags recurring tasks as past at save time', () => {
    expect(isPastDeadline('2026-07-04T10:00', 'daily', NOW)).toBe(false)
    expect(isPastDeadline('2026-07-01', 'weekly', NOW)).toBe(false)
  })

  it('returns false for missing deadlines', () => {
    expect(isPastDeadline(null, 'none', NOW)).toBe(false)
  })

  it('handles future timed deadlines', () => {
    expect(isPastDeadline('2026-07-04T18:00', 'none', NOW)).toBe(false)
  })
})

// ─── parseEveryNDays ─────────────────────────────────────────────────────────
// Offline/safety-net parser for "every N days" phrases in raw task input.

describe('parseEveryNDays', () => {
  it('parses digits: "throw trash every 2 days"', () => {
    expect(parseEveryNDays('throw trash every 2 days')).toBe(2)
  })

  it('parses number words: "every two days"', () => {
    expect(parseEveryNDays('Throw Trash every two days')).toBe(2)
    expect(parseEveryNDays('water plants Every Three Days')).toBe(3)
  })

  it('parses "every other day" and "every second day" as 2', () => {
    expect(parseEveryNDays('shave every other day')).toBe(2)
    expect(parseEveryNDays('jog every second day')).toBe(2)
  })

  it('returns null when no N-day phrase is present', () => {
    expect(parseEveryNDays('take meds daily at 10:00')).toBeNull()
    expect(parseEveryNDays('clean apartment every week')).toBeNull()
    expect(parseEveryNDays('gym every day')).toBeNull()
  })

  it('treats "every 1 day" / "every one day" as plain daily (null)', () => {
    expect(parseEveryNDays('stretch every 1 day')).toBeNull()
    expect(parseEveryNDays('stretch every one day')).toBeNull()
  })
})
