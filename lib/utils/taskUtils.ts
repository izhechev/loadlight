// Pure utility functions shared by the tasks page and tests.

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
  return dt.endsWith('Z') || dt.includes('+') || (dt.includes('-', 10)) ? dt : dt + 'Z'
}

/**
 * Format the time portion of a stored datetime for display.
 * Reads UTC hours because times are stored as naive-UTC (value = intended
 * local time).  Returns null for midnight (= date-only sentinel).
 */
export function formatTime(dt: string | null): string | null {
  if (!dt) return null
  try {
    const date = new Date(normalizeDt(dt))
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
    const d = new Date(normalizeDt(dt))
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
  const d = new Date(normalizeDt(dt))
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

/** Build the ●/○ difficulty dot string (always 5 chars). */
export function difficultyDots(d: number): string {
  return '●'.repeat(d) + '○'.repeat(5 - d)
}

/**
 * For daily recurring tasks: return the next future occurrence of the stored
 * time-of-day.  For all other tasks: return the deadline unchanged.
 * `now` is a Unix-ms timestamp (pass Date.now() in production; injectable for tests).
 */
export function effectiveDeadline(
  task: { deadline: string | null; recurring?: string | null; name: string },
  now: number,
): string | null {
  const dl = task.deadline
  if (!dl || task.recurring !== 'daily') return dl
  const normalized = normalizeDt(dl)
  const base = new Date(normalized)
  if (isNaN(base.getTime())) return dl
  const currentNow = now || Date.now()

  // Determine the time-of-day to use:
  // 1. From the stored deadline (if it has a non-midnight time)
  // 2. From the task name (e.g. "Take Lamictal 10:30") as fallback for legacy midnight entries
  let timeStr = normalized.includes('T') ? normalized.split('T')[1] : '00:00'
  const isMidnight = timeStr.startsWith('00:00')
  if (isMidnight) {
    const nameMatch = task.name.match(/\b(\d{1,2}):(\d{2})\b/)
    if (nameMatch) timeStr = `${nameMatch[1].padStart(2, '0')}:${nameMatch[2]}`
  }

  // Reconstruct a base date combining original date + correct time
  const dateOnlyStr = normalized.split('T')[0]
  const baseWithTime = new Date(`${dateOnlyStr}T${timeStr.split('+')[0].split('Z')[0]}Z`)
  const effectiveBase = isNaN(baseWithTime.getTime()) ? base : baseWithTime

  if (effectiveBase.getTime() > currentNow) return `${dateOnlyStr}T${timeStr}`

  // Advance by full days until it's in the future
  const msPerDay = 86400000
  const elapsed = currentNow - effectiveBase.getTime()
  const daysAhead = Math.ceil(elapsed / msPerDay)
  const next = new Date(effectiveBase.getTime() + daysAhead * msPerDay)
  const yyyy = next.getUTCFullYear()
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(next.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${timeStr}`
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
