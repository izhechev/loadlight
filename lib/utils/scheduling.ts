import { dateKey, effectiveDeadline } from './taskUtils'

export const WORK_START_MIN = 8 * 60
export const WORK_END_MIN = 23 * 60

function shiftDate(date: string, days: number): string {
  const calendar = new Date(date + 'T00:00:00Z')
  calendar.setUTCDate(calendar.getUTCDate() + days)
  return calendar.toISOString().slice(0, 10)
}

export function localDateStr(daysFromToday = 0, nowMs = Date.now()): string {
  const date = new Date(nowMs)
  date.setDate(date.getDate() + daysFromToday)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export interface SchedulableTask {
  id?: string
  name: string
  deadline?: string | null
  start_date?: string | null
  estimated_minutes?: number | null
  priority?: number
  difficulty?: number
  done?: boolean
  status?: string
  snoozedUntil?: number | null
  recurring?: string
  recurring_days?: number | null
}

export function selectSchedulable<T extends SchedulableTask>(tasks: T[], nowMs: number, today = localDateStr(0, nowMs)): T[] {
  const tomorrow = shiftDate(today, 1)
  return tasks.filter(task => {
    if (task.done || task.status === 'archived' || task.status === 'completed' || (task.snoozedUntil ?? 0) > nowMs) return false
    const start = task.start_date && dateKey(task.start_date)
    return !task.deadline || dateKey(task.deadline) <= tomorrow || start === today || start === tomorrow
  })
}

export function orderByEnergy<T extends SchedulableTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const priority = (a.priority ?? 3) - (b.priority ?? 3)
    if (priority) return priority
    return dueKey(a.deadline).localeCompare(dueKey(b.deadline)) || (b.difficulty ?? 2) - (a.difficulty ?? 2)
  })
}

type Slot = { start: number; end: number }
type TimedTask = { id: string; name: string; start_date: string; end_date: string }

export interface DaySchedule {
  date: string
  overflowDate: string
  scheduled: TimedTask[]
  overflow: TimedTask[]
  unscheduled: { id: string; name: string; reason: string }[]
  unusedNotes: string[]
}

const CLOCK = /\b((?:[01]?\d|2[0-3]):[0-5]\d)\b/.source

function clockMinutes(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number)
  return hours * 60 + minutes
}

function timestampTime(timestamp?: string | null): string | undefined {
  return timestamp?.match(/[T ]((?:[01]\d|2[0-3]):[0-5]\d)/)?.[1]
}

function dueKey(deadline?: string | null): string {
  if (!deadline) return '9999'
  const time = timestampTime(deadline)
  return `${dateKey(deadline)}T${time && time !== '00:00' ? time : '23:59'}`
}

export function resolveFixedStart(start: string | null | undefined, recurringSlot: string | null | undefined, today: string): string | null {
  const time = timestampTime(start)
  const saved = time && time !== '00:00' ? start : null
  if (saved && dateKey(saved) >= today) return saved
  return recurringSlot || saved || null
}

function clockLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function firstFreeSlot(blocked: Slot[], from: number, until: number, duration: number): number | null {
  let start = from
  for (const slot of [...blocked].sort((a, b) => a.start - b.start)) {
    if (start + duration <= slot.start) break
    start = Math.max(start, slot.end)
  }
  return start + duration <= until ? start : null
}

export function buildSchedule(
  tasks: SchedulableTask[],
  { today, currentTime, overflowDate, text = '', nowMs = Date.now() }:
    { today: string; currentTime: string; overflowDate?: string; text?: string; nowMs?: number },
): DaySchedule {
  const now = clockMinutes(currentTime)
  const date = now >= WORK_END_MIN ? shiftDate(today, 1) : today
  const earliestOverflow = shiftDate(date, 1)
  const next = overflowDate && overflowDate >= earliestOverflow ? overflowDate : earliestOverflow

  const notes = text.split(/[;\n]+|[.!?](?=\s|$)/).map(value => value.trim()).filter(Boolean).map(original => {
    const exactDates = [...original.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)]
    const dates = exactDates.length ? exactDates : [...original.matchAll(/\b(?:today|tomorrow)\b/gi)]
    const qualifier = dates[0]?.[0].toLowerCase()
    const day = qualifier === 'today' ? today : qualifier === 'tomorrow' ? shiftDate(today, 1) : qualifier ?? date
    return {
      original,
      date: dates.length > 1 ? '' : day,
      text: dates.length ? original.replace(dates[0][0], '').replace(/\s+/g, ' ').trim() : original,
      matched: [] as string[],
    }
  })
  const matches = (pattern: string, targetDate?: string) => notes.flatMap(note =>
    (!targetDate && [date, next].includes(note.date) || note.date === targetDate)
      ? [...note.text.matchAll(new RegExp(pattern, 'gi'))].map(match => ({ note, match }))
      : [],
  )
  const consume = (pattern: string, targetDate?: string) => matches(pattern, targetDate).map(({ note, match }) => {
    note.matched.push(match[0])
    return { match, date: note.date }
  })
  const makeDay = (dayDate: string, start: number) => {
    const blocked = matches(`\\b(?:busy|unavailable|not available|blocked|away|occupied)\\s+(?:from\\s+)?${CLOCK}\\s*(?:to|until|[-–—])\\s*${CLOCK}`, dayDate)
      .flatMap(({ note, match: [chunk, from, until] }) => {
        const slot = { start: clockMinutes(from), end: clockMinutes(until) }
        if (slot.start >= slot.end) return []
        note.matched.push(chunk)
        return [slot]
      })
    const starts = consume(`(?<!not\\s)\\b(?:(?:start|begin|available|work)\\s+(?:at|after|from)|(?:start|begin)\\s+no earlier than|(?:busy|unavailable|not available|blocked|away)\\s+until|(?:cannot|can't|must not)\\s+(?:start|begin)\\s+before)\\s+${CLOCK}`, dayDate)
      .map(({ match }) => clockMinutes(match[1]))
    const ends = consume(`(?<!not\\s)\\b(?:(?:stop|end|finish)\\s+(?:at|before|by|no later than)|(?:work|available)\\s+(?:only\\s+)?until|(?:busy|unavailable|not available|blocked|away)\\s+after)\\s+${CLOCK}`, dayDate)
      .map(({ match }) => clockMinutes(match[1]))
    return { date: dayDate, start: Math.max(start, WORK_START_MIN, ...starts), end: Math.min(WORK_END_MIN, ...ends), blocked }
  }
  const day = makeDay(date, date === today ? now : WORK_START_MIN)
  const overflowDay = makeDay(next, WORK_START_MIN)
  const plan: DaySchedule = { date, overflowDate: next, scheduled: [], overflow: [], unscheduled: [], unusedNotes: [] }
  const active = tasks.filter(task => task.id && !task.done && task.status !== 'archived' && task.status !== 'completed' &&
    !(task.snoozedUntil && task.snoozedUntil > nowMs))
  const cutoff = shiftDate(date, 1)
  const planningNow = Date.parse(`${today}T${clockLabel(now)}:00Z`)
  const seen = new Set<string>()
  const prepared = orderByEnergy(active.flatMap(task => {
    const id = task.id!
    if (seen.has(id)) return []
    seen.add(id)
    const recurring = task.recurring && task.recurring !== 'none'
    const duration = Math.max(1, task.estimated_minutes ?? 30)
    const deadlineTime = timestampTime(task.deadline)
    // Legacy date-only deadlines were stored at midnight.
    const hasDeadlineTime = Boolean(deadlineTime && deadlineTime !== '00:00')
    const recurringDeadline = recurring && task.deadline
      ? effectiveDeadline(
        { name: task.name, deadline: task.deadline, recurring: task.recurring, recurringDays: task.recurring_days },
        hasDeadlineTime ? planningNow - duration * 60_000 + 1 : Date.parse(`${today}T00:00:00Z`) - 1,
      )
      : task.deadline
    const savedStart = task.start_date
    const earliestDate = savedStart ? dateKey(savedStart) : null
    const escapedName = task.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const namedTime = (phrase: string) => {
      const matchesForTask = matches(`(?:^|[\\s,;])${escapedName}\\s+${phrase}${CLOCK}`)
      if (matchesForTask.length !== 1) return
      const [{ note, match }] = matchesForTask
      note.matched.push(match[0])
      return { match, date: note.date }
    }
    const fixedHint = namedTime('(?:is\\s+)?(?:at\\s+|@\\s*)')
    const dueHint = namedTime('(?:due\\s+|must\\s+(?:finish|be done)\\s+)?(?:by|before)\\s+')
    const hintedDeadline = dueHint ? `${dueHint.date}T${dueHint.match[1].padStart(5, '0')}` : null
    const deadline = hintedDeadline && dueKey(hintedDeadline) < dueKey(recurringDeadline) ? hintedDeadline : recurringDeadline
    const skip = consume(`\\bskip\\s+${escapedName}(?=$|[,.!?;\\n]|\\s+and\\b)`, date).length > 0
    const recurringSlot = recurring && hasDeadlineTime ? recurringDeadline : null
    const anchor = resolveFixedStart(savedStart, recurringSlot, today) || (fixedHint ? `${fixedHint.date}T${fixedHint.match[1].padStart(5, '0')}` : null)
    const recurringAnchor = recurringSlot && dueKey(anchor) === dueKey(recurringSlot) ? recurringSlot : null
    if (anchor && dateKey(anchor) > date && dateKey(anchor) !== next) return []
    if (!anchor && earliestDate && earliestDate > next) return []
    if (!anchor && !earliestDate && deadline && dateKey(deadline) > cutoff) return []
    return [{ ...task, id, deadline, duration, anchor, skip, recurringAnchor, earliestDate }]
  }))

  type PreparedTask = (typeof prepared)[number]
  const deadlineLimit = (task: PreparedTask, target: typeof day): number => {
    if (!task.deadline || task.deadline === task.recurringAnchor) return target.end
    const dueDay = dateKey(task.deadline)
    if (dueDay < target.date) return 0
    if (dueDay > target.date) return target.end
    return Math.min(target.end, clockMinutes(dueKey(task.deadline).slice(11)))
  }
  const add = (task: PreparedTask, target: typeof day, start: number) => {
    const end = start + task.duration
    target.blocked.push({ start, end })
    const result = target === day ? plan.scheduled : plan.overflow
    result.push({ id: task.id, name: task.name, start_date: `${target.date}T${clockLabel(start)}`, end_date: `${target.date}T${clockLabel(end)}` })
  }
  const unscheduled = (task: PreparedTask, reason: string) => plan.unscheduled.push({ id: task.id, name: task.name, reason })

  for (const task of prepared) {
    if (task.skip) {
      unscheduled(task, 'Skipped in your planning notes.')
    } else if (task.anchor) {
      const anchorDate = dateKey(task.anchor)
      if (anchorDate < date) {
        unscheduled(task, 'Fixed start already passed. Edit the task to move it.')
        continue
      }
      const target = anchorDate === date ? day : overflowDay
      const time = timestampTime(task.anchor)
      const start = time ? clockMinutes(time) : target.start
      if (start >= target.start && firstFreeSlot(target.blocked, start, deadlineLimit(task, target), task.duration) === start) {
        add(task, target, start)
      } else {
        target.blocked.push({ start, end: start + task.duration })
        unscheduled(task, `Fixed start (${dateKey(task.anchor)} ${time ?? clockLabel(start)}) conflicts with the plan.`)
      }
    }
  }

  // Fixed starts are reserved above. Equal deadlines retain the existing priority and difficulty order.
  const flexible = prepared.filter(task => !task.skip && !task.anchor)
    .sort((a, b) => dueKey(a.deadline).localeCompare(dueKey(b.deadline)))
  let todayDeadlinesEnd = day.start
  for (const task of flexible) {
    const dueToday = task.deadline && dateKey(task.deadline) === day.date
    const fitToday = task.earliestDate && task.earliestDate > day.date ? null :
      firstFreeSlot(day.blocked, dueToday ? day.start : todayDeadlinesEnd, deadlineLimit(task, day), task.duration)
    if (fitToday !== null) {
      add(task, day, fitToday)
      if (dueToday) todayDeadlinesEnd = Math.max(todayDeadlinesEnd, fitToday + task.duration)
      continue
    }
    const fitLater = firstFreeSlot(overflowDay.blocked, overflowDay.start, deadlineLimit(task, overflowDay), task.duration)
    if (fitLater !== null) add(task, overflowDay, fitLater)
    else unscheduled(task, task.deadline ? 'No room before its deadline.' : 'No room on either planning day.')
  }
  for (const note of notes) {
    const remaining = note.matched.reduce((value, match) => value.replace(match, ' '), note.text)
      .replace(/\b(?:i|am|please|can|will|need|to|and|then|only)\b|['’]m\b/gi, ' ')
    if (!note.matched.length || /[\p{L}\d]/u.test(remaining)) plan.unusedNotes.push(note.original)
  }
  plan.scheduled.sort((a, b) => a.start_date.localeCompare(b.start_date))
  plan.overflow.sort((a, b) => a.start_date.localeCompare(b.start_date))
  return plan
}
