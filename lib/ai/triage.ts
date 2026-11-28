import type { Task } from '@/lib/data/tasks'
import { buildSchedule, DEADLINE_NO_ROOM, resolveFixedStart, WORK_END_MIN } from '@/lib/utils/scheduling'
import { effectiveDeadline, normalizeDt } from '@/lib/utils/taskUtils'
import { activeWorkload } from '@/lib/utils/workload'
import type { ChatTask } from './schemas'
import { conflictOptions } from './conflictOptions'

export function toTriageTask(task: Task): ChatTask {
  const cadence = task.recurring
  const demand = task.demandType
  return {
    id: task.id, name: task.name, category: task.category, priority: task.priority, difficulty: task.difficulty,
    deadline: task.deadline, start_date: task.startDate, estimated_minutes: task.estimatedMinutes,
    done: task.done, status: task.status, snoozedUntil: task.snoozedUntil,
    demand_type: demand === 'physical' || demand === 'emotional' || demand === 'creative' || demand === 'cognitive' ? demand : 'routine',
    recurring: cadence === 'daily' || cadence === 'weekly' || cadence === 'monthly' || cadence === 'yearly' ? cadence : 'none',
    recurring_days: task.recurringDays,
  }
}

function wallTime(value?: string | null) {
  if (!value) return null
  const stamp = normalizeDt(value).slice(0, 16)
  return stamp.endsWith('T00:00') ? stamp.slice(0, 10) : stamp
}

function addMinutes(stamp: string, minutes: number) {
  // LoadLight stores the entered wall clock, including when the database appends a zone.
  return new Date(Date.parse(stamp + 'Z') + minutes * 60_000).toISOString().slice(0, 16)
}

function showTime(stamp: string, today: string) {
  return stamp.startsWith(today) ? stamp.slice(11) || 'end of today' : stamp.replace('T', ' ')
}

export function triageTasks(tasks: readonly ChatTask[], today: string, currentTime: string) {
  const now = today + 'T' + currentTime
  const dayStart = Date.parse(today + 'T00:00Z')
  const seen = new Set<string>()
  const rows = activeWorkload(tasks, Date.now()).flatMap((task, index) => {
    if (task.id && seen.has(task.id)) return []
    if (task.id) seen.add(task.id)
    const recurrence = { ...task, deadline: task.deadline ?? null, recurringDays: task.recurring_days }
    let deadline = wallTime(effectiveDeadline(recurrence, dayStart - 1))
    const minutes = Math.max(1, task.estimated_minutes ?? 30)
    const recurringSlot = task.recurring && task.recurring !== 'none' && deadline?.includes('T') ? deadline : null
    const savedStart = wallTime(task.start_date)
    let start = wallTime(resolveFixedStart(savedStart, recurringSlot, today)) ?? savedStart
    if (recurringSlot && start === recurringSlot && addMinutes(recurringSlot, minutes) <= now) {
      deadline = wallTime(effectiveDeadline(recurrence, Date.parse(now + 'Z')))
      start = deadline
    }
    const end = start?.includes('T') ? addMinutes(start, minutes) : null
    const dueBy = deadline?.length === 10 ? deadline + 'T23:59' : deadline
    const dueToday = !!deadline && deadline.slice(0, 10) <= today
    const onToday = start?.slice(0, 10) === today || (!!start && start < now && !!end && end > now)
    let reason = 'No deadline'
    if (deadline) reason = dueBy && dueBy < now ? 'Past due ' + deadline.replace('T', ' ') : dueToday && deadline.startsWith(today)
      ? 'Due today' + (deadline.includes('T') ? ' ' + deadline.slice(11) : '')
      : 'Due ' + deadline.replace('T', ' ')
    if (end && start) {
      const fixed = 'Fixed ' + (start.startsWith(today) ? start.slice(11) : start.replace('T', ' ')) + '–' +
        (end.slice(0, 10) === start.slice(0, 10) ? end.slice(11) : end.replace('T', ' '))
      reason = (end <= now ? fixed + ' (past)' : fixed) + (deadline && deadline !== start ? ' · ' + reason : '')
    } else if (start && !deadline) reason = onToday ? 'Planned today' : 'Planned ' + start
    const when = end && start && (onToday || !dueBy) ? start : dueBy ?? (start ?? today) + 'T23:59'
    return [{
      index, name: task.name, priority: task.priority ?? 3, difficulty: task.difficulty, demand: task.demand_type,
      deadline, start, end, minutes, reason, when, committed: onToday || dueToday,
    }]
  })
  const commitments = rows.filter(row => row.committed).sort((a, b) => a.when.localeCompare(b.when) || a.priority - b.priority)
  const flexible = rows.filter(row => !row.committed)
  const overlaps: string[] = []
  const movable = new Map<number, (typeof commitments)[number]>()
  const bookings = commitments.flatMap(task =>
    task.start && task.end && task.end > now ? [{ ...task, start: task.start, end: task.end }] : [],
  ).sort((a, b) => a.start.localeCompare(b.start))
  let furthestBooking: (typeof bookings)[number] | undefined
  for (const task of bookings) {
    if (furthestBooking && task.start < furthestBooking.end) {
      const label = (booking: typeof task) => `“${booking.name}” (${showTime(booking.start, today)}–${showTime(booking.end, today)})`
      overlaps.push(`${label(furthestBooking)} overlaps with ${label(task)}.`)
      movable.set(task.index, task)
      movable.set(furthestBooking.index, furthestBooking)
    }
    if (!furthestBooking || task.end > furthestBooking.end) furthestBooking = task
  }
  const plan = buildSchedule(commitments.map(task => ({
    id: String(task.index), name: task.name, start_date: task.start,
    deadline: task.start && task.start === task.deadline ? null : task.deadline,
    estimated_minutes: task.minutes, priority: task.priority, difficulty: task.difficulty,
  })), { today, currentTime })
  const missed = new Set(plan.unscheduled.filter(task => task.reason === DEADLINE_NO_ROOM).map(task => task.id))
  const deadlineWarnings = commitments.flatMap(task => {
    if (!task.deadline || !missed.has(String(task.index))) return []
    const due = showTime(task.deadline, today)
    const reason = task.when < now ? 'is past due' : 'has no room before its deadline'
    return [`“${task.name}” (${task.minutes} min, due ${due}) ${reason}.`]
  })
  const conflicts = [...overlaps.slice(0, 1), ...deadlineWarnings, ...overlaps.slice(1)]
  const booking = commitments.find(row => row.start && row.end && row.end > now && row.start.slice(0, 10) <= today)
  const closing = addMinutes(today + 'T00:00', WORK_END_MIN)
  const work = commitments.find(row => {
    if (row.end || missed.has(String(row.index)) || (row.start && row.start > today)) return false
    const finish = addMinutes(now, row.minutes)
    return (!booking?.start || finish <= booking.start) && finish <= row.when && finish <= closing
  })
  const next = work ?? booking ?? null
  if (next && commitments[0] !== next) {
    commitments.splice(commitments.indexOf(next), 1)
    commitments.unshift(next)
  }
  const resolutions = conflictOptions(
    [...commitments, ...flexible.filter(task => task.end || task.deadline)],
    [...movable.values()].sort((a, b) => (b.start ?? '').localeCompare(a.start ?? '')),
    missed, plan, today, currentTime,
  )
  return { commitments, flexible, next, appointment: booking ?? null, conflicts, resolutions }
}
