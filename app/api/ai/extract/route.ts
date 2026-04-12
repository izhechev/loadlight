import { NextResponse, type NextRequest } from 'next/server'
import { logAiCall } from '@/lib/data/tasks'

export const runtime = 'edge'

const SYSTEM_PROMPT = `You are a task extraction assistant for LoadLight, a task and wellbeing manager.

Extract tasks from the user's free-form input. For each task:
- name: concise noun phrase, 1-3 words. Strip filler action verbs and normalize colloquial phrasing:
    "hit the gym" → "Gym", "do the laundry" → "Laundry", "buy groceries" → "Groceries",
    "call mom" → "Call mom", "finish the report" → "Finish report", "take out trash" → "Take out trash"
- category: match to existing categories (Work, Study, Personal, Exercise, Creative, Admin) or infer
- lifeDomain: one of work/study/personal/health/finance/social/creativity/home
- demandType: cognitive | emotional | creative | routine | physical
- difficulty: 1 (trivial) to 5 (very hard)
- priority: 1 (critical) to 4 (low)
- deadline: ISO datetime string if mentioned, else null
- startDate: ISO datetime string if mentioned, else null
- estimatedMinutes: integer if mentioned, else null
- notes: any extra context from the input
- recurring: "none" | "daily" | "weekly"
- recurringHours: integer if user says "every X hours", else null. When set, also set recurring to "daily".

Return ONLY valid JSON with a "tasks" array.`

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name:             { type: 'string' },
          category:         { type: 'string' },
          lifeDomain:       { type: 'string' },
          demandType:       { type: 'string' },
          difficulty:       { type: 'integer' },
          priority:         { type: 'integer' },
          deadline:         { type: 'string', nullable: true },
          startDate:        { type: 'string', nullable: true },
          estimatedMinutes: { type: 'integer', nullable: true },
          notes:            { type: 'string' },
          recurring:        { type: 'string' },
          recurringHours:   { type: 'integer', nullable: true },
        },
        required: ['name', 'category', 'lifeDomain', 'demandType', 'difficulty', 'priority', 'notes', 'recurring'],
      },
    },
  },
  required: ['tasks'],
}

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
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
  return NextResponse.json({ tasks })
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

  const model = 'gemini-2.0-flash-exp'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const start = Date.now()

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
        safetySettings: SAFETY_SETTINGS,
      }),
    })

    const data = await res.json() as {
      candidates?: {
        finishReason?: string
        safetyRatings?: { category: string; probability: string }[]
        content?: { parts?: { text?: string }[] }
      }[]
    }

    const candidate = data.candidates?.[0]

    // Safety filter triggered — never extract, return blocked flag + category
    if (candidate?.finishReason === 'SAFETY') {
      const ratings = candidate.safetyRatings ?? []
      const hit = (cat: string) => ratings.some(r => r.category === cat && r.probability !== 'NEGLIGIBLE')
      const category =
        hit('HARM_CATEGORY_DANGEROUS_CONTENT') ? 'self_harm' :
        hit('HARM_CATEGORY_SEXUALLY_EXPLICIT') ? 'sexual' :
        hit('HARM_CATEGORY_HATE_SPEECH')        ? 'hate' :
        hit('HARM_CATEGORY_HARASSMENT')         ? 'other' : 'other'
      return NextResponse.json({ blocked: true, category })
    }

    const raw = candidate?.content?.parts?.[0]?.text?.trim()
    if (!raw) return offlineFallback(text)

    const parsed = JSON.parse(raw) as { tasks: unknown[] }

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
    console.error('Gemini extraction failed:', err)
    return offlineFallback(text)
  }
}
