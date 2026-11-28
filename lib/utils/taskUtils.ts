// Pure utility functions shared by the tasks page and tests.

import { recurrenceStepDays, addCalendarUnits, localDeadlineMs } from './recurrence'

const UTC_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/** Normalise Supabase "YYYY-MM-DD HH:mm:ss+00" (space) to ISO "T" separator. */
export function normalizeDt(dt: string): string {
  return dt.replace(' ', 'T')
}

/** Extract "YYYY-MM-DD" from either "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm". */
export function dateKey(dt: string): string {
  return normalizeDt(dt).split('T')[0]
}

/**
 * Append 'Z' to a naive datetime string so getUTCHours() reads the intended
 * value.  All times in this codebase are stored as naive-UTC strings.
 */
export function ensureZ(dt: string): string {
  if (!dt.includes('T')) return dt + 'T00:00Z'
  if (/[+-]\d{2}$/.test(dt)) return dt + ':00'
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(dt) ? dt : dt + 'Z'
}

/**
 * Format the time portion of a stored datetime for display.
 * Reads UTC hours because times are stored as naive-UTC (value = intended
 * local time).  Returns null for midnight (= date-only sentinel).
 */
export function formatTime(dt: string | null): string | null {
  if (!dt) return null
  try {
    const date = new Date(ensureZ(normalizeDt(dt)))
    if (isNaN(date.getTime())) return null
    const h = date.getUTCHours()
    const m = date.getUTCMinutes()
    if (h === 0 && m === 0) return null
    const suffix = h >= 12 ? 'pm' : 'am'
    const hour12 = h % 12 || 12
    return `${hour12}:${String(m).padStart(2, '0')}${suffix}`
  } catch { return null }
}

/** Format the date portion of a stored datetime for display using UTC. */
export function formatDate(dt: string): string {
  try {
    const d = new Date(ensureZ(normalizeDt(dt)))
    if (isNaN(d.getTime())) return ''
    return `${d.getUTCDate()} ${UTC_MONTHS[d.getUTCMonth()]}`
  } catch { return '' }
}

/**
 * Convert a stored datetime to the value expected by a datetime-local input.
 * Uses UTC components because times are stored as naive-UTC.
 */
export function toInputDt(dt: string | null | undefined): string {
  if (!dt) return ''
  const d = new Date(ensureZ(normalizeDt(dt)))
  if (isNaN(d.getTime())) return dt.replace(' ', 'T').slice(0, 16)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/**
 * Safe local-time date parse — appends T00:00 to date-only strings to prevent
 * the UTC-midnight timezone shift that Date("YYYY-MM-DD") causes.
 */
export function parseLocal(dt: string): Date {
  const n = normalizeDt(dt)
  return new Date(n.includes('T') ? n : n + 'T00:00')
}

/** Returns true when deadline is overdue or due within the next 48 hours. */
export function isDueWithin48h(deadline: string | null, currentTime: number): boolean {
  if (!deadline || currentTime === 0) return false
  const ms = new Date(deadline).getTime() - currentTime
  return ms <= 172_800_000
}

/**
 * Classify a deadline for badge display: 'overdue' when missed, 'due-soon'
 * within the next 48 hours, null otherwise. Date-only deadlines count as
 * end-of-day — a task "due 4 Jul" is not overdue during 4 Jul.
 */
export function deadlineStatus(deadline: string | null, currentTime: number): 'overdue' | 'due-soon' | null {
  if (!deadline || currentTime === 0) return null
  const ms = localDeadlineMs(deadline) - currentTime
  if (isNaN(ms)) return null
  if (ms < 0) return 'overdue'
  if (ms <= 172_800_000) return 'due-soon'
  return null
}

/** Build the ●/○ difficulty dot string (always 5 chars). */
export function difficultyDots(d: number): string {
  return '●'.repeat(d) + '○'.repeat(5 - d)
}

/**
 * For recurring tasks: return the next future occurrence on the task's day
 * grid (daily = 1, weekly = 7, recurringDays = N), preserving time-of-day.
 * For all other tasks: return the deadline unchanged.
 * `now` is a Unix-ms timestamp (pass Date.now() in production; injectable for tests).
 */
export function effectiveDeadline(
  task: { deadline: string | null; recurring?: string | null; recurringDays?: number | null; name: string },
  now: number,
): string | null {
  const dl = task.deadline
  if (!dl) return dl

  // Calendar cadences (monthly/yearly) advance by calendar units, not days —
  // a birthday stays on its date across leap years and month lengths
  const unit = task.recurring === 'yearly' ? 'year' as const : task.recurring === 'monthly' ? 'month' as const : null
  if (unit) {
    const normalized = normalizeDt(dl)
    const datePart = normalized.split('T')[0]
    const timePart = normalized.includes('T') ? normalized.split('T')[1] : null
    const currentNow = now || Date.now()
    const ts = (dateStr: string) => new Date(`${dateStr}T${(timePart ?? '23:59').split('+')[0].split('Z')[0]}Z`).getTime()
    const calCount = task.recurringDays && task.recurringDays > 1 ? task.recurringDays : 1
    let dateStr = datePart
    let guard = 0
    while (!isNaN(ts(dateStr)) && ts(dateStr) <= currentNow && guard++ < 600) {
      dateStr = addCalendarUnits(dateStr, unit, calCount)
    }
    if (dateStr === datePart) return dl
    return timePart ? `${dateStr}T${timePart}` : dateStr
  }

  const step = recurrenceStepDays(task)
  if (step === null) return dl
  const normalized = normalizeDt(dl)
  const date = dateKey(normalized)
  const storedTime = normalized.split('T')[1]
  const nameTime = task.name.match(/\b(\d{1,2}):(\d{2})\b/)
  const time = storedTime && !storedTime.startsWith('00:00') ? storedTime
    : nameTime ? nameTime[1].padStart(2, '0') + ':' + nameTime[2] : null
  const base = Date.parse(ensureZ(date + 'T' + (time || '23:59:59.999')))
  if (!Number.isFinite(base)) return dl
  const period = step * 86_400_000
  const elapsedPeriods = Math.max(0, Math.ceil((now - base) / period))
  const next = new Date(base + elapsedPeriods * period).toISOString().slice(0, 10)
  return time ? next + 'T' + time : next
}

/** Parse "HH:MM" into total minutes since midnight. */
export function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

/** Format total minutes since midnight as "HH:MM". */
export function fmtMinutes(min: number): string {
  return `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`
}
