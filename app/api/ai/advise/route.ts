import { NextResponse, type NextRequest } from 'next/server'
import { readAiRequest } from '@/lib/ai/request'
import { adviseRequestSchema } from '@/lib/ai/schemas'
import { fetchGemini, GEMINI_MODELS, geminiText, getGeminiAccess, recordAiCall, type GeminiResponse } from '@/lib/ai/server'

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
  const body = await readAiRequest(request, adviseRequestSchema)
  if (body instanceof Response) return body
  const { state, signals, taskCount, urgentCount } = body

  // Never advise when user is overwhelmed
  if (state === 'overwhelmed') {
    return NextResponse.json({ advice: null, aiDisclosure: true })
  }

  const access = await getGeminiAccess()
  if (!access) return NextResponse.json({ advice: null, aiDisclosure: true })

  const userPrompt = `Current state: ${state}
Tasks left: ${taskCount}
Urgent (due within 48h): ${urgentCount}
Task accumulation signal: ${Math.round((signals?.taskAccumulation ?? 0) * 100)}%
Temporal pressure signal: ${Math.round((signals?.temporalPressure ?? 0) * 100)}%

Provide a 1-2 sentence workload observation.`

  const start = Date.now()
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: { maxOutputTokens: 2048 },
  })

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetchGemini(model, access.apiKey, requestBody)
      if (!res.ok) continue

      const data: GeminiResponse = await res.json()
      const text = geminiText(data)
      if (!text || text.length > 2_000) continue

      await recordAiCall(access, 'advisory', model, start, data.usageMetadata)
      return NextResponse.json({ advice: text, aiDisclosure: true })
    } catch {
      console.warn('LoadLight received no usable Gemini advisory response.')
    }
  }

  return NextResponse.json({ advice: null, aiDisclosure: true })
}
