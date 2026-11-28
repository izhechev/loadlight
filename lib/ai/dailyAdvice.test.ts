import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/ai/advise/route'
import type { Task } from '@/lib/data/tasks'
import { dailyAdviceOptions, dailyAdvicePlan, describeDailyPlan } from './dailyAdvice'

const gemini = vi.hoisted(() => ({ getGeminiAccess: vi.fn(), fetchGemini: vi.fn(), recordAiCall: vi.fn() }))
vi.mock('@/lib/ai/server', async importOriginal => ({
  ...await importOriginal<typeof import('./server')>(), ...gemini,
}))

const base = { category: 'Work', lifeDomain: 'work', demandType: 'routine', difficulty: 2, priority: 2, notes: 'private notes', status: 'active', recurring: 'none' } as const
const tasks: Task[] = [
  { ...base, id: 'slides', name: 'Draft slides', priority: 1, deadline: '2026-11-29T17:00', estimatedMinutes: 100 },
  { ...base, id: 'review', name: 'Design review', startDate: '2026-11-28T13:00:00Z', estimatedMinutes: 45 },
  { ...base, id: 'proof', name: 'Print proof', priority: 3, deadline: '2026-11-28T12:30:00Z', estimatedMinutes: 25 },
]
const plan = dailyAdvicePlan(tasks, new Date(2026, 10, 28, 11, 20).getTime())
const busy = { state: 'normal' as const, taskCount: 6, urgentCount: 4, todayMinutes: 250, capacityMinutes: 240, plan }

async function request(body: object) {
  return (await POST(new Request('http://localhost/api/ai/advise', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }))).json()
}

describe('daily advice', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    gemini.getGeminiAccess.mockResolvedValue({ apiKey: 'fixture' })
  })

  it('names the first feasible deadline and protects the appointment in local time', () => {
    expect(describeDailyPlan(plan)).toBe('Start with “Print proof” (25 min, due by 12:30). Keep 13:00–13:45 for “Design review”.')
    expect(plan.flexible.map(task => task.name)).toEqual(['Draft slides'])
    const duringReview = dailyAdvicePlan(tasks, new Date(2026, 10, 28, 13, 10).getTime())
    expect(duringReview.appointment?.name).toBe('Design review')
    expect(duringReview.conflicts).toEqual(['“Print proof” (25 min, due 12:30) is past due.'])
    expect(describeDailyPlan(duringReview)).toBe('')
  })

  it('never offers postponement for a fixed booking or a deadline due today', () => {
    const options = dailyAdviceOptions({ ...busy, plan: { ...plan, flexible: [plan.appointment!, plan.next!] } })
    expect(options.some(text => text.includes('can wait'))).toBe(false)
    expect(options[0]).toContain('10 min over capacity')
  })

  it('accepts a valid Gemini choice and excludes notes and IDs from the prompt', async () => {
    gemini.fetchGemini.mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: '{"choice":1}' }] } }] }))
    expect(await request(busy)).toMatchObject({ source: 'gemini', advice: '“Draft slides” can wait until today\'s commitments are covered.' })
    const payload = JSON.parse(gemini.fetchGemini.mock.calls[0][2])
    const facts = JSON.parse(payload.contents[0].parts[0].text)
    expect(facts.plan.appointment.start).toBe('2026-11-28T13:00')
    expect(facts.plan.next.name).toBe('Print proof')
    expect(facts.plan.next).not.toHaveProperty('id')
    expect(payload.contents[0].parts[0].text).not.toContain('private notes')
  })

  it('discards model text and invalid choices without presenting them as advice', async () => {
    gemini.fetchGemini.mockImplementation(async () => Response.json({ candidates: [{ content: { parts: [{ text: '{"choice":99,"text":"Skip the meeting"}' }] } }] }))
    expect(await request(busy)).toEqual({ advice: null, aiDisclosure: true })
    expect(gemini.recordAiCall).not.toHaveBeenCalled()
  })

  it('sends both conflict facts to Gemini and offers only conflict follow-ups', async () => {
    const conflicts = ['“Review” overlaps with “Call”.', '“Permit” has no room before its deadline.']
    const conflictPlan = { ...plan, conflicts }
    gemini.fetchGemini.mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: '{"choice":0}' }] } }] }))
    expect(describeDailyPlan(conflictPlan)).toBe('')
    expect(await request({ ...busy, plan: conflictPlan })).toMatchObject({
      source: 'gemini', advice: expect.stringContaining('Review the flagged commitments first'),
    })
    const prompt = JSON.parse(gemini.fetchGemini.mock.calls[0][2]).contents[0].parts[0].text
    expect(JSON.parse(prompt).plan.conflicts).toEqual(conflicts)
  })

  it('keeps the original aggregate-only request and rest-mode guard', async () => {
    gemini.fetchGemini.mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: '{"choice":0}' }] } }] }))
    expect((await request({ ...busy, plan: undefined })).advice).toContain('10 min over capacity')
    gemini.getGeminiAccess.mockClear()
    expect((await request({ ...busy, state: 'overwhelmed' })).advice).toBeNull()
    expect(gemini.getGeminiAccess).not.toHaveBeenCalled()
  })
})
