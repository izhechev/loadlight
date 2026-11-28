import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiBlocked, aiModels, fetchGemini, fetchGroq, GEMINI_MODELS, GROQ_MODEL, getGeminiAccess } from './server'

const auth = vi.hoisted(() => ({ cookie: vi.fn(), getClaims: vi.fn(), rpc: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: auth.cookie }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getClaims: auth.getClaims }, rpc: auth.rpc }),
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Gemini access', () => {
  beforeEach(() => {
    vi.stubEnv('GROQ_API_KEY', '')
    vi.stubEnv('GOOGLE_API_KEY', '')
    vi.stubEnv('GEMINI_API_KEY', 'alias')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.invalid')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'public')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    auth.cookie.mockReset()
    auth.getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: 'member' } } })
    auth.rpc.mockReset().mockResolvedValue({ data: true })
  })

  it('places Groq after Gemini and supports a Groq-only configuration', async () => {
    vi.stubEnv('GROQ_API_KEY', 'groq-fixture')
    expect(aiModels((await getGeminiAccess())!)).toEqual([...GEMINI_MODELS, GROQ_MODEL])
    vi.stubEnv('GEMINI_API_KEY', '')
    expect(aiModels((await getGeminiAccess())!)).toEqual([GROQ_MODEL])
  })

  it('accepts either server key and prefers GOOGLE_API_KEY when both exist', async () => {
    expect((await getGeminiAccess())?.apiKey).toBe('alias')
    vi.stubEnv('GOOGLE_API_KEY', ' preferred ')
    expect((await getGeminiAccess())?.apiKey).toBe('preferred')
    expect(auth.rpc).toHaveBeenCalledWith('consume_ai_quota')
  })

  it('falls back before checking quota when the key is missing or the session is a guest', async () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    expect(await getGeminiAccess()).toBeNull()
    expect(console.warn).toHaveBeenCalledWith('LoadLight Gemini access', { reason: 'missing_api_key' })
    vi.stubEnv('GEMINI_API_KEY', 'alias')
    auth.cookie.mockReturnValue({ value: '1' })
    expect(await getGeminiAccess()).toBeNull()
    expect(console.info).toHaveBeenCalledWith('LoadLight Gemini access', { reason: 'guest' })
    expect(auth.rpc).not.toHaveBeenCalled()
  })

  it('distinguishes an exhausted quota from a failed quota check', async () => {
    auth.rpc.mockResolvedValueOnce({ data: false })
    expect(await getGeminiAccess()).toBeNull()
    expect(console.info).toHaveBeenCalledWith('LoadLight Gemini access', { reason: 'quota_denied' })
    auth.rpc.mockRejectedValueOnce(new Error('private details'))
    expect(await getGeminiAccess()).toBeNull()
    expect(console.warn).toHaveBeenCalledWith('LoadLight Gemini access', { reason: 'quota_rpc_error' })
  })
})

it.each([
  ['API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED'],
  ['PRIVATE_DETAILS', undefined],
])('only logs recognized Google error reasons (%s)', async (reason, expected) => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
    error: {
      message: 'private details',
      details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason, metadata: { consumer: 'private project' } }],
    },
  }, { status: 403 })))
  const response = await fetchGemini(GEMINI_MODELS[0], 'private key', 'private prompt')
  expect(response.status).toBe(403)
  expect(warn.mock.calls).toEqual([['LoadLight Gemini HTTP error', { model: GEMINI_MODELS[0], status: 403, reason: expected }]])
})

const requestBody = JSON.stringify({
  systemInstruction: { parts: [{ text: 'Draft a task' }] },
  contents: [{ parts: [{ text: 'Review the fictional checklist' }] }],
  generationConfig: { maxOutputTokens: 2048, responseMimeType: 'application/json', responseJsonSchema: { type: 'object' } },
  safetySettings: [{}],
})

it('checks content before calling Groq and preserves its structured output and usage', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '{"category":"allowed"}' }, finish_reason: 'stop' }] }))
    .mockResolvedValueOnce(Response.json({
      choices: [{ message: { content: '{"tasks":[]}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    }))
  vi.stubGlobal('fetch', fetchMock)
  const result = await (await fetchGroq('secret-fixture', requestBody)).json()
  const [, call] = fetchMock.mock.calls[1]
  expect(call.headers.Authorization).toBe('Bearer secret-fixture')
  expect(JSON.parse(call.body)).toMatchObject({
    model: GROQ_MODEL, response_format: { type: 'json_schema', json_schema: { schema: { type: 'object' } } },
  })
  expect(result).toMatchObject({ candidates: [{ finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8 } })
})

it('returns a blocked result without generating a draft when moderation rejects the input', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({
    choices: [{ message: { content: '{"category":"hate"}' }, finish_reason: 'stop' }],
  }))
  vi.stubGlobal('fetch', fetchMock)
  const result = await (await fetchGroq('secret-fixture', requestBody)).json()
  expect(aiBlocked(result)).toBe(true)
  expect(result.blockedCategory).toBe('hate')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
