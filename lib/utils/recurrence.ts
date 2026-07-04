// Pure recurrence helpers — single source of truth for how recurring tasks
// get and advance their deadlines. All dates are naive-UTC strings, matching
// the rest of the codebase ("YYYY-MM-DD" or "YYYY-MM-DDTHH:mm").

export interface RecurrenceFields {
  recurring?: string | null
  recurringDays?: number | null
}

/** UTC "YYYY-MM-DD" for a Unix-ms timestamp. */
function utcDateStr(ms: number): string {
  return new Date(ms).toISOString().split('T')[0]
}

/** Add whole days to a "YYYY-MM-DD" string, staying in UTC. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

/**
 * Interval in days implied by a task's recurrence fields, or null when the
 * task does not recur on a day grid. recurringDays > 1 overrides the base
 * cadence (e.g. recurring "daily" + recurringDays 2 = every two days).
 */
export function recurrenceStepDays(rec: RecurrenceFields): number | null {
  const r = rec.recurring
  if (r !== 'daily' && r !== 'weekly') return null
  if (rec.recurringDays && rec.recurringDays > 1) return rec.recurringDays
  return r === 'weekly' ? 7 : 1
}

/**
 * Backfill a concrete deadline for recurring tasks saved without one:
 * today as a date-only string (no invented clock time). Existing deadlines
 * and non-recurring tasks pass through unchanged.
 */
export function ensureRecurringDeadline(
  deadline: string | null | undefined,
  rec: RecurrenceFields,
  nowMs: number,
): string | null {
  if (deadline) return deadline
  if (recurrenceStepDays(rec) === null) return null
  return utcDateStr(nowMs)
}

/**
 * Deadline for the next instance created when a recurring task is completed.
 * Preserves the time portion when present; date-only deadlines stay date-only.
 * Tasks without a deadline advance from today. Returns null for non-recurring.
 */
export function nextRecurrenceDeadline(
  deadline: string | null | undefined,
  rec: RecurrenceFields,
  nowMs: number,
): string | null {
  const step = recurrenceStepDays(rec)
  if (step === null) return null
  const normalized = deadline ? deadline.replace(' ', 'T') : utcDateStr(nowMs)
  const datePart = normalized.split('T')[0]
  const timePart = normalized.includes('T') ? normalized.split('T')[1] : null
  const nextDate = addDays(datePart, step)
  return timePart ? `${nextDate}T${timePart}` : nextDate
}

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }

/**
 * Parse "every N days" phrases from raw task input: "every 2 days",
 * "every two days", "every other day", "every second day" → N.
 * Returns null when absent or when N would be 1 (that's just "daily").
 */
export function parseEveryNDays(input: string): number | null {
  if (/\bevery\s+(other|second)\s+day\b/i.test(input)) return 2
  const m = input.match(/\bevery\s+(\d+|one|two|three|four|five|six|seven)\s+days?\b/i)
  if (!m) return null
  const n = /^\d+$/.test(m[1]) ? parseInt(m[1]) : WORD_NUMBERS[m[1].toLowerCase()]
  return n && n > 1 ? n : null
}

/** Human-readable recurrence badge, or null for non-recurring tasks. */
export function recurringLabel(rec: RecurrenceFields & { recurringHours?: number | null }): string | null {
  if (rec.recurringHours) return `Every ${rec.recurringHours}h`
  if (rec.recurringDays && rec.recurringDays > 1) return `Every ${rec.recurringDays} days`
  if (rec.recurring === 'daily' || rec.recurring === 'weekly') return rec.recurring
  return null
}
