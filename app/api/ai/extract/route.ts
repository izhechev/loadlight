import { NextResponse, type NextRequest } from 'next/server'
import { logAiCall } from '@/lib/data/tasks'

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
- recurring: "none" | "daily" | "weekly". Set to "daily" when user says "daily", "every day", "everyday", or gives a fixed daily time.
- recurringHours: integer if user says "every X hours", else null

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

function offlineFallback(input: string) {
  const today = new Date().toISOString().split('T')[0]
  const isDaily = /\b(daily|every\s*day|everyday)\b/i.test(input)
  const times = [...input.matchAll(/\b(\d{1,2}):(\d{2})\b/g)].map(m => ({
    h: m[1].padStart(2, '0'), min: m[2],
  }))

  // If recurring daily with explicit times: one task per time
  if (isDaily && times.length > 0) {
    // Strip time references and recurring words to get a clean task name
    const baseName = input
      .replace(/\b(daily|every\s*day|everyday)\b/gi, '')
      .replace(/\b(at|and)\b/gi, '')
      .replace(/\b\d{1,2}:\d{2}\b/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/^[,\s]+|[,\s]+$/g, '')
    const tasks = times.map(t => ({
      name: baseName || input.trim(),
      category: 'Personal',
      lifeDomain: 'personal',
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
    return NextResponse.json({ tasks, offline: true })
  }

  const tasks = input
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => ({
      name: line,
      category: 'Personal',
      lifeDomain: 'personal',
      demandType: 'routine',
      difficulty: 2,
      priority: 3,
      deadline: null,
      startDate: null,
      estimatedMinutes: null,
      notes: '',
      recurring: 'none',
      recurringHours: null,
    }))
  // offline flag lets the client show a visible warning
  return NextResponse.json({ tasks, offline: true })
}

export async function POST(request: NextRequest) {
  const { text, categories } = await request.json() as { text: string; categories?: string[] }
  if (!text?.trim()) return NextResponse.json({ tasks: [] })

  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) return offlineFallback(text)

  const userPrompt = `Today's date: ${new Date().toISOString().split('T')[0]}
Available categories: ${(categories ?? ['Work', 'Study', 'Personal', 'Exercise', 'Creative', 'Admin']).join(', ')}

User input:
${text}`

  const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
  const start = Date.now()

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
    safetySettings: SAFETY_SETTINGS,
  })

  type GeminiResponse = {
    error?: { message: string; code: number; status?: string }
    candidates?: {
      finishReason?: string
      safetyRatings?: { category: string; probability: string }[]
      content?: { parts?: { thought?: boolean; text?: string }[] }
    }[]
  }

  // Try each model in order; retry once on 503 before moving to the next model
  async function callWithFallback(): Promise<{ data: GeminiResponse; model: string } | null> {
    for (const model of MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      for (let attempt = 0; attempt <= 1; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 1500))
        try {
          const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestBody })
          const data = await res.json() as GeminiResponse
          const isTransient = data.error?.status === 'UNAVAILABLE' || data.error?.code === 503
          if (!data.error) return { data, model }
          if (!isTransient) break // hard error — skip remaining retries for this model
          console.warn(`${model} 503 attempt ${attempt + 1}`)
        } catch (e) {
          console.warn(`${model} fetch error:`, e)
        }
      }
      console.warn(`${model} failed, trying next model`)
    }
    return null
  }

  try {
    const result = await callWithFallback()

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

    // Thinking models emit a thought part first — find the actual response part
    const parts: { thought?: boolean; text?: string }[] = candidate?.content?.parts ?? []
    const responsePart = parts.find(p => !p.thought) ?? parts[0]
    const raw = responsePart?.text?.trim()
    if (!raw) {
      console.error('Gemini extraction: empty response', JSON.stringify(data).slice(0, 500))
      return offlineFallback(text)
    }

    // Strip markdown code fences if present
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    const parsed = JSON.parse(clean) as { tasks: unknown[] }

    logAiCall({
      userId: '',
      callType: 'extraction',
      model,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: Date.now() - start,
    }).catch(() => {})

    const today = new Date().toISOString().split('T')[0]

    // Collect ALL HH:mm times mentioned in the original user input (fallback pool)
    const inputTimes = [...text.matchAll(/\b(\d{1,2}):(\d{2})\b/g)].map(m => ({
      h: m[1].padStart(2, '0'),
      min: m[2],
    }))

    // For recurring tasks, always use times from the user's raw input — the AI's
    // deadline minutes are unreliable (e.g. returns "22:00" instead of "22:30").
    // inputTimes is consumed in order: first recurring task gets first input time, etc.
    const inputTimesForRecurring = [...inputTimes] // separate copy so non-recurring tasks aren't affected

    const patched = (parsed.tasks as Record<string, unknown>[]).map(task => {
      const name = (task.name as string) ?? ''
      const recurring = task.recurring as string | undefined
      const dl = task.deadline as string | null
      const dateStr = dl ? dl.split('T')[0] : today

      // For recurring tasks: always override time with the next input time (ground truth)
      if (recurring && recurring !== 'none' && inputTimesForRecurring.length > 0) {
        const time = inputTimesForRecurring.shift()!
        task.deadline = `${dateStr}T${time.h}:${time.min}`
        return task
      }

      // For non-recurring tasks: fall back to time in name, then AI deadline
      const nameMatch = name.match(/\b(\d{1,2}):(\d{2})\b/)
      if (nameMatch) {
        task.deadline = `${dateStr}T${nameMatch[1].padStart(2, '0')}:${nameMatch[2]}`
      }

      return task
    })
    return NextResponse.json({ tasks: patched })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Gemini extraction failed:', msg)
    return offlineFallback(text)
  }
}
