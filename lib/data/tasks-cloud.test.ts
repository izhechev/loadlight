import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { buildSchedule } from '@/lib/utils/scheduling'

const url = 'https://loadlight-fixture.supabase.co'
const fetchMock = vi.fn<typeof fetch>()
let supabase: ReturnType<typeof createClient>
let tasks: typeof import('./tasks')
vi.mock('@/lib/supabase/client', () => ({ createClient: () => supabase }))

function requestAt(index: number) {
  return new Request(...fetchMock.mock.calls[index])
}

beforeEach(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', url)
  vi.resetModules()
  fetchMock.mockReset()
  supabase = createClient(url, 'mock-publishable-key', {
    global: { fetch: fetchMock },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
    data: { user: { id: 'fixture-user', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' } },
    error: null,
  })
  tasks = await import('./tasks')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

it('round trips a hosted date-only deadline and keeps a date-only start flexible', async () => {
  const day = '2026-11-30'
  const row = {
    id: 'essay',
    name: 'Write essay',
    category: 'Study',
    deadline: `${day}T23:59:59.999+00:00`,
    start_date: `${day}T00:00:00+00:00`,
    estimated_minutes: 45,
    status: 'active',
  }
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
  fetchMock.mockResolvedValueOnce(Response.json(row))
  fetchMock.mockResolvedValueOnce(Response.json([row]))

  const created = await tasks.addTask({
    name: row.name, category: row.category, lifeDomain: 'study', demandType: 'cognitive',
    difficulty: 3, priority: 3, deadline: day, startDate: day, estimatedMinutes: 45,
    notes: '', status: 'active', recurring: 'none',
  })
  expect(await requestAt(1).json()).toMatchObject({
    deadline: `${day}T23:59:59.999Z`,
    start_date: `${day}T00:00:00Z`,
  })
  expect(created.deadline).toBe(day)
  const [read] = await tasks.getTasks()
  expect(read.deadline).toBe(day)
  expect(buildSchedule([{
    id: read.id, name: read.name, deadline: read.deadline, start_date: read.startDate, estimated_minutes: read.estimatedMinutes,
  }], { today: day, currentTime: '10:30' }).scheduled).toMatchObject([{ start_date: `${day}T10:30` }])
})

it('writes only the start when applying a proposed plan', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ id: 'essay' }))
  await tasks.updateTask('essay', { startDate: '2026-11-30T09:30' })
  const request = requestAt(0)
  expect(request.method).toBe('PATCH')
  expect(new URL(request.url).searchParams.get('id')).toBe('eq.essay')
  expect(await request.json()).toEqual({ start_date: '2026-11-30T09:30Z' })
})

it('completes a repeat through one RPC with its next date-only deadline', async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
  await tasks.completeRecurringTask('essay', '2026-12-01')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const request = requestAt(0)
  expect(new URL(request.url).pathname).toBe('/rest/v1/rpc/complete_recurring_task')
  expect(await request.json()).toEqual({
    task_id: 'essay',
    next_deadline: '2026-12-01T23:59:59.999Z',
  })
})

it('sends a conditional checklist update and rejects a stale copy', async () => {
  const previous = [{ name: 'Write outline', done: false }]
  const steps = [{ name: 'Write outline', done: true }]
  fetchMock.mockResolvedValueOnce(Response.json([{ id: 'essay' }]))
  fetchMock.mockResolvedValueOnce(Response.json([]))

  await tasks.saveTaskSteps('essay', previous, steps)
  const request = requestAt(0)
  const params = new URL(request.url).searchParams
  expect(params.get('id')).toBe('eq.essay')
  expect(params.get('status')).toBe('eq.active')
  expect(params.get('steps')).toBe(`eq.${JSON.stringify(previous)}`)
  expect(await request.json()).toEqual({ steps })
  await expect(tasks.saveTaskSteps('essay', previous, steps)).rejects.toThrow('This task changed')
})
