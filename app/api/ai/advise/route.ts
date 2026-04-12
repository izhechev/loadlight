import { NextResponse, type NextRequest } from 'next/server'
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { logAiCall } from '@/lib/data/tasks'

export const runtime = 'edge'

const SYSTEM_PROMPT = `You are a calm, supportive wellbeing advisor integrated into LoadLight, a task manager focused on mental load.

Your role is to give brief, compassionate advice (2-3 sentences max) to help users manage their workload without feeling overwhelmed.
Be warm, practical, and specific. Never catastrophize or lecture. Focus on what can be done right now.`

export async function POST(request: NextRequest) {
  const { state, signals, taskCount, urgentCount } = await request.json()

  // Never advise when user is overwhelmed — rest mode takes over the UI
  if (state === 'overwhelmed') {
    return NextResponse.json({ advice: null })
  }

  const userPrompt = `Current state: ${state}
Tasks left: ${taskCount}
Urgent (due within 48h): ${urgentCount}
Signals: task accumulation ${Math.round(signals?.taskAccumulation * 100)}%, temporal pressure ${Math.round(signals?.temporalPressure * 100)}%

Give brief, specific advice for this person right now.`

  const start = Date.now()

  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const { text, usage } = await generateText({
        model: openai('gpt-4o-mini'),
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        maxOutputTokens: 100,
      })

      logAiCall({
        userId: '',
        callType: 'advisory',
        model: 'gpt-4o-mini',
        tokensIn: usage?.inputTokens ?? 0,
        tokensOut: usage?.outputTokens ?? 0,
        latencyMs: Date.now() - start,
      }).catch(() => {})

      return NextResponse.json({ advice: text })
    } catch (err) {
      console.error('OpenAI advise failed, falling back:', err)
    }
  }

  if (process.env.GOOGLE_API_KEY) {
    try {
      const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY })
      const { text, usage } = await generateText({
        model: google('gemini-2.0-flash-exp'),
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        maxOutputTokens: 100,
      })

      logAiCall({
        userId: '',
        callType: 'advisory',
        model: 'gemini-2.0-flash-exp',
        tokensIn: usage?.inputTokens ?? 0,
        tokensOut: usage?.outputTokens ?? 0,
        latencyMs: Date.now() - start,
      }).catch(() => {})

      return NextResponse.json({ advice: text })
    } catch (err) {
      console.error('Google advise failed:', err)
    }
  }

  return NextResponse.json({ advice: null })
}
