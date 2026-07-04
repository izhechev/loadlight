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
// Which tasks belong in TODAY's plan: due within 48h, high-priority within a
// week, or undated. Far-future tasks stay out of the day plan.

describe('selectSchedulable', () => {
  it('includes tasks due today or within 48 hours', () => {
    const due = t({ name: 'Meds', deadline: '2026-07-05T10:00' })
    expect(selectSchedulable([due], NOW)).toContain(due)
  })

  it('excludes tasks due weeks away', () => {
    const far = t({ name: 'Photo session', deadline: '2026-07-23' })
    expect(selectSchedulable([far], NOW)).not.toContain(far)
  })

  it('includes P1 tasks due within a week', () => {
    const p1 = t({ name: 'Tax return', deadline: '2026-07-10', priority: 1 })
    expect(selectSchedulable([p1], NOW)).toContain(p1)
  })

  it('excludes P1 tasks due beyond a week', () => {
    const farP1 = t({ name: 'New debit card', deadline: '2026-07-23', priority: 1 })
    expect(selectSchedulable([farP1], NOW)).not.toContain(farP1)
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
