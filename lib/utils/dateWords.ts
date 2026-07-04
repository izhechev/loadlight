// Weekday words in raw task input (English and Bulgarian) and deterministic
// date correction — LLMs routinely miscompute weekdays from a bare date, so
// the date the user names by weekday is snapped after extraction.

// JS getUTCDay() numbering: Sun=0 … Sat=6
const WEEKDAY_PATTERNS: { day: number; re: RegExp }[] = [
  { day: 0, re: /\bsunday\b|неделя/i },
  { day: 1, re: /\bmonday\b|понеделник/i },
  { day: 2, re: /\btuesday\b|вторник/i },
  { day: 3, re: /\bwednesday\b|сряда/i },
  { day: 4, re: /\bthursday\b|четвъртък/i },
  { day: 5, re: /\bfriday\b|петък/i },
  { day: 6, re: /\bsaturday\b|събота/i },
]

/**
 * The single weekday explicitly named in the input, or null when none or
 * several different ones are named (ambiguous — leave the AI's dates alone).
 */
export function requestedWeekday(text: string): number | null {
  const found = WEEKDAY_PATTERNS.filter(w => w.re.test(text)).map(w => w.day)
  return found.length === 1 ? found[0] : null
}

/** Next occurrence of the weekday on/after today, as "YYYY-MM-DD" (UTC). */
export function nextDateForWeekday(day: number, nowMs: number): string {
  const now = new Date(nowMs)
  const daysAhead = (day - now.getUTCDay() + 7) % 7
  const next = new Date(nowMs + daysAhead * 86400000)
  return next.toISOString().split('T')[0]
}

/**
 * If the input names exactly one weekday and the deadline falls on a
 * different weekday, move the deadline to the next occurrence of the named
 * weekday, preserving any time portion.
 */
export function correctWeekdayDeadline(
  deadline: string | null | undefined,
  inputText: string,
  nowMs: number,
): string | null {
  if (!deadline) return deadline ?? null
  const wanted = requestedWeekday(inputText)
  if (wanted === null) return deadline
  const normalized = deadline.replace(' ', 'T')
  const datePart = normalized.split('T')[0]
  const timePart = normalized.includes('T') ? normalized.split('T')[1] : null
  const current = new Date(`${datePart}T00:00Z`)
  if (isNaN(current.getTime()) || current.getUTCDay() === wanted) return deadline
  // Only correct near dates — a deadline more than a week out is an explicit
  // date the AI chose for other words in the input, not a weekday miss
  if (current.getTime() - nowMs > 7 * 86400000) return deadline
  const fixedDate = nextDateForWeekday(wanted, nowMs)
  return timePart ? `${fixedDate}T${timePart}` : fixedDate
}
