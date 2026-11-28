import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/chat/route'
import { GEMINI_MODELS } from './server'

const provider = vi.hoisted(() => ({ getGeminiAccess: vi.fn(), fetchGemini: vi.fn() }))
vi.mock('@/lib/ai/server', async importOriginal => ({
  ...await importOriginal<typeof import('./server')>(),
  ...provider,
}))

const breakdown = { mode: 'breakdown', text: 'Review a checklist' }
const steps = { tasks: [{ name: 'Read each item' }, { name: 'Mark gaps' }, { name: 'Review changes' }] }

async function chat(body: object) {
  return POST(new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

function modelResult(value: object, finishReason = 'STOP') {
  return Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] })
}

describe('chat model fallback', () => {
  beforeEach(() => {
    provider.getGeminiAccess.mockReset().mockResolvedValue({ apiKey: 'fixture' })
    provider.fetchGemini.mockReset()
  })

  it.each([404, 408, 429, 503])('uses the secondary model after HTTP %i', async status => {
    provider.fetchGemini.mockResolvedValueOnce(new Response(null, { status })).mockResolvedValueOnce(modelResult(steps))
    expect(await (await chat(breakdown)).json()).toEqual({ ...steps, source: 'ai' })
    expect(provider.fetchGemini.mock.calls.map(([model]) => model)).toEqual(GEMINI_MODELS)
    expect(provider.getGeminiAccess).toHaveBeenCalledTimes(1)
  })

  it('uses the secondary model for weekly advice after a network error', async () => {
    const advice = { verdict: 'light', trend: 'One planned task.', advice: '', suggestion: '' }
    provider.fetchGemini.mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(modelResult(advice))
    const response = await chat({ mode: 'weekly', week: {
      startDay: '2026-11-23', endDay: '2026-11-29', completed: 0, pending: 1, minutes: 25,
      dailyMinutes: [0, 0, 0, 0, 0, 0, 25], categories: [{ name: 'Personal', count: 1 }],
    } })
    expect(await response.json()).toEqual({ ...advice, source: 'gemini' })
    expect(provider.getGeminiAccess).toHaveBeenCalledTimes(1)
  })

  it('grounds the Saturday summary in local time and omits scheduling advice based only on totals', async () => {
    const result = { verdict: 'balanced', trend: '250 minutes Saturday and 100 Sunday.',
      advice: 'Move work to Friday.', suggestion: 'Delay the fixed meeting.' }
    provider.fetchGemini.mockResolvedValueOnce(modelResult(result))
    const response = await chat({ mode: 'weekly', todayStr: '2026-11-28', currentTime: '11:20', week: {
      startDay: '2026-11-23', endDay: '2026-11-29', completed: 0, pending: 5, minutes: 350,
      dailyMinutes: [0, 0, 0, 0, 0, 250, 100], categories: [{ name: 'Work', count: 5 }],
    } })
    const providerRequest = JSON.parse(provider.fetchGemini.mock.calls[0][2])
    expect(providerRequest.contents[0].parts[0].text).toContain('2026-11-28 11:20')
    expect(await response.json()).toEqual({ source: 'gemini', verdict: result.verdict, trend: result.trend, advice: '', suggestion: '' })
  })

  it('validates balance suggestions from the backup model after a timeout', async () => {
    const idea = { name: 'Walk', category: 'Exercise', reason: 'It fits the available time.', estimatedMinutes: 15 }
    provider.fetchGemini.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'))
      .mockResolvedValueOnce(modelResult({
        verdict: 'too_little', headline: 'A short walk', reason: 'There are 20 spare minutes.',
        remove: [], add: [idea, { ...idea, estimatedMinutes: 30 }],
      }))
    const response = await chat({ mode: 'balance-check', dayTaskCount: 1, dayLoadMinutes: 40,
      toughDayThreshold: 60, missingAreas: ['Exercise', 'Creative'] })
    expect(await response.json()).toMatchObject({ source: 'gemini', remove: [], add: [idea] })
    expect(provider.getGeminiAccess).toHaveBeenCalledTimes(1)
  })

  it('uses local suggestions after both models return 503', async () => {
    provider.fetchGemini.mockResolvedValue(new Response(null, { status: 503 }))
    expect(await (await chat(breakdown)).json()).toMatchObject({ source: 'local' })
    expect(provider.fetchGemini).toHaveBeenCalledTimes(GEMINI_MODELS.length)
  })

  it('accepts only eligible Chill task IDs and builds questions from their real names', async () => {
    provider.fetchGemini.mockResolvedValueOnce(modelResult({
      taskIds: ['meeting', 'proof', 'files', 'files'], questionId: 'meeting',
    }))
    const tasks = [
      { id: 'meeting', name: 'Design review', start_date: '2026-11-28T13:00' },
      { id: 'proof', name: 'Print proof', deadline: '2026-11-28T12:30' },
      { id: 'files', name: 'Sort files', priority: 4 },
    ]
    const response = await chat({ mode: 'chill-snooze', todayStr: '2026-11-28', currentTime: '11:20', tasks })
    expect(await response.json()).toMatchObject({ canPostpone: [{ id: 'files', name: 'Sort files' }], question: null, questionTaskId: null })
    const sent = JSON.parse(provider.fetchGemini.mock.calls[0][2]).contents[0].parts[0].text
    expect(sent).not.toMatch(/Design review|Print proof/)
  })

  it('protects the 48-hour deadline window before requesting Chill suggestions', async () => {
    const tasks = [{ id: 'proof', name: 'Print proof', deadline: '2026-11-30T11:20' }]
    const response = await chat({ mode: 'chill-snooze', todayStr: '2026-11-28', currentTime: '11:20', tasks })
    expect(await response.json()).toMatchObject({ canPostpone: [], question: null })
    expect(provider.getGeminiAccess).not.toHaveBeenCalled()
  })

  it.each([400, 401, 403, 499])('keeps the local breakdown after terminal HTTP %i', async status => {
    provider.fetchGemini.mockResolvedValueOnce(new Response(null, { status }))
    expect(await (await chat(breakdown)).json()).toMatchObject({ source: 'local' })
    expect(provider.fetchGemini).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['blocked prompt', () => Response.json({ promptFeedback: { blockReason: 'SAFETY' } })],
    ['blocked answer', () => modelResult(steps, 'SAFETY')],
    ['invalid answer', () => modelResult({ tasks: [] })],
  ])('keeps the local breakdown after a %s', async (_, response) => {
    provider.fetchGemini.mockResolvedValueOnce(response())
    expect(await (await chat(breakdown)).json()).toMatchObject({ source: 'local' })
    expect(provider.fetchGemini).toHaveBeenCalledTimes(1)
  })

  it('uses local suggestions when the account cannot call Gemini', async () => {
    provider.getGeminiAccess.mockResolvedValueOnce(null)
    expect(await (await chat(breakdown)).json()).toMatchObject({ source: 'local' })
    expect(provider.fetchGemini).not.toHaveBeenCalled()
  })

  it('rejects an invalid user request before checking access', async () => {
    expect((await chat({ ...breakdown, text: 1 })).status).toBe(400)
    expect(provider.getGeminiAccess).not.toHaveBeenCalled()
    expect(provider.fetchGemini).not.toHaveBeenCalled()
  })
})
