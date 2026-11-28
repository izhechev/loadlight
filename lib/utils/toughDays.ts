import type { BalanceResult, RemoveItem } from './balance'

export interface LoadTask {
  id: string
  name: string
  category?: string
  deadline?: string | null
  recurring?: string
  priority?: number
  estimated_minutes?: number | null
  done?: boolean
}
export interface DayHistoryEntry { date: string; minutes: number }

const HEALTH = /\b(health|pills?|medications?|medicine|vitamins?|supplements?|therapy|doctors?|medic(al|ation)|dentist|dental|prescription|appointment|lamictal|lithium)\b/i

/** Daily "heavy day" cutoff in minutes, scaling with balance mode. */
export function toughDayThreshold(balanceMode: string): number {
  if (balanceMode === 'chill') return 120
  if (balanceMode === 'beast') return 360
  return 240 // average / default
}

/** Total estimated minutes of active tasks — combines quantity and time-difficulty. */
export function dayLoadMinutes(tasks: LoadTask[]): number {
  return tasks
    .filter(t => !t.done)
    .reduce((sum, t) => sum + (t.estimated_minutes ?? 30), 0)
}

export function isToughDay(loadMinutes: number, balanceMode: string): boolean {
  return loadMinutes >= toughDayThreshold(balanceMode)
}

/** Consecutive tough days ending at the most recent history entry. */
export function countRecentToughDays(history: DayHistoryEntry[], balanceMode: string): number {
  const threshold = toughDayThreshold(balanceMode)
  const ordered = [...history].sort((a, b) => b.date.localeCompare(a.date))
  let count = 0
  let previousDate: number | null = null
  for (const entry of ordered) {
    const date = Date.parse(entry.date)
    if (!Number.isFinite(date) || entry.minutes < threshold) break
    if (previousDate === date) continue
    if (previousDate !== null && previousDate - date !== 86_400_000) break
    previousDate = date
    count++
  }
  return count
}

export function canDeferTask(task: Omit<LoadTask, 'id'>, deferThrough?: string): boolean {
  if (task.done || (task.recurring && task.recurring !== 'none') || (task.priority ?? 3) < 3 || HEALTH.test(`${task.name} ${task.category ?? ''}`)) return false
  return !task.deadline || (!!deferThrough && task.deadline.slice(0, 10) > deferThrough)
}

export function buildToughDayResult(tasks: LoadTask[], balanceMode: string, recentToughDays: number, deferThrough?: string): BalanceResult {
  const remove: RemoveItem[] = tasks
    .filter(task => canDeferTask(task, deferThrough))
    .sort((a, b) => (b.priority ?? 3) - (a.priority ?? 3) || (b.estimated_minutes ?? 30) - (a.estimated_minutes ?? 30))
    .slice(0, 3)
    .map(task => ({ id: task.id, name: task.name, reason: `${task.estimated_minutes ?? 30} min and no deadline in the next week` }))
  const streak = recentToughDays >= 2 ? ` You’ve had ${recentToughDays} heavy days in a row.` : ''
  const next = remove.length > 0
    ? ' Consider moving a lower-priority task.'
    : ' Review your time estimates and commitments.'
  return {
    verdict: 'too_much',
    headline: 'Heavy day',
    reason: `${dayLoadMinutes(tasks)} min planned against your ${toughDayThreshold(balanceMode)} min capacity.${streak}${next}`,
    remove,
    add: [],
  }
}
