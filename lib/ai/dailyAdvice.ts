import type { DailyAdviceRequest } from './schemas'
import type { Task } from '@/lib/data/tasks'
import { dayKey } from '@/lib/utils/workload'
import { triageTasks, toTriageTask } from './triage'

type DailyPlan = NonNullable<DailyAdviceRequest['plan']>
type PlanTask = NonNullable<DailyPlan['next']>

export function dailyAdvicePlan(tasks: readonly Task[], now: number): DailyPlan {
  const date = new Date(now)
  const today = dayKey(date)
  const currentTime = date.toTimeString().slice(0, 5)
  const { next, appointment, commitments, flexible, conflicts, resolutions } = triageTasks(tasks.map(toTriageTask), today, currentTime)
  const protectedNames = new Set(commitments.map(task => task.name))
  for (const task of flexible) {
    if (task.start) protectedNames.add(task.name)
  }
  const details = ({ name, start, end, deadline, minutes }: PlanTask) => ({ name, start, end, deadline, minutes })
  return {
    today, currentTime,
    next: next && details(next),
    appointment: appointment && details(appointment),
    flexible: flexible.filter(task => !task.start && !protectedNames.has(task.name)).slice(0, 3).map(details),
    conflicts,
    resolutions,
  }
}

function bookingTime(task: PlanTask) {
  const start = task.start?.slice(11, 16)
  const end = task.end?.slice(11, 16)
  return start && end && end > start ? `${start}–${end}` : start
}

export function describeDailyPlan(plan: DailyPlan) {
  if (plan.conflicts?.length) return ''
  const { next, appointment } = plan
  const time = appointment && bookingTime(appointment)
  const booking = appointment && time ? `Keep ${time} for “${appointment.name}”.` : ''
  if (!next || (appointment && next.start === appointment.start && next.name === appointment.name)) {
    return booking
  }
  const dueDay = next.deadline?.slice(0, 10)
  const dueTime = next.deadline?.slice(11, 16)
  const due = dueDay === plan.today ? (dueTime ? `, due by ${dueTime}` : ', due today') : ''
  const first = `Start with “${next.name}” (${next.minutes} min${due}).`
  return booking ? `${first} ${booking}` : first
}

export function dailyAdviceOptions({ plan, todayMinutes, capacityMinutes, urgentCount, taskCount }: DailyAdviceRequest) {
  if (plan?.resolutions?.length) return plan.resolutions
  if (plan?.conflicts?.length) return [
    'Review the flagged commitments first. Confirm any appointment change with the people involved and agree on a new deadline if needed.',
    'Check whether part of the work can be handed off. Keep the listed appointment times until you confirm any change.',
  ]
  const options: string[] = []
  if (todayMinutes != null && capacityMinutes != null) {
    const excess = todayMinutes - capacityMinutes
    if (excess > 0) {
      options.push(`Today is ${excess} min over capacity. One option is to trim the work by ${excess} min or agree on a later deadline.`)
    } else if (excess === 0) {
      options.push(`Today's ${todayMinutes} planned minutes fill your capacity. Leave some room if another task comes in.`)
    }
  }
  if (plan) {
    for (const task of plan.flexible) {
      if (task.start || (task.deadline && task.deadline.slice(0, 10) <= plan.today)) continue
      options.push(`“${task.name}” can wait until today's commitments are covered.`)
    }
  }
  if (urgentCount) {
    options.push(`${urgentCount} ${urgentCount === 1 ? 'task is' : 'tasks are'} overdue or due within 48 hours. Check those deadlines before taking on later work.`)
  }
  if (!options.length && taskCount) options.push('Check the estimates on your open tasks before adding more work.')
  return options
}
