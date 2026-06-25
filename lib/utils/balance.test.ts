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
  it('maps a suggestion to a sane default task insert', () => {
    const t = addSuggestionToTask({ name: 'Read a book', category: 'Personal' })
    expect(t).toMatchObject({
      name: 'Read a book',
      category: 'Personal',
      lifeDomain: 'personal',
      demandType: 'routine',
      difficulty: 2,
      priority: 3,
      deadline: null,
      startDate: null,
      estimatedMinutes: 30,
      notes: '',
      status: 'active',
      recurring: 'none',
      recurringHours: null,
    })
  })
})
