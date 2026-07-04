import { describe, it, expect } from 'vitest'
import { selectSchedulable, orderByEnergy, WORK_START_MIN, WORK_END_MIN } from './scheduling'

// Fixed "now": Sunday 2026-07-05 at 00:30 UTC (late night)
const NOW = new Date('2026-07-05T00:30Z').getTime()

const t = (over: Partial<{ id: string; name: string; deadline: string | null; priority: number; difficulty: number; done: boolean }>) => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  name: over.name ?? 'Task',
  deadline: over.deadline ?? null,
  priority: over.priority ?? 3,
  difficulty: over.difficulty ?? 2,
  done: over.done ?? false,
})

// ─── selectSchedulable ───────────────────────────────────────────────────────
// Which tasks belong in TODAY's plan: due today or tomorrow (calendar days,
// overdue included), or undated. Anything dated later stays on its own date.

describe('selectSchedulable', () => {
  it('includes tasks due today or tomorrow', () => {
    const today = t({ name: 'Meds', deadline: '2026-07-05T10:00' })
    const tomorrow = t({ name: 'Speedy', deadline: '2026-07-06' })
    const r = selectSchedulable([today, tomorrow], NOW)
    expect(r).toContain(today)
    expect(r).toContain(tomorrow)
  })

  it('includes overdue tasks', () => {
    const overdue = t({ name: 'Old thing', deadline: '2026-06-03T14:00' })
    expect(selectSchedulable([overdue], NOW)).toContain(overdue)
  })

  it('excludes anything due after tomorrow, even P1', () => {
    const dayAfter = t({ name: 'Wash clothes', deadline: '2026-07-07' })
    const farP1 = t({ name: 'Tax return', deadline: '2026-07-15', priority: 1 })
    const r = selectSchedulable([dayAfter, farP1], NOW)
    expect(r).not.toContain(dayAfter)
    expect(r).not.toContain(farP1)
  })

  it('includes undated tasks (scheduling gives them times)', () => {
    const undated = t({ name: 'Read a book', deadline: null })
    expect(selectSchedulable([undated], NOW)).toContain(undated)
  })

  it('excludes completed tasks', () => {
    const done = t({ name: 'Done thing', deadline: '2026-07-05T10:00', done: true })
    expect(selectSchedulable([done], NOW)).not.toContain(done)
  })
})

// ─── orderByEnergy ───────────────────────────────────────────────────────────
// Priority first; within a priority, harder tasks earlier (fresh brain first).

describe('orderByEnergy', () => {
  it('orders by priority, then difficulty descending', () => {
    const easyP1 = t({ name: 'easy-p1', priority: 1, difficulty: 1 })
    const hardP1 = t({ name: 'hard-p1', priority: 1, difficulty: 5 })
    const hardP3 = t({ name: 'hard-p3', priority: 3, difficulty: 5 })
    const result = orderByEnergy([hardP3, easyP1, hardP1])
    expect(result.map(x => x.name)).toEqual(['hard-p1', 'easy-p1', 'hard-p3'])
  })

  it('does not mutate the input array', () => {
    const input = [t({ priority: 3 }), t({ priority: 1 })]
    const copy = [...input]
    orderByEnergy(input)
    expect(input).toEqual(copy)
  })
})

// ─── working hours ───────────────────────────────────────────────────────────

describe('working hours window', () => {
  it('starts at 08:00 and ends at 23:00', () => {
    expect(WORK_START_MIN).toBe(8 * 60)
    expect(WORK_END_MIN).toBe(23 * 60)
  })
})
