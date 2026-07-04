import { describe, it, expect } from 'vitest'
import { findDuplicateGroups } from './duplicates'

const t = (id: string, name: string, over: Partial<{ category: string; deadline: string | null; done: boolean; recurring: string; createdAt: string }> = {}) => ({
  id,
  name,
  category: over.category ?? 'Personal',
  deadline: over.deadline ?? null,
  done: over.done ?? false,
  recurring: over.recurring ?? 'none',
  createdAt: over.createdAt ?? '2026-07-01T10:00:00Z',
})

describe('findDuplicateGroups', () => {
  it('groups same-name same-time copies, ignoring case and stray punctuation', () => {
    const groups = findDuplicateGroups([
      t('a', 'Take Lamictal', { deadline: '2026-07-05T10:30' }),
      t('b', 'take lamictal .', { deadline: '2026-07-05T10:30' }),
      t('c', 'Take Lamictal 10:30', { deadline: '2026-07-05T10:30' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].tasks).toHaveLength(3)
  })

  it('does NOT merge different dose times (10:30 vs 22:30 are separate)', () => {
    const groups = findDuplicateGroups([
      t('a', 'Take Lamictal', { deadline: '2026-07-05T10:30' }),
      t('b', 'Take Lamictal', { deadline: '2026-07-05T10:30' }),
      t('c', 'Take Lamictal', { deadline: '2026-07-05T22:30' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].tasks.map(x => x.id).sort()).toEqual(['a', 'b'])
  })

  it('keeps the task with the most information (recurring beats none)', () => {
    const groups = findDuplicateGroups([
      t('plain', 'Bath', { deadline: '2026-07-05T09:00' }),
      t('recurring', 'Bath', { deadline: '2026-07-05T09:00', recurring: 'daily' }),
    ])
    expect(groups[0].keep.id).toBe('recurring')
    expect(groups[0].duplicates.map(x => x.id)).toEqual(['plain'])
  })

  it('ignores completed tasks and different categories', () => {
    const groups = findDuplicateGroups([
      t('a', 'Bath', { done: true }),
      t('b', 'Bath', { done: true }),
      t('c', 'Report', { category: 'Work' }),
      t('d', 'Report', { category: 'Study' }),
    ])
    expect(groups).toHaveLength(0)
  })

  it('returns empty for a clean list', () => {
    expect(findDuplicateGroups([t('a', 'Bath'), t('b', 'Shave')])).toHaveLength(0)
  })
})
