import { buildSchedule, WORK_END_MIN, type DaySchedule } from '@/lib/utils/scheduling'

type Commitment = {
  index: number
  name: string
  start: string | null
  end: string | null
  deadline: string | null
  minutes: number
  priority: number
  difficulty?: number
}

export function conflictOptions(
  tasks: Commitment[], movable: Commitment[], missed: ReadonlySet<string>, baseline: DaySchedule,
  today: string, currentTime: string,
): string[] {
  if (!movable.length && !missed.size) return []
  const now = today + 'T' + currentTime
  const fixed = tasks.filter(task => task.start && task.end)
  const protectedIds = new Set([...baseline.scheduled, ...baseline.overflow].map(task => task.id))
  const due = tasks.filter(task => !task.end && missed.has(String(task.index))).slice(0, 2)
  const dateAt = (minutes: number) =>
    new Date(Date.parse(today + 'T00:00Z') + minutes * 60_000).toISOString().slice(0, 16)
  const minuteOfDay = (stamp: string) => Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16))
  const time = (stamp: string) => stamp.startsWith(today) ? stamp.slice(11) : stamp.replace('T', ' ')
  const makePlan = (move?: { task: Commitment; start: string }, extensions = new Map<number, string | null>()) =>
    buildSchedule(tasks.map(task => ({
      id: String(task.index), name: task.name, start_date: move?.task.index === task.index ? move.start : task.start,
      deadline: extensions.has(task.index) ? extensions.get(task.index) : task.start && task.start === task.deadline ? null : task.deadline,
      estimated_minutes: task.minutes, priority: task.priority, difficulty: task.difficulty,
    })), { today, currentTime })

  function optionsFor(move?: { task: Commitment; start: string }) {
    const trialPlan = makePlan(move, new Map(due.map(task => [task.index, null])))
    const extensions = new Map<number, string | null>()
    for (const task of due) {
      const slot = [...trialPlan.scheduled, ...trialPlan.overflow].find(slot => slot.id === String(task.index))
      if (slot && task.deadline && slot.end_date > (task.deadline.length === 10 ? task.deadline + 'T23:59' : task.deadline)) {
        extensions.set(task.index, slot.end_date)
      }
    }
    const verified = makePlan(move, extensions)
    const slots = new Map([...verified.scheduled, ...verified.overflow].map(slot => [slot.id, slot]))
    if ([...protectedIds].some(id => !slots.has(id))) return
    if (move && slots.get(String(move.task.index))?.start_date !== move.start) return
    const steps: string[] = []
    if (move) {
      const { start_date, end_date } = slots.get(String(move.task.index))!
      steps.push(`Ask to move “${move.task.name}” to ${time(start_date)}–${time(end_date)}.`)
    }
    for (const task of due) {
      const deadline = extensions.get(task.index)
      const slot = slots.get(String(task.index))
      if (deadline && slot && slot.end_date <= deadline) {
        steps.push(`Ask to extend “${task.name}” to ${time(deadline)} and work on it ${time(slot.start_date)}–${time(slot.end_date)}.`)
      }
    }
    return steps.length ? steps.join(' ') : undefined
  }

  const options: string[] = []
  for (const task of movable.filter(task => task.start && task.start > now && task.start.startsWith(today)).slice(0, 2)) {
    const earliest = Math.ceil(Math.max(minuteOfDay(now) + 1, minuteOfDay(task.start!) + 1) / 15) * 15
    for (let minute = earliest; minute + task.minutes <= WORK_END_MIN; minute += 15) {
      const start = dateAt(minute)
      const end = dateAt(minute + task.minutes)
      if (fixed.some(other => other.index !== task.index && start < other.end! && end > other.start!)) continue
      const option = optionsFor({ task, start })
      if (!option) continue
      options.push(option)
      break
    }
  }
  const deadlineOnly = options.length ? undefined : optionsFor()
  return deadlineOnly ? [deadlineOnly] : options
}
