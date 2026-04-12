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
    "take lamictal 10:30 and 22:30 daily" → TWO tasks: "Take Lamictal 10:30" (deadline today at 10:30) and "Take Lamictal 22:30" (deadline today at 22:30), both recurring "daily"
- category: match to (Work, Study, Personal, Exercise, Creative, Admin) or infer
- lifeDomain: work | study | personal | health | finance | social | creativity | home
- demandType: cognitive | emotional | creative | routine | physical
- difficulty: 1 (trivial) to 5 (very hard)
- priority: 1 (critical) to 4 (low)
- deadline: "YYYY-MM-DDTHH:mm" if a time is mentioned, else null
- startDate: "YYYY-MM-DDTHH:mm" if mentioned, else null
- estimatedMinutes: integer if mentioned, else null
- notes: any extra context
- recurring: "none" | "daily" | "weekly". Set to "daily" when user says "daily" or gives a fixed daily time.
- recurringHours: integer if user says "every X hours", else null

Return ONLY valid JSON — no markdown, no explanation. Format: {"tasks": [...]}`

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_LOW_AND_ABOVE' },
  // MEDIUM threshold for dangerous content — LOW incorrectly flags medication names
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
]

function offlineFallback(input: string) {
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

  const model = 'gemini-3-flash-preview'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const start = Date.now()

  let rawApiResponse: unknown = null
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
        safetySettings: SAFETY_SETTINGS,
      }),
    })

    rawApiResponse = await res.json()
    const data = rawApiResponse as {
      error?: { message: string; code: number }
      candidates?: {
        finishReason?: string
        safetyRatings?: { category: string; probability: string }[]
        content?: { parts?: { text?: string }[] }
      }[]
    }

    // Propagate API-level errors for diagnosis
    if (data.error) {
      console.error('Gemini API error:', data.error)
      return NextResponse.json({ tasks: [], _debug: data.error })
    }

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

    const raw = candidate?.content?.parts?.[0]?.text?.trim()
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

    return NextResponse.json(parsed)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Gemini extraction failed:', msg, 'raw:', JSON.stringify(rawApiResponse).slice(0, 300))
    // Return error details in dev so we can diagnose
    return NextResponse.json({ tasks: [], offline: true, _err: msg, _raw: JSON.stringify(rawApiResponse).slice(0, 500) })
  }
}
