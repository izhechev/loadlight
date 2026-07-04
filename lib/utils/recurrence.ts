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
 * Monthly and yearly tasks recur on the calendar, not a day grid — see
 * nextRecurrenceDeadline.
 */
export function recurrenceStepDays(rec: RecurrenceFields): number | null {
  const r = rec.recurring
  if (r !== 'daily' && r !== 'weekly') return null
  if (rec.recurringDays && rec.recurringDays > 1) return rec.recurringDays
  return r === 'weekly' ? 7 : 1
}

/** Any cadence at all — day-grid or calendar (monthly/yearly). */
export function isRecurring(rec: RecurrenceFields): boolean {
  const r = rec.recurring
  return r === 'daily' || r === 'weekly' || r === 'monthly' || r === 'yearly'
}

/**
 * Add calendar months/years to a "YYYY-MM-DD" string, clamping overflow to
 * the end of the target month (Jan 31 +1mo → Feb 28; Feb 29 +1y → Feb 28).
 */
export function addCalendarUnits(dateStr: string, unit: 'month' | 'year', count: number): string {
  const d = new Date(`${dateStr}T00:00Z`)
  const dayOfMonth = d.getUTCDate()
  if (unit === 'year') d.setUTCFullYear(d.getUTCFullYear() + count)
  else d.setUTCMonth(d.getUTCMonth() + count)
  if (d.getUTCDate() !== dayOfMonth) d.setUTCDate(0) // rolled into next month — clamp back
  return d.toISOString().split('T')[0]
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
  if (!isRecurring(rec)) return null
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
  if (!isRecurring(rec)) return null
  const normalized = deadline ? deadline.replace(' ', 'T') : utcDateStr(nowMs)
  const datePart = normalized.split('T')[0]
  const timePart = normalized.includes('T') ? normalized.split('T')[1] : null
  // For calendar cadences, recurringDays doubles as the interval multiplier
  // (monthly + 3 = every 3 months) — avoids another schema column
  const calCount = rec.recurringDays && rec.recurringDays > 1 ? rec.recurringDays : 1
  const nextDate = rec.recurring === 'yearly' ? addCalendarUnits(datePart, 'year', calCount)
    : rec.recurring === 'monthly' ? addCalendarUnits(datePart, 'month', calCount)
    : addDays(datePart, recurrenceStepDays(rec)!)
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

/**
 * Whether a task should enter the "past deadline" flow when saved.
 * Date-only deadlines count as end-of-day (a task "due 4 Jul" is not overdue
 * during 4 Jul). Recurring tasks are never past at save time — their next
 * occurrence is computed automatically.
 */
export function isPastDeadline(
  deadline: string | null | undefined,
  recurring: string | null | undefined,
  nowMs: number,
): boolean {
  if (!deadline) return false
  if (isRecurring({ recurring })) return false
  let normalized = deadline.replace(' ', 'T')
  if (!normalized.includes('T')) normalized += 'T23:59'
  if (!normalized.endsWith('Z') && !normalized.includes('+')) normalized += 'Z'
  const dl = new Date(normalized)
  if (isNaN(dl.getTime())) return false
  return dl.getTime() < nowMs
}

/** Human-readable recurrence badge, or null for non-recurring tasks. */
export function recurringLabel(rec: RecurrenceFields & { recurringHours?: number | null }): string | null {
  if (rec.recurringHours) return `Every ${rec.recurringHours}h`
  if (rec.recurringDays && rec.recurringDays > 1) {
    if (rec.recurring === 'monthly') return `Every ${rec.recurringDays} months`
    if (rec.recurring === 'yearly') return `Every ${rec.recurringDays} years`
    if (rec.recurring === 'weekly' && rec.recurringDays % 7 === 0) return `Every ${rec.recurringDays / 7} weeks`
    return `Every ${rec.recurringDays} days`
  }
  if (isRecurring(rec)) return rec.recurring as string
  return null
}
