import { describe, it, expect } from 'vitest'
import { shouldRequestBalanceCheck, addSuggestionToTask } from './balance'

describe('shouldRequestBalanceCheck', () => {
  it('is false when overwhelmed', () => {
    expect(shouldRequestBalanceCheck('overwhelmed', 5)).toBe(false)
  })
  it('is false when there are no active tasks', () => {
    expect(shouldRequestBalanceCheck('normal', 0)).toBe(false)
  })
  it('is true for normal state with active tasks', () => {
    expect(shouldRequestBalanceCheck('normal', 3)).toBe(true)
  })
  it('is true for elevated state with active tasks', () => {
    expect(shouldRequestBalanceCheck('elevated', 2)).toBe(true)
  })
})

describe('addSuggestionToTask', () => {
  const today = new Date().toISOString().split('T')[0]

  it('maps a suggestion to a sane default task insert', () => {
    const t = addSuggestionToTask({ name: 'Read a book', category: 'Personal' })
    expect(t).toMatchObject({
      name: 'Read a book',
      category: 'Personal',
      lifeDomain: 'personal',
      demandType: 'routine',
      difficulty: 2,
      priority: 3,
      startDate: null,
      estimatedMinutes: 30,
      notes: '',
      status: 'active',
      recurring: 'none',
      recurringHours: null,
    })
  })

  it('sets the deadline to today (date-only) — suggestions are for today', () => {
    expect(addSuggestionToTask({ name: 'Go for a walk', category: 'Exercise' }).deadline).toBe(today)
    expect(addSuggestionToTask({ name: 'Read a book', category: 'Personal' }).deadline).toBe(today)
  })

  it('infers demand type from the category', () => {
    expect(addSuggestionToTask({ name: 'Go for a walk', category: 'Exercise' }).demandType).toBe('physical')
    expect(addSuggestionToTask({ name: 'One focused work block', category: 'Work' }).demandType).toBe('cognitive')
    expect(addSuggestionToTask({ name: 'Draw something', category: 'Creative' }).demandType).toBe('creative')
    expect(addSuggestionToTask({ name: 'Read a book', category: 'Personal' }).demandType).toBe('routine')
  })
})
