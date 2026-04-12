import { NextResponse, type NextRequest } from 'next/server'
import { generateObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { z } from 'zod'
import { logAiCall } from '@/lib/data/tasks'

export const runtime = 'edge'

const ExtractedTaskSchema = z.object({
  tasks: z.array(z.object({
    name:             z.string(),
    category:         z.string().default('Personal'),
    lifeDomain:       z.string().default('personal'),
    demandType:       z.enum(['cognitive', 'emotional', 'creative', 'routine', 'physical']).default('routine'),
    difficulty:       z.number().int().min(1).max(5).default(2),
    priority:         z.number().int().min(1).max(4).default(3),
    deadline:         z.string().nullable().optional(),
    startDate:        z.string().nullable().optional(),
    estimatedMinutes: z.number().int().nullable().optional(),
    notes:            z.string().default(''),
    recurring:        z.enum(['none', 'daily', 'weekly']).default('none'),
    recurringHours:   z.number().int().nullable().optional(),
  })),
})

const SYSTEM_PROMPT = `You are a task extraction assistant for LoadLight, a task and wellbeing manager.

Extract tasks from the user's free-form input. For each task:
- name: short, action-oriented title
- category: match to existing categories (Work, Study, Personal, Exercise, Creative, Admin) or infer
- lifeDomain: one of work/study/personal/health/finance/social/creativity/home
- demandType: cognitive | emotional | creative | routine | physical
- difficulty: 1 (trivial) to 5 (very hard)
- priority: 1 (critical) to 4 (low)
- deadline: ISO date string if mentioned, else null
- startDate: ISO date string if mentioned, else null
- estimatedMinutes: integer if mentioned, else null
- notes: any extra context from the input
- recurring: "none" | "daily" | "weekly"
- recurringHours: integer if user says "every X hours", else null. When set, also set recurring to "daily".

Return a JSON object with a "tasks" array.`

export async function POST(request: NextRequest) {
  const { text, categories } = await request.json()
  if (!text?.trim()) {
    return NextResponse.json({ tasks: [] })
  }

  const userPrompt = `Today's date: ${new Date().toISOString().split('T')[0]}
Available categories: ${(categories ?? ['Work', 'Study', 'Personal', 'Exercise', 'Creative', 'Admin']).join(', ')}

User input:
${text}`

  const start = Date.now()

  // Try OpenAI first, fall back to Google
  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const { object, usage } = await generateObject({
        model: openai('gpt-4o-mini'),
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        schema: ExtractedTaskSchema,
      })

      logAiCall({
        userId: '',
        callType: 'extraction',
        model: 'gpt-4o-mini',
        tokensIn: usage?.inputTokens ?? 0,
        tokensOut: usage?.outputTokens ?? 0,
        latencyMs: Date.now() - start,
      }).catch(() => {})

      return NextResponse.json(object)
    } catch (err) {
      console.error('OpenAI extraction failed, falling back to Google:', err)
    }
  }

  if (process.env.GOOGLE_API_KEY) {
    try {
      const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY })
      const { object, usage } = await generateObject({
        model: google('gemini-2.0-flash-exp'),
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        schema: ExtractedTaskSchema,
      })

      logAiCall({
        userId: '',
        callType: 'extraction',
        model: 'gemini-2.0-flash-exp',
        tokensIn: usage?.inputTokens ?? 0,
        tokensOut: usage?.outputTokens ?? 0,
        latencyMs: Date.now() - start,
      }).catch(() => {})

      return NextResponse.json(object)
    } catch (err) {
      console.error('Google extraction failed:', err)
    }
  }

  // Offline fallback — parse lines naively
  const tasks = text
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0)
    .map((line: string) => ({
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
