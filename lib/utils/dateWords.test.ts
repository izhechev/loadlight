import { describe, it, expect } from 'vitest'
import { requestedWeekday, nextDateForWeekday, correctWeekdayDeadline } from './dateWords'

// Fixed "now": 2026-07-04 is a Saturday (JS getUTCDay() = 6)
const NOW = new Date('2026-07-04T12:00Z').getTime()

// ─── requestedWeekday ────────────────────────────────────────────────────────
// Finds a single explicit weekday word in the raw input (English or Bulgarian).

describe('requestedWeekday', () => {
  it('finds English weekday names, case-insensitive', () => {
    expect(requestedWeekday('do it monday')).toBe(1)
    expect(requestedWeekday('Call by Friday please')).toBe(5)
    expect(requestedWeekday('SUNDAY brunch')).toBe(0)
  })

  it('finds Bulgarian weekday names', () => {
    expect(requestedWeekday('отиди в понеделник')).toBe(1)
    expect(requestedWeekday('срещата е в сряда')).toBe(3)
    expect(requestedWeekday('в събота на пазар')).toBe(6)
  })

  it('returns null when no weekday word is present', () => {
    expect(requestedWeekday('activate the health card tomorrow')).toBeNull()
    expect(requestedWeekday('do laundry daily')).toBeNull()
  })

  it('returns null when two different weekdays are mentioned (ambiguous)', () => {
    expect(requestedWeekday('report friday, call monday')).toBeNull()
  })

  it('treats the same weekday mentioned twice as unambiguous', () => {
    expect(requestedWeekday('monday gym and monday shopping')).toBe(1)
  })
})

// ─── nextDateForWeekday ──────────────────────────────────────────────────────

describe('nextDateForWeekday', () => {
  it('returns the next occurrence after today (Sat 4 Jul → Mon 6 Jul)', () => {
    expect(nextDateForWeekday(1, NOW)).toBe('2026-07-06')
  })

  it('returns today when today matches the requested weekday', () => {
    expect(nextDateForWeekday(6, NOW)).toBe('2026-07-04')
  })

  it('wraps the week correctly (Friday from Saturday → 10 Jul)', () => {
    expect(nextDateForWeekday(5, NOW)).toBe('2026-07-10')
  })
})

// ─── correctWeekdayDeadline ──────────────────────────────────────────────────
// Snaps an AI-produced deadline to the weekday the user actually named.

describe('correctWeekdayDeadline', () => {
  it('fixes a deadline on the wrong weekday, preserving the time', () => {
    // "monday" but AI answered Wednesday 8 Jul
    expect(correctWeekdayDeadline('2026-07-08T00:00', 'отиди в понеделник monday', NOW)).toBe('2026-07-06T00:00')
    expect(correctWeekdayDeadline('2026-07-08T14:30', 'call monday 14:30', NOW)).toBe('2026-07-06T14:30')
  })

  it('keeps date-only deadlines date-only', () => {
    expect(correctWeekdayDeadline('2026-07-08', 'trash monday', NOW)).toBe('2026-07-06')
  })

  it('leaves a deadline alone when its weekday already matches', () => {
    expect(correctWeekdayDeadline('2026-07-13T09:00', 'meeting monday', NOW)).toBe('2026-07-13T09:00')
  })

  it('leaves deadlines alone when no or multiple weekdays are named', () => {
    expect(correctWeekdayDeadline('2026-07-08T00:00', 'do it soon', NOW)).toBe('2026-07-08T00:00')
    expect(correctWeekdayDeadline('2026-07-08T00:00', 'friday and monday', NOW)).toBe('2026-07-08T00:00')
  })

  it('passes null deadlines through', () => {
    expect(correctWeekdayDeadline(null, 'monday', NOW)).toBeNull()
  })

  it('leaves deadlines more than a week away alone (explicit far dates win)', () => {
    // "pay rent on August 1st and call mom monday" — the rent date is not a weekday miss
    expect(correctWeekdayDeadline('2026-08-01T00:00', 'pay rent august 1st and call mom monday', NOW)).toBe('2026-08-01T00:00')
  })
})
