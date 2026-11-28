import { NextResponse, type NextRequest } from 'next/server'
import { readAiRequest } from '@/lib/ai/request'
import { pastDeadlineOutputSchema, pastDeadlineRequestSchema } from '@/lib/ai/schemas'
import { aiBlocked, aiModels, fetchGemini, fetchGroq, GROQ_MODEL, geminiText, getGeminiAccess, readGeminiJson, recordAiCall, type GeminiResponse } from '@/lib/ai/server'

const SYSTEM_PROMPT = `You are a scheduling assistant inside LoadLight, a task management app.

A user's task deadline has already passed. Your job is to decide whether the task is still needed and suggest a new deadline.

Rules:
1. Identify what kind of task it is from the name.
2. If the task name is clearly understandable: produce observation + suggestedTime + stillNeeded.
3. If the task name is ambiguous (short, cryptic, initials, unclear): set clarification to ONE brief question, leave suggestedTime/suggestedLabel/stillNeeded as null.
4. When userReply is provided in the input: treat it as context and produce the full suggestion — do NOT ask another clarification question.
5. Suggested time logic:
   - recurring "daily" → tomorrow at the same time as deadlineWas
   - recurring "weekly" → next week on the same day and time as deadlineWas
   - one-off, overdue by less than 24 hours → tomorrow at the same time
   - one-off, overdue by more than 24 hours → next occurrence that makes contextual sense (e.g. morning routine → tomorrow morning, meeting → next business day)
6. stillNeeded: set to false only if the task is clearly time-locked to a specific past moment (e.g. "Watch live match", "Join standup") AND the opportunity is permanently gone. For most tasks set to true.
7. suggestedLabel format: "Tomorrow · H:MMam/pm" or "Next [Weekday] · H:MMam/pm" (12-hour clock, no leading zero for hour, lowercase am/pm).

Return ONLY valid JSON — no markdown, no explanation — matching this exact schema:
{
  "observation": "<1 sentence about what the task is>",
  "clarification": "<one short question> | null",
  "suggestedTime": "<YYYY-MM-DDTHH:mmZ> | null",
  "suggestedLabel": "<human label> | null",
  "stillNeeded": true | false | null
}`

// ─── local fallback ──────────────────────────────────────────────────────────

function localFallback(deadlineWas: string, recurring: string | undefined, now: string): NextResponse {
  const base = new Date(deadlineWas)
  const today = new Date(now)
  const dayMs = 24 * 60 * 60 * 1000
  const daysToAdd = recurring === 'weekly'
    ? 7 - ((today.getUTCDay() - base.getUTCDay() + 7) % 7)
    : 1
  const next = new Date(today.getTime() + daysToAdd * dayMs)
  next.setUTCHours(base.getUTCHours(), base.getUTCMinutes(), 0, 0)

  // Format as "YYYY-MM-DDTHH:mmZ"
  const pad = (n: number) => String(n).padStart(2, '0')
  const suggestedTime = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T${pad(next.getUTCHours())}:${pad(next.getUTCMinutes())}Z`

  // Build human label
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const h24 = next.getUTCHours()
  const min = next.getUTCMinutes()
  const ampm = h24 >= 12 ? 'pm' : 'am'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const minStr = min === 0 ? '' : `:${pad(min)}`
  const timeStr = `${h12}${minStr}${ampm}`
  const suggestedLabel = daysToAdd === 1
    ? `Tomorrow · ${timeStr}`
    : `Next ${weekdays[next.getUTCDay()]} · ${timeStr}`

  return NextResponse.json({
    observation: null,
    clarification: null,
    suggestedTime,
    suggestedLabel,
    stillNeeded: true,
  })
}

// ─── route ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await readAiRequest(request, pastDeadlineRequestSchema)
  if (body instanceof Response) return body
  const { taskName, deadlineWas, now, category, recurring, userReply } = body

  const access = await getGeminiAccess()
  if (!access) return localFallback(deadlineWas, recurring, now)

  const overdueMs = new Date(now).getTime() - new Date(deadlineWas).getTime()
  const overdueHours = Math.round(overdueMs / (1000 * 60 * 60))

  const userPrompt = [
    `Task name: ${taskName}`,
    category ? `Category: ${category}` : null,
    `Recurring: ${recurring ?? 'none'}`,
    `Deadline was: ${deadlineWas}`,
    `Current time: ${now}`,
    `Overdue by: ~${overdueHours} hour(s)`,
    userReply ? `User clarification: ${userReply}` : null,
  ].filter(Boolean).join('\n')

  const start = Date.now()
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: { maxOutputTokens: 1024, responseMimeType: 'application/json' },
  })

  for (const model of aiModels(access)) {
    try {
      const res = model === GROQ_MODEL ? await fetchGroq(access.groqKey!, requestBody) : await fetchGemini(model, access.apiKey, requestBody)
      if (!res.ok) continue

      const data: GeminiResponse = await res.json()
      if (aiBlocked(data)) return localFallback(deadlineWas, recurring, now)
      const raw = geminiText(data)
      if (!raw) continue

      const parsed = pastDeadlineOutputSchema.safeParse(readGeminiJson(raw))
      if (!parsed.success) continue
      if (parsed.data.suggestedTime && Date.parse(parsed.data.suggestedTime) <= Date.parse(now)) continue

      await recordAiCall(access, 'past-deadline', model, start, data.usageMetadata)
      return NextResponse.json(parsed.data)
    } catch {
      console.warn('LoadLight received no usable Gemini deadline response.')
    }
  }

  return localFallback(deadlineWas, recurring, now)
}
