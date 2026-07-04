// Pure planning rules for "Schedule with AI": which tasks belong in today's
// plan, in what order, and inside which working-hours window.

export const WORK_START_MIN = 8 * 60   // 08:00 — never plan into the night
export const WORK_END_MIN = 23 * 60    // 23:00 — wind down before midnight

/**
 * The user's LOCAL calendar date as "YYYY-MM-DD" (optionally offset by days).
 * Never use toISOString() for "today" — that's UTC, and at 1am local it still
 * says yesterday, which dated whole day plans one day early.
 */
export function localDateStr(daysFromToday = 0): string {
  const d = new Date(Date.now() + daysFromToday * 86400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface SchedulableTask {
  id: string
  name: string
  deadline?: string | null
  priority?: number
  difficulty?: number
  done?: boolean
}

/**
 * Tasks that belong in TODAY's plan: due today or tomorrow (calendar days —
 * overdue counts too), or undated tasks (planning assigns them times).
 * Anything dated later stays on its own date, regardless of priority.
 */
export function selectSchedulable<T extends SchedulableTask>(tasks: T[], nowMs: number): T[] {
  const tomorrowStr = new Date(nowMs + 86400_000).toISOString().split('T')[0]
  return tasks.filter(t => {
    if (t.done) return false
    if (!t.deadline) return true
    const dateStr = t.deadline.replace(' ', 'T').split('T')[0]
    return dateStr <= tomorrowStr
  })
}

/** Priority first; within a priority, harder tasks earlier (fresh brain first). */
export function orderByEnergy<T extends SchedulableTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const pa = a.priority ?? 3, pb = b.priority ?? 3
    if (pa !== pb) return pa - pb
    return (b.difficulty ?? 2) - (a.difficulty ?? 2)
  })
}
