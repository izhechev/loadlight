import { describe, it, expect } from 'vitest'
import {
  ensureZ,
  formatTime,
  formatDate,
  toInputDt,
  parseLocal,
  isDueWithin48h,
  difficultyDots,
  parseHHMM,
  fmtMinutes,
  normalizeDt,
  dateKey,
  effectiveDeadline,
} from './taskUtils'

// ─── ensureZ ────────────────────────────────────────────────────────────────

describe('ensureZ', () => {
  it('appends Z to a naive datetime string', () => {
    expect(ensureZ('2026-04-16T20:42')).toBe('2026-04-16T20:42Z')
  })

  it('leaves a string that already has Z unchanged', () => {
    expect(ensureZ('2026-04-16T20:42Z')).toBe('2026-04-16T20:42Z')
  })

  it('leaves a string with a +offset unchanged', () => {
    expect(ensureZ('2026-04-16T20:42+02:00')).toBe('2026-04-16T20:42+02:00')
  })

  it('leaves a string with a -offset unchanged', () => {
    expect(ensureZ('2026-04-16T20:42-05:00')).toBe('2026-04-16T20:42-05:00')
  })
})

// ─── formatTime ─────────────────────────────────────────────────────────────

describe('formatTime', () => {
  it('returns null for null input', () => {
    expect(formatTime(null)).toBeNull()
  })

  it('returns null for midnight (00:00Z) — date-only sentinel', () => {
    expect(formatTime('2026-04-16T00:00Z')).toBeNull()
  })

  it('formats an afternoon time as 12-hour pm', () => {
    expect(formatTime('2026-04-16T20:42Z')).toBe('8:42pm')
  })

  it('formats a morning time as 12-hour am', () => {
    expect(formatTime('2026-04-16T09:05Z')).toBe('9:05am')
  })

  it('formats noon as 12:00pm', () => {
    expect(formatTime('2026-04-16T12:00Z')).toBe('12:00pm')
  })

  it('formats midnight-edge 00:01 correctly', () => {
    expect(formatTime('2026-04-16T00:01Z')).toBe('12:01am')
  })

  it('pads single-digit minutes', () => {
    expect(formatTime('2026-04-16T14:05Z')).toBe('2:05pm')
  })

  it('reads UTC hours — 22:30Z should display as 10:30pm regardless of local tz', () => {
    expect(formatTime('2026-04-16T22:30Z')).toBe('10:30pm')
  })
})

// ─── formatDate ─────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats a date using UTC day and month name', () => {
    expect(formatDate('2026-04-16T20:42Z')).toBe('16 Apr')
  })

  it('formats January correctly', () => {
    expect(formatDate('2026-01-01T00:00Z')).toBe('1 Jan')
  })

  it('formats December correctly', () => {
    expect(formatDate('2026-12-31T23:59Z')).toBe('31 Dec')
  })

  it('returns empty string for invalid input', () => {
    expect(formatDate('not-a-date')).toBe('')
  })
})

// ─── toInputDt ──────────────────────────────────────────────────────────────

describe('toInputDt', () => {
  it('returns empty string for null', () => {
    expect(toInputDt(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(toInputDt(undefined)).toBe('')
  })

  it('converts a UTC Z datetime to datetime-local format using UTC components', () => {
    expect(toInputDt('2026-04-16T20:42Z')).toBe('2026-04-16T20:42')
  })

  it('converts a Supabase space-separated datetime', () => {
    expect(toInputDt('2026-04-16 20:42:00+00')).toBe('2026-04-16T20:42')
  })

  it('strips seconds from datetime-local output', () => {
    expect(toInputDt('2026-04-16T09:05:30Z')).toBe('2026-04-16T09:05')
  })
})

// ─── parseLocal ─────────────────────────────────────────────────────────────

describe('parseLocal', () => {
  it('parses a datetime string with T separator', () => {
    const d = parseLocal('2026-04-16T20:42')
    expect(d).toBeInstanceOf(Date)
    expect(isNaN(d.getTime())).toBe(false)
  })

  it('appends T00:00 to a date-only string to prevent UTC midnight shift', () => {
    const d = parseLocal('2026-04-16')
    // Should be interpreted as local midnight, not UTC midnight
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(3) // April = 3
    expect(d.getDate()).toBe(16)
  })

  it('normalises space separator to T', () => {
    const d = parseLocal('2026-04-16 20:42')
    expect(isNaN(d.getTime())).toBe(false)
  })
})

// ─── isDueWithin48h ─────────────────────────────────────────────────────────

describe('isDueWithin48h', () => {
  it('returns false for null deadline', () => {
    expect(isDueWithin48h(null, Date.now())).toBe(false)
  })

  it('returns false when currentTime is 0 (not yet initialised)', () => {
    expect(isDueWithin48h('2026-04-16T10:00Z', 0)).toBe(false)
  })

  it('returns true for a deadline 1 hour from now', () => {
    const soon = new Date(Date.now() + 3_600_000).toISOString()
    expect(isDueWithin48h(soon, Date.now())).toBe(true)
  })

  it('returns true for an overdue task (deadline in the past)', () => {
    const past = new Date(Date.now() - 3_600_000).toISOString()
    expect(isDueWithin48h(past, Date.now())).toBe(true)
  })

  it('returns false for a deadline 3 days from now', () => {
    const far = new Date(Date.now() + 3 * 86_400_000).toISOString()
    expect(isDueWithin48h(far, Date.now())).toBe(false)
  })

  it('returns true for a deadline exactly 48 hours away', () => {
    const exactly48h = new Date(Date.now() + 172_800_000).toISOString()
    expect(isDueWithin48h(exactly48h, Date.now())).toBe(true)
  })
})

// ─── difficultyDots ─────────────────────────────────────────────────────────

describe('difficultyDots', () => {
  it('returns 5 empty dots for difficulty 0', () => {
    expect(difficultyDots(0)).toBe('○○○○○')
  })

  it('returns 5 filled dots for difficulty 5', () => {
    expect(difficultyDots(5)).toBe('●●●●●')
  })

  it('returns correct mix for difficulty 3', () => {
    expect(difficultyDots(3)).toBe('●●●○○')
  })

  it('returns correct mix for difficulty 1', () => {
    expect(difficultyDots(1)).toBe('●○○○○')
  })

  it('always produces a 5-character string', () => {
    for (let i = 0; i <= 5; i++) {
      expect([...difficultyDots(i)].length).toBe(5)
    }
  })
})

// ─── parseHHMM ──────────────────────────────────────────────────────────────

describe('parseHHMM', () => {
  it('converts "09:00" to 540 minutes', () => {
    expect(parseHHMM('09:00')).toBe(540)
  })

  it('converts "00:00" to 0', () => {
    expect(parseHHMM('00:00')).toBe(0)
  })

  it('converts "23:59" to 1439', () => {
    expect(parseHHMM('23:59')).toBe(1439)
  })

  it('converts "12:30" to 750', () => {
    expect(parseHHMM('12:30')).toBe(750)
  })
})

// ─── fmtMinutes ─────────────────────────────────────────────────────────────

describe('fmtMinutes', () => {
  it('converts 0 to "00:00"', () => {
    expect(fmtMinutes(0)).toBe('00:00')
  })

  it('converts 540 to "09:00"', () => {
    expect(fmtMinutes(540)).toBe('09:00')
  })

  it('converts 1439 to "23:59"', () => {
    expect(fmtMinutes(1439)).toBe('23:59')
  })

  it('converts 750 to "12:30"', () => {
    expect(fmtMinutes(750)).toBe('12:30')
  })

  it('pads hours and minutes with leading zeros', () => {
    expect(fmtMinutes(65)).toBe('01:05')
  })
})

// ─── normalizeDt ────────────────────────────────────────────────────────────

describe('normalizeDt', () => {
  it('replaces space separator with T', () => {
    expect(normalizeDt('2026-04-16 20:42')).toBe('2026-04-16T20:42')
  })

  it('leaves a string with T unchanged', () => {
    expect(normalizeDt('2026-04-16T20:42')).toBe('2026-04-16T20:42')
  })
})

// ─── dateKey ────────────────────────────────────────────────────────────────

describe('dateKey', () => {
  it('extracts the date portion from a datetime string', () => {
    expect(dateKey('2026-04-16T20:42')).toBe('2026-04-16')
  })

  it('extracts the date from a space-separated datetime', () => {
    expect(dateKey('2026-04-16 20:42')).toBe('2026-04-16')
  })

  it('returns a date-only string unchanged', () => {
    expect(dateKey('2026-04-16')).toBe('2026-04-16')
  })
})

// ─── effectiveDeadline ───────────────────────────────────────────────────────
// For non-recurring tasks: returns deadline as-is (or null).
// For daily recurring: advances to the next future occurrence of the time.

describe('effectiveDeadline', () => {
  const nonRecurring = (deadline: string | null) =>
    ({ deadline, recurring: null as string | null, name: 'Test task' })

  const dailyAt = (timeStr: string, name = 'Test task') => ({
    deadline: `2026-01-01T${timeStr}Z`,
    recurring: 'daily' as string | null,
    name,
  })

  it('returns null for a task with no deadline', () => {
    expect(effectiveDeadline(nonRecurring(null), Date.now())).toBeNull()
  })

  it('returns the deadline unchanged for non-recurring tasks', () => {
    expect(effectiveDeadline(nonRecurring('2026-04-20T10:00Z'), Date.now())).toBe('2026-04-20T10:00Z')
  })

  it('returns the stored deadline when it is in the future (daily recurring)', () => {
    const futureMs = new Date('2099-12-31T10:00Z').getTime()
    const task = dailyAt('10:00', 'Task 10:00')
    const result = effectiveDeadline(task, Date.now())
    // Should be a future date, not null
    expect(result).not.toBeNull()
    const resultMs = new Date(result!.replace(' ', 'T').endsWith('Z') ? result! : result! + 'Z').getTime()
    expect(resultMs).toBeGreaterThan(Date.now() - 1000)
  })

  it('advances a past daily deadline to a future occurrence', () => {
    // Deadline is 2026-01-01T08:00Z (past), now is 2026-04-16
    const now = new Date('2026-04-16T12:00Z').getTime()
    const task = dailyAt('08:00')
    const result = effectiveDeadline(task, now)!
    expect(result).not.toBeNull()
    // Result must be in the future
    const resultMs = new Date(result.includes('Z') ? result : result + 'Z').getTime()
    expect(resultMs).toBeGreaterThan(now)
  })

  it('preserves the time-of-day when advancing to next occurrence', () => {
    const now = new Date('2026-04-16T12:00Z').getTime()
    const task = dailyAt('08:00')
    const result = effectiveDeadline(task, now)!
    // Time portion should contain '08:00'
    expect(result).toContain('08:00')
  })
})
