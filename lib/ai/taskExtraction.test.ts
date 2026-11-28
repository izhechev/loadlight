import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractTaskDrafts } from './taskExtraction'

const provider = vi.hoisted(() => ({
  getGeminiAccess: vi.fn(),
  fetchGemini: vi.fn(),
  recordAiCall: vi.fn(),
}))

vi.mock('@/lib/ai/server', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/ai/server')>(),
  ...provider,
}))

const today = '2026-11-28'

describe('local task extraction', () => {
  it.each([
    ['Buy groceries\nCall Mom', ['Buy groceries', 'Call Mom']],
    ['Buy groceries, call Mom, and wash the car', ['Buy groceries', 'Call Mom', 'Wash the car']],
    ['Buy groceries and call Mom', ['Buy groceries', 'Call Mom']],
    ['Cook mac and cheese', ['Cook mac and cheese']],
  ])('keeps the actions in %s', (text, names) => {
    expect(extractTaskDrafts(text, today).map(task => task.name)).toEqual(names)
  })

  it.each([
    ['Send the email tomorrow at 3pm', { deadline: '2026-11-29T15:00' }],
    ['Submit lab report by Monday at 15:00', { name: 'Submit lab report', deadline: '2026-11-30T15:00', lifeDomain: 'study' }],
    ['Doctor appointment tomorrow at 3pm for 45 minutes', { name: 'Doctor appointment', startDate: '2026-11-29T15:00', deadline: null, estimatedMinutes: 45 }],
    ['Book a dentist appointment by Monday at 3pm', { name: 'Book a dentist appointment', startDate: null, deadline: '2026-11-30T15:00' }],
    ['Read for 45 min', { name: 'Read', estimatedMinutes: 45 }],
    ['Read for 1 hour and 30 minutes', { name: 'Read', estimatedMinutes: 90 }],
    ['Run every Friday at 7 AM', { name: 'Run', deadline: '2026-12-04T07:00', recurring: 'weekly' }],
    ['Pay rent on the first of every month', { name: 'Pay rent', deadline: '2026-12-01', recurring: 'monthly', lifeDomain: 'finance' }],
    ['Water plants every other day', { name: 'Water plants', deadline: today, recurring: 'daily', recurringDays: 2 }],
    ['Call Dad by Monday', { name: 'Call Dad', deadline: '2026-11-30' }],
    ['Study starting on Sunday at 9am by Monday at 3pm', { name: 'Study', startDate: '2026-11-29T09:00', deadline: '2026-11-30T15:00' }],
  ])('recognizes explicit details in %s', (text, details) => {
    expect(extractTaskDrafts(text, today)).toEqual([expect.objectContaining(details)])
  })

  it('keeps each date, estimate and recurrence with its line', () => {
    expect(extractTaskDrafts('Review notes tomorrow for 30 min\nRun every Sunday at 8am\nBuy groceries Monday', today)).toEqual([
      expect.objectContaining({ deadline: '2026-11-29', estimatedMinutes: 30, recurring: 'none' }),
      expect.objectContaining({ deadline: '2026-11-29T08:00', recurring: 'weekly', estimatedMinutes: null }),
      expect.objectContaining({ deadline: '2026-11-30', recurring: 'none', estimatedMinutes: null }),
    ])
  })

  it('accepts each task from the original mixed input', () => {
    expect(extractTaskDrafts('Pay invoice tomorrow at 10:00\nGym every Tuesday at 18:30', today)).toEqual([
      expect.objectContaining({ name: 'Pay invoice', deadline: '2026-11-29T10:00' }),
      expect.objectContaining({ name: 'Gym', deadline: '2026-12-01T18:30', recurring: 'weekly' }),
    ])
  })

  it('makes distinct daily slots without losing their common action', () => {
    expect(extractTaskDrafts('Take medicine at 8am, 8pm daily', today)).toEqual([
      expect.objectContaining({ name: 'Take medicine', deadline: '2026-11-28T08:00', recurring: 'daily' }),
      expect.objectContaining({ name: 'Take medicine', deadline: '2026-11-28T20:00', recurring: 'daily' }),
    ])
  })
})

describe('extract route', () => {
  async function extract(text: string) {
    const { POST } = await import('@/app/api/ai/extract/route')
    return POST(new Request('http://localhost/api/ai/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, today: '2026-11-29', categories: ['Study', 'Personal'] }),
    }))
  }

  function respondFromGemini(tasks: object[]) {
    provider.getGeminiAccess.mockResolvedValue({ apiKey: 'fixture' })
    provider.fetchGemini.mockResolvedValueOnce(Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ tasks }) }] } }],
    }))
  }

  it('returns unclear task names only when they belong to the draft', async () => {
    provider.getGeminiAccess.mockResolvedValue({ apiKey: 'fixture' })
    provider.fetchGemini.mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      tasks: [{ name: 'Handle the thing', category: 'Personal' }],
      unclearTasks: ['Handle the thing', 'Made-up task'],
    }) }] } }] }))
    expect(await (await extract('Handle the thing today')).json()).toMatchObject({
      unclearTasks: ['Handle the thing'], offline: false,
    })
  })

  beforeEach(() => {
    provider.getGeminiAccess.mockReset()
    provider.fetchGemini.mockReset()
    provider.recordAiCall.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => vi.restoreAllMocks())

  it('returns editable preview fields and uses the browser date without Gemini', async () => {
    const response = await extract('Submit lab report by Monday at 15:00 for 45 minutes')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      offline: true,
      tasks: [{
        name: 'Submit lab report',
        deadline: '2026-11-30T15:00',
        estimated_minutes: 45,
        life_domain: 'study',
        category: 'Study',
        demand_type: 'cognitive',
      }],
    })
  })

  it('pairs a reordered same-length response by task name before correcting dates', async () => {
    respondFromGemini([
      { name: 'Call Alex', category: 'Personal', deadline: '2026-11-29T13:00', notes: 'Call after lunch' },
      { name: 'Submit the lab report.', category: 'Study', deadline: '2026-11-29T08:00', notes: 'Submit through the portal' },
    ])
    const response = await extract('Submit lab report by Monday at 15:00\nCall Alex today at 13:00')
    expect(await response.json()).toMatchObject({
      offline: false,
      tasks: [
        { name: 'Submit the lab report.', deadline: '2026-11-30T15:00', notes: 'Submit through the portal' },
        { name: 'Call Alex', deadline: '2026-11-29T13:00', notes: 'Call after lunch' },
      ],
    })
  })

  it('uses structured output on the backup model and accepts null optional details', async () => {
    provider.fetchGemini.mockResolvedValueOnce(Response.json({}, { status: 503 }))
    respondFromGemini([{
      name: 'Review checklist', category: 'Study', notes: null, lifeDomain: null, timesPerDay: null,
      priority: null, difficulty: null, demandType: null, recurring: null, estimatedMinutes: null, startDate: null, deadline: null,
    }])
    const response = await extract('Review checklist')
    expect(await response.json()).toMatchObject({
      offline: false,
      tasks: [{ name: 'Review checklist', notes: '', deadline: null, start_date: null, estimated_minutes: null, times_per_day: 1 }],
    })
    for (const [, , body] of provider.fetchGemini.mock.calls) {
      const { responseJsonSchema } = JSON.parse(body).generationConfig
      const task = responseJsonSchema.properties.tasks.items
      expect(task.required).toContain('name')
      expect(task.properties.deadline.type).toEqual(['string', 'null'])
      expect(task.properties.recurring.enum).toContain('weekly')
      expect(responseJsonSchema.properties.clarification.properties.options.items.properties.label.type).toBe('string')
      expect(JSON.stringify(responseJsonSchema)).not.toMatch(/"pattern"|"default"|"\$schema"/)
    }
  })

  it('rejects an invalid date and logs only its field and validation code', async () => {
    respondFromGemini([{ name: 'Review checklist', category: 'Study', deadline: 'private invalid value' }])
    provider.fetchGemini.mockResolvedValueOnce(Response.json({}, { status: 503 }))
    const response = await extract('Review checklist')
    expect(await response.json()).toMatchObject({ offline: true, tasks: [{ deadline: null }] })
    expect(vi.mocked(console.warn).mock.calls).toEqual([[
      'LoadLight Gemini extraction', { model: expect.any(String), reason: 'invalid_schema', issues: ['deadline:invalid_union'] },
    ]])
  })

  it('uses the original draft when same-name model results cannot be distinguished', async () => {
    respondFromGemini([
      { name: 'Review notes', category: 'Study', deadline: '2026-11-29T13:00', notes: 'Chemistry' },
      { name: 'Review notes', category: 'Study', deadline: '2026-11-29T13:00', notes: 'Physics' },
    ])
    const response = await extract('Review notes today at 13:00\nReview notes tomorrow at 15:00')
    expect(console.warn).toHaveBeenCalledWith('LoadLight Gemini extraction', {
      model: expect.any(String), reason: 'unmatched_tasks',
    })
    expect(await response.json()).toMatchObject({
      offline: true,
      tasks: [
        { deadline: '2026-11-29T13:00', notes: '' },
        { deadline: '2026-11-30T15:00', notes: '' },
      ],
    })
  })

  it('keeps invalid model output out of diagnostics and returns local drafts', async () => {
    provider.getGeminiAccess.mockResolvedValue({ apiKey: 'fixture' })
    provider.fetchGemini.mockImplementation(async () => Response.json({
      candidates: [{ content: { parts: [{ text: 'private text rather than JSON' }] } }],
    }))
    const response = await extract('Review notes')
    const preview = await response.json()
    expect(preview).toMatchObject({ offline: true, tasks: [{ name: 'Review notes' }] })
    expect(Object.keys(preview).sort()).toEqual(['offline', 'tasks'])
    expect(vi.mocked(console.warn).mock.calls).toEqual([
      ['LoadLight Gemini extraction', { model: expect.any(String), reason: 'invalid_json' }],
      ['LoadLight Gemini extraction', { model: expect.any(String), reason: 'invalid_json' }],
    ])
  })

  it('matches same-name occurrences only when their times identify each one', async () => {
    respondFromGemini([
      { name: 'Water seedlings', category: 'Personal', deadline: '2026-11-29T20:00Z', notes: 'Evening' },
      { name: 'Water seedlings', category: 'Personal', deadline: '2026-11-29T08:00', notes: 'Morning' },
    ])
    const response = await extract('Water seedlings daily at 08:00 and 20:00')
    expect(await response.json()).toMatchObject({
      offline: false,
      tasks: [
        { deadline: '2026-11-29T08:00', notes: 'Morning' },
        { deadline: '2026-11-29T20:00', notes: 'Evening' },
      ],
    })
  })

  it('falls back when similar names refer to different people', async () => {
    respondFromGemini([
      { name: 'Call Joan', category: 'Personal', deadline: '2026-11-29T13:00' },
      { name: 'Call Jonathan', category: 'Personal', deadline: '2026-11-29T15:00' },
    ])
    const response = await extract('Call John today at 13:00\nCall Joan tomorrow at 15:00')
    expect(await response.json()).toMatchObject({
      offline: true,
      tasks: [
        { name: 'Call John', deadline: '2026-11-29T13:00' },
        { name: 'Call Joan', deadline: '2026-11-30T15:00' },
      ],
    })
  })
})
