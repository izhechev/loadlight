import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchGemini, GEMINI_MODELS, getGeminiAccess } from './server'

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
