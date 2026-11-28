import type { DemandType, TaskSignalData } from '@/lib/store/overwhelmedStore'
import { toughDayThreshold } from './toughDays'
import { effectiveDeadline } from './taskUtils'

export interface WorkloadTask {
  name: string
  category?: string
  done?: boolean
  status?: string
  deadline?: string | null
  startDate?: string | null
  start_date?: string | null
  estimatedMinutes?: number | null
  estimated_minutes?: number | null
  demandType?: string
  demand_type?: string
  difficulty?: number
  recurring?: string
  recurringDays?: number | null
  recurring_days?: number | null
  snoozedUntil?: number | null
  createdAt?: string | number
  completedAt?: string | number | null
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const taskDay = (date?: string | null) => date?.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
const plannedDay = (task: WorkloadTask) => taskDay('startDate' in task ? task.startDate : task.start_date)
const isComplete = (task: WorkloadTask) => task.done || task.status === 'completed'

export function taskMinutes(task: WorkloadTask): number {
  return ('estimatedMinutes' in task ? task.estimatedMinutes : task.estimated_minutes) ?? 30
}

export function activeWorkload<T extends WorkloadTask>(tasks: readonly T[], now: number): T[] {
  return tasks.filter(task =>
    !isComplete(task) && task.status !== 'archived' && (task.snoozedUntil ?? 0) <= now,
  )
}

export function workloadDeadline(task: WorkloadTask, now: number): string | null {
  const today = dayKey(new Date(now))
  return effectiveDeadline({
    name: task.name,
    deadline: task.deadline ?? null,
    recurring: task.recurring,
    recurringDays: task.recurringDays ?? task.recurring_days,
  }, Date.parse(`${today}T00:00:00Z`) - 1)
}

export function dueIn48Hours(deadline: string | null | undefined, now: number): boolean {
  if (!deadline) return false
  // Stored deadlines use the date and clock the user entered, even when the database adds a zone.
  const time = deadline.slice(11, 16)
  const date = !time || time === '00:00'
    ? `${deadline.slice(0, 10)}T23:59:59`
    : deadline.replace(' ', 'T').slice(0, 19)
  return new Date(date).getTime() <= now + 48 * 60 * 60_000
}

export function getDailyWorkload<T extends WorkloadTask>(tasks: readonly T[], mode: string, now = Date.now()) {
  const today = dayKey(new Date(now))
  const active = activeWorkload(tasks, now).filter(task => {
    const due = taskDay(workloadDeadline(task, now))
    return plannedDay(task) === today || (!!due && due <= today)
  })
  const minutes = active.reduce((total, task) => total + taskMinutes(task), 0)
  const capacity = toughDayThreshold(mode)
  return { today, tasks: active, minutes, capacity, heavy: minutes >= capacity }
}

export function getWeeklyWorkload(tasks: readonly WorkloadTask[], now = Date.now()) {
  const start = new Date(now)
  start.setDate(start.getDate() - (start.getDay() + 6) % 7)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const startDay = dayKey(start)
  const endDay = dayKey(end)
  function inWeek(date?: string) {
    return !!date && date >= startDay && date <= endDay
  }

  const pending = activeWorkload(tasks, now).flatMap(task => {
    const plan = plannedDay(task)
    const due = taskDay(workloadDeadline(task, now))
    const date = inWeek(plan) ? plan : inWeek(due) ? due : undefined
    return date ? [{ task, date }] : []
  })
  const completed = tasks.filter(task => {
    if (!isComplete(task) || task.status === 'archived' || !task.completedAt) return false
    const date = new Date(task.completedAt)
    return !Number.isNaN(date.getTime()) && inWeek(dayKey(date))
  }).length
  const categoryCounts = new Map<string, number>()
  let minutes = 0
  const dailyMinutes = Array<number>(7).fill(0)
  for (const { task, date } of pending) {
    const duration = taskMinutes(task)
    minutes += duration
    const weekday = new Date(`${date}T12:00:00`).getDay()
    dailyMinutes[(weekday + 6) % 7] += duration
    const category = (task.category || 'Other').slice(0, 160)
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1)
  }
  const categories = [...categoryCounts].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([name, count]) => ({ name, count }))

  return { startDay, endDay, pending: pending.length, completed, minutes, dailyMinutes, categories }
}

export type WeeklyWorkload = ReturnType<typeof getWeeklyWorkload>

export function getTaskSignals(tasks: readonly WorkloadTask[], now = Date.now()): TaskSignalData {
  const oldest = now - 7 * 24 * 60 * 60_000
  const active = activeWorkload(tasks, now)
  const finished = tasks.filter(task => isComplete(task) && task.status !== 'archived')
  const demandTypeCounts: Record<DemandType, number> = { cognitive: 0, emotional: 0, creative: 0, routine: 0, physical: 0 }
  const recent = (timestamp?: string | number | null) => {
    if (!timestamp) return false
    const ms = new Date(timestamp).getTime()
    return ms >= oldest && ms <= now
  }
  for (const task of active) {
    const type = ('demandType' in task ? task.demandType : task.demand_type) ?? 'routine'
    demandTypeCounts[Object.hasOwn(demandTypeCounts, type) ? type as DemandType : 'routine']++
  }
  return {
    undoneCount: active.length,
    doneCount: finished.length,
    addedLast7Days: tasks.filter(task => task.status !== 'archived' && recent(task.createdAt)).length,
    completedLast7Days: finished.filter(task => recent(task.completedAt)).length,
    tasksWithDeadlines: active.filter(task => task.deadline).length,
    tasksDueWithin48h: active.filter(task => dueIn48Hours(workloadDeadline(task, now), now)).length,
    demandTypeCounts,
    totalUndoneDifficulty: active.reduce((total, task) => total + (task.difficulty ?? 2), 0),
    totalUndoneMinutes: active.reduce((total, task) => total + taskMinutes(task), 0),
  }
}
