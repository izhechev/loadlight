// Pure planning rules for "Schedule with AI": which tasks belong in today's
// plan, in what order, and inside which working-hours window.

export const WORK_START_MIN = 8 * 60   // 08:00 — never plan into the night
export const WORK_END_MIN = 23 * 60    // 23:00 — wind down before midnight

export interface SchedulableTask {
  id: string
  name: string
  deadline?: string | null
  priority?: number
  difficulty?: number
  done?: boolean
}

const MS_48H = 48 * 3600_000
const MS_7D = 7 * 86400_000

function deadlineMs(deadline: string | null | undefined): number | null {
  if (!deadline) return null
  let n = deadline.replace(' ', 'T')
  if (!n.includes('T')) n += 'T23:59'
  if (!n.endsWith('Z') && !n.includes('+')) n += 'Z'
  const ms = new Date(n).getTime()
  return isNaN(ms) ? null : ms
}

/**
 * Tasks that belong in TODAY's plan: due (or overdue) within 48 hours,
 * P1 tasks due within a week, or undated tasks (planning assigns them times).
 * Far-future tasks stay on their own dates.
 */
export function selectSchedulable<T extends SchedulableTask>(tasks: T[], nowMs: number): T[] {
  return tasks.filter(t => {
    if (t.done) return false
    const dl = deadlineMs(t.deadline)
    if (dl === null) return true
    if (dl - nowMs <= MS_48H) return true
    return (t.priority ?? 3) === 1 && dl - nowMs <= MS_7D
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
