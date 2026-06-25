import type { BalanceResult, RemoveItem } from './balance'

export interface LoadTask {
  id: string
  name: string
  priority?: number
  estimated_minutes?: number | null
  done?: boolean
}
export interface DayHistoryEntry { date: string; minutes: number }

const HEALTH = /pill|medication|medicine|vitamin|supplement|therapy|doctor|medical|lamictal|lithium/i

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
  let count = 0
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].minutes >= threshold) count++
    else break
  }
  return count
}

/** Deterministic tough-day advisory: drop the heaviest, lowest-priority, non-health tasks. */
export function buildToughDayResult(tasks: LoadTask[], balanceMode: string, recentToughDays: number): BalanceResult {
  const droppable = tasks
    .filter(t => !t.done && (t.priority ?? 3) > 1 && !HEALTH.test(t.name ?? ''))
    .sort((a, b) => (b.estimated_minutes ?? 30) - (a.estimated_minutes ?? 30))
    .slice(0, 3)
  const remove: RemoveItem[] = droppable.map(t => ({
    id: t.id,
    name: t.name,
    reason: `${t.estimated_minutes ?? 30} min — one of the heaviest`,
  }))
  const streak = recentToughDays >= 2 ? `${recentToughDays} heavy days in a row` : 'a heavy day'
  return {
    verdict: 'too_much',
    headline: 'Heavy day — you might ease off',
    reason: `Your tasks add up to a lot of time today (${streak}). You might consider moving one of the heavier ones.`,
    remove,
    add: [],
  }
}
