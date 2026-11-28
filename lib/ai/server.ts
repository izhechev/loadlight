import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

function denyGeminiAccess(reason: string, expected = false) {
  if (expected) console.info('LoadLight Gemini access', { reason })
  else console.warn('LoadLight Gemini access', { reason })
  return null
}

export async function getGeminiAccess() {
  const apiKey = process.env.GOOGLE_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return denyGeminiAccess('missing_api_key')
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return denyGeminiAccess('missing_supabase_url')
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return denyGeminiAccess('missing_supabase_key')

  let failure = 'auth_error'
  try {
    const cookieStore = await cookies()
    if (cookieStore.get('ll-guest')?.value === '1') return denyGeminiAccess('guest', true)

    const supabase = await createClient()
    const { data, error } = await supabase.auth.getClaims()
    const claims = data?.claims
    if (error) return denyGeminiAccess('auth_error')
    if (!claims?.sub) return denyGeminiAccess('no_session', true)
    if (claims.is_anonymous === true) return denyGeminiAccess('anonymous', true)

    failure = 'quota_rpc_error'
    const quota = await supabase.rpc('consume_ai_quota')
    if (quota.error) return denyGeminiAccess(failure)
    if (quota.data !== true) return denyGeminiAccess('quota_denied', true)

    return { apiKey, supabase, userId: claims.sub }
  } catch {
    return denyGeminiAccess(failure)
  }
}

export const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'] as const

const googleErrorReasons = new Set([
  'API_KEY_INVALID', 'API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_IP_ADDRESS_BLOCKED',
  'API_KEY_ANDROID_APP_BLOCKED', 'API_KEY_IOS_APP_BLOCKED', 'SERVICE_DISABLED', 'BILLING_DISABLED',
  'RATE_LIMIT_EXCEEDED', 'QUOTA_EXCEEDED',
])

export async function fetchGemini(model: typeof GEMINI_MODELS[number], apiKey: string, body: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body,
    signal: AbortSignal.timeout(6_000),
  })
  if (!response.ok) {
    const data: GeminiResponse | null = await response.clone().json().catch(() => null)
    const details = data?.error?.details
    const reason = Array.isArray(details) ? details.find(detail =>
      detail?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo' && googleErrorReasons.has(detail.reason)
    )?.reason : undefined
    console.warn('LoadLight Gemini HTTP error', { model, status: response.status, reason })
  }
  return response
}

export type GeminiResponse = {
  error?: { code: number; status?: string; details?: { '@type'?: string; reason: string }[] }
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
