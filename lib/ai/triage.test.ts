import { describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/chat/route'
import { toTriageTask, triageTasks } from './triage'
import type { Task } from '@/lib/data/tasks'
import type { ChatTask } from './schemas'

const provider = vi.hoisted(() => ({ getGeminiAccess: vi.fn(), fetchGemini: vi.fn() }))
vi.mock('@/lib/ai/server', async importOriginal => ({
  ...await importOriginal<typeof import('./server')>(), ...provider,
}))

const today = '2026-11-28'
const tasks = [
  { name: 'Draft slides', priority: 1, deadline: '2026-11-29T17:00', estimated_minutes: 100 },
  { name: 'Finish estimate', priority: 1, deadline: today + 'T16:00', estimated_minutes: 120 },
  { name: 'Design review', priority: 2, start_date: today + 'T13:00:00Z', estimated_minutes: 45 },
  { name: 'Submit claim', priority: 2, deadline: today + 'T00:00:00Z', estimated_minutes: 60 },
  { name: 'Send proof', priority: 3, deadline: today + 'T12:30', estimated_minutes: 25 },
  { name: 'Organize files', priority: 4 },
]

describe('task triage', () => {
  it('puts actionable deadlines and fixed appointments ahead of tomorrow', () => {
    const { commitments, flexible, next } = triageTasks(tasks, today, '11:20')
    expect(next?.name).toBe('Send proof')
    expect(commitments.map(task => task.name)).toEqual(['Send proof', 'Design review', 'Finish estimate', 'Submit claim'])
    expect(commitments[1]).toMatchObject({ start: today + 'T13:00', end: today + 'T13:45', reason: 'Fixed 13:00–13:45' })
    expect(flexible.map(task => task.name)).toEqual(['Draft slides', 'Organize files'])
  })

  it.each(['12:50', '13:20'])('reserves a meeting when work cannot fit or it is already in progress at %s', time => {
    expect(triageTasks(tasks, today, time).next?.name).toBe('Design review')
  })

  it('keeps infeasible deadlines visible without calling them the next task', () => {
    const { commitments, next } = triageTasks([tasks[4]], today, '12:20')
    expect(next).toBeNull()
    expect(commitments[0].name).toBe('Send proof')
    expect(triageTasks([tasks[4]], today, '12:40').commitments[0].reason).toContain('Past due')
  })

  it('sends the stored wall-clock start and estimate from the task list', () => {
    const task: Task = { id: 'review', name: 'Design review', priority: 2, difficulty: 2, category: 'Work',
      lifeDomain: 'work', demandType: 'cognitive', notes: 'Private note', status: 'active', recurring: 'none',
      startDate: today + 'T13:00:00Z', estimatedMinutes: 45 }
    const sent = toTriageTask(task)
    expect(sent).toMatchObject({ start_date: task.startDate, estimated_minutes: 45 })
    expect(sent).not.toHaveProperty('notes')
  })

  it('keeps a recurring fixed slot on today\'s calendar and filters inactive tasks', () => {
    const result = triageTasks([
      { name: 'Daily briefing', deadline: '2026-11-26T13:00', recurring: 'daily', estimated_minutes: 45 },
      { name: 'Done', deadline: today, status: 'completed' },
      { name: 'Archived', deadline: today, status: 'archived' },
    ], today, '11:20')
    expect(result.commitments.map(task => [task.name, task.start])).toEqual([['Daily briefing', today + 'T13:00']])
  })

  it('respects separate recurring start and deadline, and ignores a stale start on the next occurrence', () => {
    const recurring = { name: 'Weekly review', recurring: 'weekly' as const, estimated_minutes: 30,
      deadline: '2026-11-21T16:00' }
    const appointment = (start_date: string) => triageTasks([{ ...recurring, start_date }], today, '13:15').appointment
    expect(appointment(today + 'T13:00')).toMatchObject({ start: today + 'T13:00', deadline: today + 'T16:00' })
    expect(appointment('2026-11-21T13:00')).toMatchObject({ start: today + 'T16:00' })
    const inside = triageTasks([recurring], today, '16:15')
    expect(inside.next?.end).toBe(today + 'T16:30')
    const finished = triageTasks([recurring], today, '16:30')
    expect(finished.next).toBeNull()
    expect(finished.flexible[0].start).toBe('2026-12-05T16:00')
  })

  it('keeps simultaneous appointments visible and never schedules other work during them', () => {
    const result = triageTasks([...tasks, { name: 'Interview', start_date: today + 'T13:00', estimated_minutes: 30 }], today, '13:15')
    expect(result.appointment?.start).toBe(today + 'T13:00')
    expect(result.next).toBe(result.appointment)
    expect(result.commitments.filter(task => task.start === today + 'T13:00')).toHaveLength(2)
  })
})

async function triage(input: ChatTask[] = tasks) {
  const response = await POST(new Request('http://localhost/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'triage', tasks: input, todayStr: today, currentTime: '11:20' }),
  }))
  return response.json()
}

it('keeps Gemini choices within the list and protects all commitments from postponement', async () => {
  provider.getGeminiAccess.mockResolvedValue({ apiKey: 'fixture' })
  const indices = { urgent: [0, 0, 999], canSkip: [2, 4, 5], questionTask: 2 }
  provider.fetchGemini.mockResolvedValueOnce(Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify(indices) }] } }],
  }))
  const result = await triage()
  expect(result.source).toBe('gemini')
  expect(result.urgent.map((item: { name: string }) => item.name)).toEqual([
    'Send proof', 'Design review', 'Finish estimate', 'Submit claim', 'Draft slides',
  ])
  expect(result.canSkip).toEqual([{ name: 'Organize files', reason: 'No deadline' }])
  expect(result.question).toBeNull()
  const prompt = JSON.parse(provider.fetchGemini.mock.calls[0][2]).contents[0].parts[0].text
  expect(prompt).toContain(today + ' 11:20')
  expect(prompt).toContain(today + 'T13:45')
})

it('returns time commitments with accurate attribution when Gemini is unavailable', async () => {
  provider.getGeminiAccess.mockResolvedValue(null)
  const result = await triage()
  expect(result.urgent[0]).toEqual({ name: 'Send proof', reason: 'Due today 12:30' })
  expect(result).toMatchObject({ source: 'rules', canSkip: [], question: null })
})

it('does not call future bookings, past bookings or ambiguous duplicate names safe to postpone', async () => {
  provider.getGeminiAccess.mockResolvedValue({ apiKey: 'fixture' })
  provider.fetchGemini.mockResolvedValueOnce(Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify({ urgent: [], canSkip: [0, 1, 2], questionTask: 3 }) }] } }],
  }))
  const result = await triage([
    { name: 'Interviews', start_date: '2026-11-29T09:00' },
    { name: 'Morning review', start_date: today + 'T09:00' },
    { name: 'Interviews' }, { name: 'Interviews' },
  ])
  expect(result.canSkip).toEqual([])
  expect(result.question).toBeNull()
  expect(result.urgent).toEqual([{ name: 'Morning review', reason: 'Fixed 09:00–09:30 (past)' }])
})
