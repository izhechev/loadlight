import { nextDateForWeekday, requestedWeekday } from '@/lib/utils/dateWords'
import { parseEveryNDays } from '@/lib/utils/recurrence'
import { inferTitleEffort } from '@/lib/utils/taskEffort'

export const LIFE_DOMAINS = ['work', 'study', 'personal', 'health', 'finance', 'social', 'creativity', 'home'] as const
export type LifeDomain = typeof LIFE_DOMAINS[number]
export type TaskDraft = {
  name: string
  category: string
  lifeDomain: LifeDomain
  demandType: 'cognitive' | 'emotional' | 'creative' | 'routine' | 'physical'
  difficulty: number
  priority: number
  deadline: string | null
  startDate: string | null
  estimatedMinutes: number | null
  notes: string
  recurring: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
  recurringHours: number | null
  recurringDays: number | null
  timesPerDay: number
}

const CLOCK = String.raw`(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*[ap]\.?m\.?|(?:[01]?\d|2[0-3]):[0-5]\d`
const WEEKDAY = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday|неделя|понеделник|вторник|сряда|четвъртък|петък|събота'
const DAY = String.raw`\d{4}-\d{2}-\d{2}|today|tomorrow|yesterday|(?:next\s+)?(?:${WEEKDAY})`
const COUNT = 'one|two|three|four|five|six|seven|eight|nine|ten'
const numberWords = COUNT.split('|')
const ACTION = 'add|book|buy|call|check|clean|complete|cook|do|email|finish|get|go|make|meet|order|pay|pick|practice|prepare|read|renew|review|run|schedule|send|shop|start|study|submit|take|text|visit|walk|wash|water|work|write'
const MAX_TASKS = 60
const RULES: [RegExp, LifeDomain, TaskDraft['demandType'], string][] = [
  [/\b(run|jog|gym|workout|yoga|train|exercise|swim|walk)\b/i, 'health', 'physical', 'Exercise'],
  [/\b(medicine|medication|doctor|dentist|therapy|appointment)\b/i, 'health', 'routine', 'Personal'],
  [/\b(bill|rent|budget|bank|tax|invoice|insurance)\b/i, 'finance', 'routine', 'Admin'],
  [/\b(lab|class|lecture|notes|study|exam|school|homework|assignment|course)\b/i, 'study', 'cognitive', 'Study'],
  [/\b(client|meeting|work|team|report|presentation)\b/i, 'work', 'cognitive', 'Work'],
  [/\b(draw|design|paint|write|practice|guitar)\b/i, 'creativity', 'creative', 'Creative'],
  [/\b(call|phone|visit|meet|text)\b/i, 'social', 'routine', 'Personal'],
  [/\b(clean|cook|laundry|wash|dishes|groceries|plants)\b/i, 'home', 'routine', 'Personal'],
]

function asDateString(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}

function dayOfMonth(today: string, day: number) {
  const date = new Date(`${today}T00:00Z`)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + Number(date.getUTCDate() > day)
  const endOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return asDateString(Date.UTC(year, month, Math.min(day, endOfMonth)))
}

function asClock(value: string) {
  const [, hours, minutes, period] = value.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])?/i) ?? []
  const hour = period ? Number(hours) % 12 + (period.toLowerCase() === 'p' ? 12 : 0) : Number(hours)
  return `${String(hour).padStart(2, '0')}:${minutes ?? '00'}`
}

function taskDay(words: string, today: string) {
  const exact = words.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0]
  if (exact) {
    const ms = Date.parse(exact)
    if (Number.isFinite(ms) && asDateString(ms) === exact) return exact
  }
  const base = Date.parse(today)
  if (/\btomorrow\b/i.test(words)) return asDateString(base + 86_400_000)
  if (/\byesterday\b/i.test(words)) return asDateString(base - 86_400_000)
  if (/\btoday\b/i.test(words)) return today
  const weekday = requestedWeekday(words)
  if (weekday === null) return null
  const next = nextDateForWeekday(weekday, base)
  return next === today && /\bnext\b/i.test(words) ? asDateString(base + 7 * 86_400_000) : next
}

function namedNumber(value?: string) {
  if (!value) return 1
  return Number(value) || numberWords.indexOf(value.toLowerCase()) + 1
}

function extractLine(line: string, today: string, categories?: string[]): TaskDraft[] {
  line = line.replace(/(\b\d{4}-\d{2}-\d{2})T(?=\d{1,2}:\d{2}\b)/g, '$1 at ')
  const start = line.match(new RegExp(String.raw`\bstart(?:ing|s)?\s+(?:on\s+|at\s+)?(?:(?:${DAY})(?:\s+(?:at\s+)?(?:${CLOCK}))?|(?:${CLOCK}))`, 'i'))?.[0]
  const startDay = start ? taskDay(start, today) : null
  const startTime = start?.match(new RegExp(String.raw`\b(?:${CLOCK})\b`, 'i'))?.[0]
  let name = start ? line.replace(start, ' ') : line
  const parsedDay = taskDay(name, today)

  const monthlyDayPattern = /\b(?:(?:on\s+(?:the\s+)?)?(first|[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+(?:of\s+)?(?:every|each)\s+month|(?:every|each)\s+(first|[1-9]|[12]\d|3[01])(?:st|nd|rd|th)\b|(?:every|each)\s+month\s+on\s+(?:the\s+)?(first|[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\b)/i
  const monthlyDay = name.match(monthlyDayPattern)
  const everyDayCount = parseEveryNDays(name)
  const interval = name.match(new RegExp(String.raw`\b(?:every|each)\s+(?:(\d+|${COUNT}|other)\s+)?(hours?|days?|weeks?|months?|years?)\b`, 'i'))
  const intervalType = interval?.[2].toLowerCase()
  const intervalCount = interval?.[1]?.toLowerCase() === 'other' ? 2 : namedNumber(interval?.[1])
  let recurring: TaskDraft['recurring'] = 'none'
  let recurringDays: number | null = null
  let recurringHours: number | null = null
  const dailyCountPattern = new RegExp(String.raw`\b(twice|(?:\d+|${COUNT})\s+times?)\s*(?:(?:a|per)\s+day|daily)\b`, 'i')
  const dailyCount = name.match(dailyCountPattern)
  const timesPerDay = dailyCount ? Math.min(24, dailyCount[1].toLowerCase() === 'twice' ? 2 : namedNumber(dailyCount[1].split(' ')[0])) : 1

  const repeatWords = new RegExp(String.raw`\b(?:daily|everyday|weekly|biweekly|monthly|yearly|annually|every\s+second\s+day)\b|\b(?:every|each)\s+(?=(?:${WEEKDAY})\b)`, 'gi')
  if (monthlyDay || intervalType?.startsWith('month') || /\bmonthly\b/i.test(name)) {
    recurring = 'monthly'
    if (intervalType?.startsWith('month') && intervalCount > 1) recurringDays = Math.min(intervalCount, 366)
  } else if (intervalType?.startsWith('year') || /\b(?:yearly|annually)\b/i.test(name)) {
    recurring = 'yearly'
    if (intervalType?.startsWith('year') && intervalCount > 1) recurringDays = Math.min(intervalCount, 366)
  } else if (intervalType?.startsWith('week') || /\b(?:weekly|biweekly)\b/i.test(name) || new RegExp(String.raw`\b(?:every|each)\s+(?:${WEEKDAY})\b`, 'i').test(name)) {
    recurring = 'weekly'
    if (/\bbiweekly\b/i.test(name)) recurringDays = 14
    else if (intervalType?.startsWith('week') && intervalCount > 1) recurringDays = Math.min(intervalCount, 52) * 7
  } else if (everyDayCount || dailyCount || intervalType || /\b(?:daily|everyday)\b/i.test(name)) {
    recurring = 'daily'
    if (intervalType?.startsWith('hour')) recurringHours = Math.max(1, Math.min(intervalCount, 168))
    const days = everyDayCount ?? (intervalType?.startsWith('day') ? intervalCount : 1)
    if (days > 1) recurringDays = Math.min(days, 366)
  }

  if (monthlyDay) name = name.replace(monthlyDay[0], ' ')
  if (dailyCount) name = name.replace(dailyCount[0], ' ')
  if (interval) name = name.replace(interval[0], ' ')
  name = name.replace(repeatWords, ' ')
  const monthlyNumber = monthlyDay?.slice(1).find(Boolean)
  const dates = monthlyNumber ? dayOfMonth(today, monthlyNumber.toLowerCase() === 'first' ? 1 : Number(monthlyNumber)) : parsedDay
  const clocks = [...name.matchAll(new RegExp(String.raw`\b(?:${CLOCK})\b`, 'gi'))].map(match => asClock(match[0]))

  const durationPattern = /\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi
  const duration = [...name.matchAll(durationPattern)].reduce((sum, match) => (
    sum + Number(match[1]) * (match[2].toLowerCase().startsWith('h') ? 60 : 1)
  ), 0)

  name = name
    .replace(durationPattern, ' ')
    .replace(new RegExp(String.raw`(?:\b(?:by|on|at|before|due|for)\s+)?(?:${DAY}|${CLOCK})\b`, 'gi'), ' ')
    .replace(/(?:\s|^)(?:and|at|by|on|for)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,\s]+|[,\s.]+$/g, '')
  name ||= line
  if (name.length > 512) name = name.slice(0, 512)
  name = name[0].toUpperCase() + name.slice(1)

  const rule = RULES.find(([pattern]) => pattern.test(name))
  const inferred = inferTitleEffort(name)
  const effort = inferred?.type === 'routine' && rule && rule[2] !== 'routine' ? undefined : inferred
  const preferred = rule?.[3] ?? 'Personal'
  const category = categories?.find(value => value.toLowerCase() === preferred.toLowerCase())
    ?? categories?.find(value => value.toLowerCase() === 'personal')
    ?? categories?.[0] ?? preferred
  const baseDate = dates ?? today
  const startDate = startTime ? `${startDay ?? today}T${asClock(startTime)}` : startDay
  const slots = recurring === 'daily' ? [...new Set(clocks)] : clocks.slice(0, 1)
  const appointment = recurring === 'none' && !start && clocks.length === 1
    && /\b(appointment|meeting|doctor|dentist|interview|class|lesson|pick[- ]?up|drop[- ]?off)\b/i.test(name)
    && !/\b(by|before|due)\s/i.test(line)
  return (slots.length ? slots : [null]).map(time => ({
    name,
    category,
    lifeDomain: rule?.[1] ?? 'personal',
    demandType: effort?.type ?? rule?.[2] ?? 'routine',
    difficulty: effort?.difficulty ?? 2,
    priority: 3,
    deadline: appointment ? null : time ? `${baseDate}T${time}` : dates ?? (recurring !== 'none' ? today : null),
    startDate: appointment ? `${baseDate}T${time}` : startDate,
    estimatedMinutes: duration > 0 ? Math.min(Math.round(duration), 10_080) : null,
    notes: '',
    recurring,
    recurringHours,
    recurringDays,
    timesPerDay: slots.length > 1 ? 1 : timesPerDay,
  }))
}

export function extractTaskDrafts(text: string, today: string, categories?: string[]): TaskDraft[] {
  const separator = new RegExp(String.raw`[\r\n;]+|,(?!\s*(?:${CLOCK}|\d{4}\b))|\s+(?:and(?:\s+(?:then|also))?|then)\s+(?=(?:${ACTION})\b)`, 'gi')
  return text.split(separator)
    .map(line => line.trim().replace(/^(?:[-*•]\s+|\d+[.)]\s+|and(?:\s+(?:then|also))?\s+|then\s+)/i, ''))
    .filter(Boolean)
    .flatMap(line => extractLine(line, today, categories))
    .slice(0, MAX_TASKS)
}

export function taskPreview({
  lifeDomain, demandType, startDate, estimatedMinutes, recurringHours, recurringDays, timesPerDay, ...task
}: TaskDraft) {
  return {
    ...task,
    life_domain: lifeDomain,
    demand_type: demandType,
    start_date: startDate,
    estimated_minutes: estimatedMinutes,
    recurring_hours: recurringHours,
    recurring_days: recurringDays,
    times_per_day: timesPerDay,
  }
}

export type TaskPreview = ReturnType<typeof taskPreview>
export function needsTaskDetails(name: string) {
  const title = name.trim().replace(/[.!?]+$/, '')
  return /^(?:(?:do|handle|fix|sort out|finish|review|check|work on|take care of|deal with)\s+)?(?:(?:the|that|this|some|my)\s+)?(?:it|stuff|things?|something|task|whatever|tbd|todo|[?]+)$/i.test(title)
    || /^(?:do|handle|fix|finish|review|check|work(?: on)?|prepare|send|submit|call|email|buy|book|sort out)$/i.test(title)
    || /^[A-Z\d_-]{2,12}$/.test(title)
}
