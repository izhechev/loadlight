import { describe, it, expect } from 'vitest'
import {
  toughDayThreshold, dayLoadMinutes, isToughDay, countRecentToughDays, buildToughDayResult,
} from './toughDays'

describe('toughDayThreshold', () => {
  it('scales with balance mode', () => {
    expect(toughDayThreshold('chill')).toBe(120)
    expect(toughDayThreshold('average')).toBe(240)
    expect(toughDayThreshold('beast')).toBe(360)
  })
  it('defaults unknown modes to the average threshold', () => {
    expect(toughDayThreshold('whatever')).toBe(240)
  })
})

describe('dayLoadMinutes', () => {
  it('sums estimated minutes of active tasks, defaulting missing to 30', () => {
    const load = dayLoadMinutes([
      { id: 'a', name: 'x', estimated_minutes: 90 },
      { id: 'b', name: 'y', estimated_minutes: null },
      { id: 'c', name: 'z', estimated_minutes: 60, done: true },
    ])
    expect(load).toBe(120) // 90 + 30, done excluded
  })
})

describe('isToughDay', () => {
  it('is true when load meets the threshold', () => {
    expect(isToughDay(240, 'average')).toBe(true)
    expect(isToughDay(239, 'average')).toBe(false)
  })
})

describe('countRecentToughDays', () => {
  it('counts consecutive tough days ending at the most recent entry', () => {
    const history = [
      { date: '2026-06-21', minutes: 60 },
      { date: '2026-06-22', minutes: 300 },
      { date: '2026-06-23', minutes: 260 },
      { date: '2026-06-24', minutes: 250 },
    ]
    expect(countRecentToughDays(history, 'average')).toBe(3)
  })
  it('is 0 when the latest day is not tough', () => {
    expect(countRecentToughDays([{ date: '2026-06-24', minutes: 100 }], 'average')).toBe(0)
  })
})

describe('buildToughDayResult', () => {
  it('suggests the heaviest droppable tasks, excluding health and P1', () => {
    const r = buildToughDayResult([
      { id: 'a', name: 'Take vitamins', priority: 3, estimated_minutes: 120 },
      { id: 'b', name: 'File taxes', priority: 1, estimated_minutes: 120 },
      { id: 'c', name: 'Deep clean garage', priority: 3, estimated_minutes: 90 },
      { id: 'd', name: 'Sort photos', priority: 3, estimated_minutes: 40 },
    ], 'average', 2)
    expect(r.verdict).toBe('too_much')
    expect(r.remove.map(x => x.id)).toEqual(['c', 'd']) // heaviest non-health, non-P1, max 3
    expect(r.add).toEqual([])
    expect(r.reason).toContain('2')
  })
})
