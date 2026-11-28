import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function getGeminiAccess() {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return null
  }

  try {
    const cookieStore = await cookies()
    if (cookieStore.get('ll-guest')?.value === '1') return null

    const supabase = await createClient()
    const { data, error } = await supabase.auth.getClaims()
    const claims = data?.claims
    if (error || !claims?.sub || claims.is_anonymous === true) return null

    const quota = await supabase.rpc('consume_ai_quota')
    if (quota.error) {
      console.warn('Could not check the LoadLight AI quota.')
      return null
    }
    if (quota.data !== true) return null

    return { apiKey, supabase, userId: claims.sub }
  } catch {
    return null
  }
}

export const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'] as const

export function fetchGemini(model: string, apiKey: string, body: string) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body,
    signal: AbortSignal.timeout(6_000),
  })
}

export type GeminiResponse = {
  error?: { code: number; status?: string }
  candidates?: {
    finishReason?: string
    safetyRatings?: { category: string; probability: string }[]
    content?: { parts?: { thought?: boolean; text?: string }[] }
  }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

export function geminiText(data: GeminiResponse) {
  return data.candidates?.[0]?.content?.parts?.find(part => !part.thought && part.text?.trim())?.text?.trim()
}

export function readGeminiJson(raw: string): unknown {
  return JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim())
}

export async function recordAiCall(
  access: NonNullable<Awaited<ReturnType<typeof getGeminiAccess>>>,
  callType: 'extraction' | 'advisory' | 'past-deadline',
  model: string,
  start: number,
  usage: GeminiResponse['usageMetadata'],
) {
  try {
    const { error } = await access.supabase.from('ai_logs').insert({
      user_id: access.userId,
      call_type: callType,
      model,
      tokens_in: usage?.promptTokenCount ?? 0,
      tokens_out: usage?.candidatesTokenCount ?? 0,
      latency_ms: Date.now() - start,
    })
    if (error) console.warn('Could not record LoadLight AI usage.')
  } catch {
    console.warn('Could not record LoadLight AI usage.')
  }
}
