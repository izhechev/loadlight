import { expect, it } from 'vitest'
import type { Task } from '@/lib/data/tasks'
import { estimateFromHistory } from './taskEstimates'

const draft = { name: 'Debug checkout', category: 'Work', demand_type: 'cognitive' }
const recorded = (minutes: number, name = draft.name, status: Task['status'] = 'completed'): Task => ({
  id: String(minutes), name, category: draft.category, demandType: draft.demand_type,
  lifeDomain: 'work', difficulty: 3, priority: 2, notes: '', status, recurring: 'none', actualMinutes: minutes,
})

it('uses the median of completed matches and ignores work in progress', () => {
  expect(estimateFromHistory(draft, [recorded(20), recorded(35), recorded(70), recorded(99, draft.name, 'active')])).toBe(35)
  expect(estimateFromHistory(draft, [recorded(20)])).toBeNull()
})

it('uses similar tasks only when enough share the category and effort type', () => {
  const history = [recorded(15, 'Review coding changes'), recorded(35, 'Research tests'), recorded(50, 'Write tests')]
  expect(estimateFromHistory(draft, history)).toBe(35)
  expect(estimateFromHistory({ ...draft, demand_type: 'physical' }, history)).toBeNull()
})
