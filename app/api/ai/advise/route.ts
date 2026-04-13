import { NextResponse, type NextRequest } from 'next/server'
import { logAiCall } from '@/lib/data/tasks'

const SYSTEM_PROMPT = `You are a workload analysis tool inside a task management app called LoadLight.

Rules you must follow:
1. TONE: Use "consider", "you might", "one option is". Never "you should", "you must", or "you need to". No clinical terms.
2. SCOPE: Comment on workload patterns only: task volume, deadline distribution, demand balance, completion trends. Never comment on emotions, feelings, mood, or psychological state.
3. AUTHORITY: You are a calculator showing patterns, not a counsellor giving advice. Say "Cognitive tasks are concentrated on Monday" not "You are overloading yourself".
4. ESCALATION: Never offer coping strategies, breathing exercises, relaxation techniques, or emotional support. If the user seems distressed, say nothing about it. The app handles escalation separately.
5. TRANSPARENCY: You are an AI analysing task data. Do not pretend to be human or to understand the user's situation beyond what the task data shows.

Provide a 1-2 sentence observation about the user's current workload based on the data. Adjust tone:
- If state is "normal": informational, neutral
- If state is "elevated": gentler, suggest reduction without pressure
- If state is "overwhelmed": minimal, one short sentence only.`

export async function POST(request: NextRequest) {
  const { state, signals, taskCount, urgentCount } = await request.json()

  // Never advise when user is overwhelmed
  if (state === 'overwhelmed') {
    return NextResponse.json({ advice: null, aiDisclosure: true })
  }

  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) return NextResponse.json({ advice: null, aiDisclosure: true })

  const userPrompt = `Current state: ${state}
Tasks left: ${taskCount}
Urgent (due within 48h): ${urgentCount}
Task accumulation signal: ${Math.round((signals?.taskAccumulation ?? 0) * 100)}%
Temporal pressure signal: ${Math.round((signals?.temporalPressure ?? 0) * 100)}%

Provide a 1-2 sentence workload observation.`

  const start = Date.now()
  const model = 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
    })

    const data = await res.json() as { candidates?: { content?: { parts?: { thought?: boolean; text?: string }[] } }[] }
    const parts = data.candidates?.[0]?.content?.parts ?? []
    const text = (parts.find(p => !p.thought) ?? parts[0])?.text?.trim()

    logAiCall({
      userId: '',
      callType: 'advisory',
      model,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: Date.now() - start,
    }).catch(() => {})

    if (text) return NextResponse.json({ advice: text, aiDisclosure: true })
  } catch (err) {
    console.error('Advise route error:', err)
  }

  return NextResponse.json({ advice: null, aiDisclosure: true })
}
