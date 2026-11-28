import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { completeRecurringTask, getTasks, saveTaskSteps, updateTask } from './tasks'

const key = 'loadlight-tasks'
const task = {
  id: 'essay', name: 'Write essay', category: 'Study', demand_type: 'routine', status: 'active',
  estimated_minutes: 45, recurring: 'daily', deadline: '2026-11-28T15:00', start_date: '2026-11-28T14:15',
}
const steps = [{ name: 'Draft', done: false }]

beforeEach(() => {
  const values = new Map([[key, JSON.stringify([task])]])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', { cookie: 'll-guest=1' })
})
afterEach(() => vi.unstubAllGlobals())

describe('task changes on this device', () => {
  it('edits a legacy task and clears the old planned start', async () => {
    await updateTask('essay', { demandType: 'creative', startDate: null })
    expect(await getTasks()).toMatchObject([{ demandType: 'creative', startDate: null, estimatedMinutes: 45 }])
    expect((await getTasks())[0]).not.toHaveProperty('start_date')
  })

  it('archives and restores the same task and its checklist', async () => {
    await saveTaskSteps('essay', [], steps)
    await updateTask('essay', { status: 'archived' })
    expect(await getTasks()).toEqual([])
    expect(await getTasks(true)).toMatchObject([{ id: 'essay', status: 'archived', steps }])
    await updateTask('essay', { status: 'active' })
    expect(await getTasks()).toMatchObject([{ id: 'essay', deadline: task.deadline, estimatedMinutes: 45, steps }])
  })

  it('preserves the latest checklist when another save used a stale preview', async () => {
    await saveTaskSteps('essay', [], steps)
    await expect(saveTaskSteps('essay', [], [])).rejects.toThrow('changed')
    expect((await getTasks())[0].steps).toEqual(steps)
    await saveTaskSteps('essay', steps, [])
    expect((await getTasks())[0].steps).toEqual([])
  })

  it('creates one fresh repeat on retry and keeps completed steps with the original', async () => {
    const doneSteps = [{ name: 'Draft', done: true }]
    await saveTaskSteps('essay', [], doneSteps)
    const next = '2026-11-29T15:00'
    await Promise.all([completeRecurringTask('essay', next), completeRecurringTask('essay', next)])
    const tasks = await getTasks()
    expect(tasks).toHaveLength(2)
    expect(tasks[0]).toMatchObject({ id: 'essay', done: true, steps: doneSteps })
    expect(tasks[1]).toMatchObject({ deadline: next, done: false, steps, startDate: null, estimatedMinutes: 45 })
  })
})
