import { z } from 'zod'
import { LIFE_DOMAINS } from './taskExtraction'

export const demandType = z.enum(['cognitive', 'emotional', 'creative', 'routine', 'physical'])
export const recurrence = z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly'])
const name = z.string().min(1).max(512)
const category = z.string().max(160)
const basicText = z.string().max(2_000)
const count = z.number().int().nonnegative().max(100_000)
const priority = z.number().int().min(1).max(4)
const difficulty = z.number().int().min(1).max(5)
const minutes = z.number().int().nonnegative().max(10_080)
const hourInterval = z.number().int().min(1).max(168).nullish()
const dayInterval = z.number().int().min(1).max(366).nullish()
const day = z.iso.date()
const dateTime = z.iso.datetime({ local: true, offset: true })
const dateOrTime = z.union([day, dateTime])
const clockTime = z.iso.time({ precision: -1 })
const id = z.string().max(128)

const chatRequestMode = z.enum([
  'extract', 'analyze', 'weekly', 'breakdown', 'schedule_chat', 'schedule', 'triage', 'chill-snooze', 'balance-check',
])

export const chatRequestSchema = z.object({
  mode: chatRequestMode,
  text: z.string().max(8_000).optional(),
  categories: z.array(category).max(100).optional(),
  tasks: z.array(z.object({
    id: id.optional(),
    name,
    category: category.optional(),
    demand_type: demandType.optional(),
    estimated_minutes: minutes.nullish(),
    priority: priority.optional(),
    difficulty: difficulty.optional(),
    done: z.boolean().optional(),
    status: z.enum(['active', 'completed', 'archived']).optional(),
    snoozedUntil: z.number().nonnegative().nullish(),
    deadline: dateOrTime.nullish(),
    start_date: dateOrTime.nullish(),
    recurring: recurrence.optional(),
    recurring_days: dayInterval,
  })).max(300).optional(),
  balanceMode: z.enum(['beast', 'average', 'balanced', 'chill']).optional(),
  state: z.enum(['normal', 'elevated', 'overwhelmed']).optional(),
  dayLoadMinutes: z.number().nonnegative().max(3_024_000).optional(),
  dayTaskCount: count.optional(),
  week: z.object({
    startDay: day,
    endDay: day,
    pending: count,
    completed: count,
    minutes: z.number().nonnegative().max(3_024_000),
    dailyMinutes: z.array(z.number().nonnegative().max(3_024_000)).length(7),
    categories: z.array(z.object({ name: category, count })).max(12),
  }).optional(),
  toughDayThreshold: minutes.optional(),
  recentToughDays: count.optional(),
  missingAreas: z.array(category).max(20).optional(),
  overflowDate: day.optional(),
  todayStr: day.optional(),
  currentTime: clockTime.optional(),
  history: z.array(z.object({
    role: z.enum(['assistant', 'user']),
    text: basicText,
  })).max(12).optional(),
})

export type ChatTask = NonNullable<z.infer<typeof chatRequestSchema>['tasks']>[number]

export const extractRequestSchema = z.object({
  text: z.string().max(8_000),
  today: day.optional(),
  categories: z.array(category).max(100).optional(),
})

export const adviseRequestSchema = z.object({
  state: z.enum(['normal', 'elevated', 'overwhelmed']),
  taskCount: count,
  urgentCount: count,
  todayMinutes: z.number().nonnegative().max(3_024_000).optional(),
  capacityMinutes: z.number().positive().max(1_440).optional(),
  signals: z.object({
    taskAccumulation: z.number().min(0).max(1).optional(),
    temporalPressure: z.number().min(0).max(1).optional(),
  }).optional(),
})

export const pastDeadlineRequestSchema = z.object({
  taskName: name,
  deadlineWas: dateOrTime,
  now: dateTime,
  category: category.optional(),
  recurring: recurrence.optional(),
  userReply: basicText.nullish(),
})

export const pastDeadlineOutputSchema = z.object({
  observation: basicText.nullable(),
  clarification: basicText.nullable(),
  suggestedTime: dateTime.nullable(),
  suggestedLabel: z.string().max(120).nullable(),
  stillNeeded: z.boolean().nullable(),
})

const extractionFields = {
  name,
  category,
  difficulty: difficulty.default(2),
  priority: priority.default(3),
  deadline: dateOrTime.nullish(),
  notes: basicText.default(''),
  recurring: recurrence.default('none'),
}

const clarification = z.object({
  question: basicText,
  taskName: name,
  options: z.array(z.object({
    label: basicText,
    recurring: recurrence,
    recurring_hours: hourInterval,
  })).min(1).max(6),
}).nullish()

const extractedTask = z.object({
  ...extractionFields,
  lifeDomain: z.enum(LIFE_DOMAINS).optional(),
  timesPerDay: z.number().int().min(1).max(24).optional(),
  demandType: demandType.default('routine'),
  startDate: dateOrTime.nullish(),
  estimatedMinutes: minutes.nullish(),
  recurringHours: hourInterval,
  recurringDays: dayInterval,
})

export type ExtractedTask = z.infer<typeof extractedTask>

export const extractOutputSchema = z.object({
  tasks: z.array(extractedTask).min(1).max(60),
  clarification,
})

const analysisOutput = z.object({
  verdict: z.enum(['overloaded', 'balanced', 'light']),
  trend: basicText,
  advice: basicText,
  suggestion: basicText,
})
const taskReason = z.object({ name, reason: basicText })
const chatTaskOutput = z.object({
  ...extractionFields,
  demand_type: demandType.default('routine'),
  start_date: dateOrTime.nullish(),
  estimated_minutes: minutes.nullish(),
  times_per_day: z.number().int().min(1).max(24).default(1),
  recurring_hours: hourInterval,
  recurring_days: dayInterval,
})
export const chatOutputSchemas = {
  extract: z.object({ tasks: z.array(chatTaskOutput).min(1).max(60), clarification }),
  breakdown: z.object({ tasks: z.array(z.object({ name })).min(3).max(5) }),
  analyze: analysisOutput,
  weekly: analysisOutput,
  schedule_chat: z.discriminatedUnion('type', [
    z.object({ type: z.literal('question'), question: basicText.min(1) }),
    z.object({ type: z.literal('ready'), context: basicText.nullish() }),
  ]),
  triage: z.object({
    canSkip: z.array(taskReason).max(3),
    urgent: z.array(taskReason).max(3),
    question: basicText.nullish(),
  }),
  'chill-snooze': z.object({
    canPostpone: z.array(taskReason.extend({ id })).max(4),
    question: basicText.nullish(),
    questionTaskName: name.nullish(),
    questionTaskId: id.nullish(),
  }),
  'balance-check': z.object({
    verdict: z.enum(['too_much', 'ok', 'too_little']),
    headline: basicText,
    reason: basicText,
    remove: z.array(taskReason.extend({ id })).max(3),
    add: z.array(taskReason.extend({ category, estimatedMinutes: z.number().int().min(5).max(180).optional() })).max(3),
  }),
}
