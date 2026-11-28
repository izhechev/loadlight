import { NextResponse, type NextRequest } from 'next/server'
import { readAiRequest } from '@/lib/ai/request'
import { extractOutputSchema, extractRequestSchema, type ExtractedTask } from '@/lib/ai/schemas'
import { fetchGemini, GEMINI_MODELS, geminiText, getGeminiAccess, readGeminiJson, recordAiCall, type GeminiResponse } from '@/lib/ai/server'
import { parseEveryNDays } from '@/lib/utils/recurrence'
import { correctWeekdayDeadline } from '@/lib/utils/dateWords'

const SYSTEM_PROMPT = `You are a task extraction assistant for LoadLight, a task and wellbeing manager.

Extract tasks from the user's free-form input. For each task produce these fields:
- name: concise noun phrase, 1-4 words. Normalize colloquial phrasing and drop filler verbs:
    "hit the gym daily" → name "Gym", recurring "daily"
    "do the laundry" → "Laundry"
    "buy groceries" → "Groceries"
    "call mom" → "Call mom"
    "finish the report" → "Finish report"
    "take lamictal 10:30 and 22:30 daily" → TWO tasks: "Take Lamictal" (deadline today at 10:30) and "Take Lamictal" (deadline today at 22:30), both recurring "daily"
- category: match to (Work, Study, Personal, Exercise, Creative, Admin) or infer
- lifeDomain: work | study | personal | health | finance | social | creativity | home
- demandType: cognitive | emotional | creative | routine | physical
- difficulty: 1 (trivial) to 5 (very hard)
- priority: 1 (critical) to 4 (low)
- deadline: MUST be "YYYY-MM-DDTHH:mm" (including the time) when ANY time is mentioned. NEVER return just "YYYY-MM-DD" if a time was given.
    Examples: "at 10:30" → "2026-04-13T10:30", "22:30" → "2026-04-13T22:30", "3pm" → "2026-04-13T15:00"
    If no time mentioned: null
- startDate: "YYYY-MM-DDTHH:mm" if mentioned, else null
- estimatedMinutes: integer if mentioned, else null
- notes: any extra context
- recurring: "none" | "daily" | "weekly" | "monthly" | "yearly". Set to "daily" when user says "daily", "every day", "everyday", or gives a fixed daily time. Set to "monthly" for "every month", "monthly", "every 1st". Set to "yearly" for "every year", "yearly", "annually", and for BIRTHDAYS, name days, and anniversaries (e.g. "Mani birthday 26 July" → recurring "yearly", deadline the NEXT occurrence of 26 July).
- recurringHours: integer if user says "every X hours", else null
- recurringDays: interval multiplier, else null. Mappings (ALWAYS set a deadline — today, or the next occurrence — when any of these apply):
    "every X days" / "every other day" / "every second day" → recurring "daily", recurringDays X (2 for other/second)
    "every X weeks" / "biweekly" / "every other week" → recurring "daily", recurringDays X*7 (biweekly = 14)
    "every X months" → recurring "monthly", recurringDays X (X > 1 only; plain monthly → recurringDays null)
    "every X years" → recurring "yearly", recurringDays X (X > 1 only; plain yearly → recurringDays null)

CRITICAL RULE for recurring tasks with a fixed time:
When a task recurs daily AND has a specific time (e.g. "everyday at 10:30", "daily 22:30"), you MUST:
  1. Keep the task name clean — do NOT include the time in the name: "Take Lamictal" NOT "Take Lamictal 10:30"
  2. Set deadline to today's date with that time: "2026-04-13T10:30"
  3. Set recurring to "daily"

Return ONLY valid JSON — no markdown, no explanation. Format: {"tasks": [...]}`

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_LOW_AND_ABOVE' },
  // MEDIUM threshold for dangerous content — LOW incorrectly flags medication names
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
]

function extractionResponse(
  tasks: ExtractedTask[],
  offline = false,
  clarification?: ReturnType<typeof extractOutputSchema.parse>['clarification'],
) {
  return NextResponse.json({
    tasks: tasks.map(({ demandType, startDate, estimatedMinutes, recurringHours, recurringDays, ...task }) => ({
      ...task,
      deadline: task.deadline ?? null,
      demand_type: demandType,
      start_date: startDate ?? null,
      estimated_minutes: estimatedMinutes ?? null,
      recurring_hours: recurringHours ?? null,
      recurring_days: recurringDays ?? null,
    })),
    offline,
    clarification,
  })
}

function offlineFallback(input: string) {
  const today = new Date().toISOString().split('T')[0]
  const isDaily = /\b(daily|every\s*day|everyday)\b/i.test(input)
  const times = [...input.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)].map(m => ({
    h: m[1].padStart(2, '0'), min: m[2],
  }))

  // If recurring daily with explicit times: one task per time
  if (isDaily && times.length > 0 && !input.trim().includes('\n')) {
    // Strip time references and recurring words to get a clean task name
    const baseName = input
      .replace(/\b(daily|every\s*day|everyday)\b/gi, '')
      .replace(/\b(at|and)\b/gi, '')
      .replace(/\b\d{1,2}:\d{2}\b/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/^[,\s]+|[,\s]+$/g, '')
    const tasks = times.slice(0, 60).map<ExtractedTask>(t => ({
      name: baseName || input.trim(),
      category: 'Personal',
      demandType: 'routine',
      difficulty: 2,
      priority: 3,
      deadline: `${today}T${t.h}:${t.min}`,
      startDate: null,
      estimatedMinutes: null,
      notes: '',
      recurring: 'daily',
      recurringHours: null,
    }))
    return extractionResponse(tasks, true)
  }

  const tasks = input
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 60)
    .map<ExtractedTask>(line => {
      const days = parseEveryNDays(line)
      const nDays = days && days <= 366 ? days : null
      return {
        name: line,
        category: 'Personal',
        demandType: 'routine',
        difficulty: 2,
        priority: 3,
        deadline: nDays ? today : null,
        startDate: null,
        estimatedMinutes: null,
        notes: '',
        recurring: nDays ? 'daily' : 'none',
        recurringHours: null,
        recurringDays: nDays,
      }
    })
  // offline flag lets the client show a visible warning
  return extractionResponse(tasks, true)
}

export async function POST(request: NextRequest) {
  const body = await readAiRequest(request, extractRequestSchema)
  if (body instanceof Response) return body
  const { text, categories } = body
  if (!text.trim()) return NextResponse.json({ tasks: [] })

  const access = await getGeminiAccess()
  if (!access) return offlineFallback(text)

  // LLMs miscompute weekdays from a bare date — spell out the next week
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const nowUtc = Date.now()
  const calendar = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(nowUtc + i * 86400000)
    return `${DAY_NAMES[d.getUTCDay()]} = ${d.toISOString().split('T')[0]}`
  }).join(', ')

  const userPrompt = `Today's date: ${new Date().toISOString().split('T')[0]} (${DAY_NAMES[new Date().getUTCDay()]})
Upcoming days for date resolution — use these EXACT dates when the user names a weekday: ${calendar}
Available categories: ${(categories ?? ['Work', 'Study', 'Personal', 'Exercise', 'Creative', 'Admin']).join(', ')}

User input:
${text}`

  const start = Date.now()

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: { maxOutputTokens: 8192, responseMimeType: 'application/json' },
    safetySettings: SAFETY_SETTINGS,
  })

  async function callWithFallback(apiKey: string): Promise<{ data: GeminiResponse; model: string } | null> {
    for (const model of GEMINI_MODELS) {
      try {
        const res = await fetchGemini(model, apiKey, requestBody)
        if (res.ok) return { data: await res.json(), model }
      } catch {
        console.warn('LoadLight received no Gemini extraction response.')
      }
    }
    return null
  }

  try {
    const result = await callWithFallback(access.apiKey)

    if (!result) {
      console.error('All Gemini models failed — using offline fallback')
      return offlineFallback(text)
    }

    const { data, model } = result

    const candidate = data.candidates?.[0]

    // Safety filter triggered
    if (candidate?.finishReason === 'SAFETY') {
      const ratings = candidate.safetyRatings ?? []
      const hit = (cat: string) => ratings.some(r => r.category === cat && r.probability !== 'NEGLIGIBLE')
      const category =
        hit('HARM_CATEGORY_DANGEROUS_CONTENT') ? 'self_harm' :
        hit('HARM_CATEGORY_SEXUALLY_EXPLICIT') ? 'sexual' :
        hit('HARM_CATEGORY_HATE_SPEECH')        ? 'hate' : 'other'
      return NextResponse.json({ blocked: true, category })
    }

    const raw = geminiText(data)
    if (!raw) return offlineFallback(text)

    const parsed = extractOutputSchema.safeParse(readGeminiJson(raw))
    if (!parsed.success) return offlineFallback(text)

    const today = new Date().toISOString().split('T')[0]

    // Collect ALL HH:mm times mentioned in the original user input (fallback pool)
    const inputTimes = [...text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)].map(m => ({
      h: m[1].padStart(2, '0'),
      min: m[2],
    }))

    // Apply corrections only when matching the user input to one task is unambiguous.
    const everyN = parseEveryNDays(text)

    const tasks = parsed.data.tasks
    if (tasks.length === 1) {
      const [task] = tasks
      if (everyN && everyN <= 366 && !task.recurringDays) {
        task.recurringDays = everyN
        task.recurring = 'daily'
        if (!task.deadline) task.deadline = today
      }
      if (inputTimes.length === 1 && task.recurring !== 'none') {
        const [{ h, min }] = inputTimes
        const dateStr = task.deadline?.split('T')[0] ?? today
        task.deadline = `${dateStr}T${h}:${min}`
      }
      task.deadline = correctWeekdayDeadline(task.deadline ?? null, text, Date.now())
    }

    await recordAiCall(access, 'extraction', model, start, data.usageMetadata)
    return extractionResponse(tasks, false, parsed.data.clarification)
  } catch {
    console.warn('LoadLight received no usable Gemini extraction response.')
    return offlineFallback(text)
  }
}
