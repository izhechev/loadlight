import type { Task } from '@/lib/data/tasks'

export function estimateFromHistory(
  draft: { name: string; category: string; demand_type: string },
  history: readonly Task[],
): number | null {
  const normalize = (name: string) => name.toLowerCase().trim().replace(/\s+/g, ' ')
  const key = normalize(draft.name)
  const recorded = history.filter(task => typeof task.actualMinutes === 'number' &&
    Number.isInteger(task.actualMinutes) && task.actualMinutes >= 1 && task.actualMinutes <= 10080 &&
    (task.completedAt || task.done || task.status === 'completed'))
  const same = recorded.filter(task => normalize(task.name) === key)
  const similar = recorded.filter(task => normalize(task.category) === normalize(draft.category) &&
    task.demandType === draft.demand_type)
  const matches = same.length >= 2 ? same : similar.length >= 3 ? similar : []
  const durations = [...matches].sort((a, b) => Date.parse(b.completedAt ?? b.createdAt ?? '1970-01-01') -
    Date.parse(a.completedAt ?? a.createdAt ?? '1970-01-01')).slice(0, 12)
    .map(task => task.actualMinutes!).sort((a, b) => a - b)
  if (!durations.length) return null
  const middle = Math.floor(durations.length / 2)
  return Math.round(durations.length % 2 ? durations[middle] : (durations[middle - 1] + durations[middle]) / 2)
}
