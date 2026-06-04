import { describe, it, expect } from 'vitest'
import {
  computeThreeDayAverage,
  deriveStateFromAverage,
  mergeDailyScore,
  deriveNextState,
  computeTaskAccumulation,
  computeDemandConcentration,
  computeCompletionVelocity,
  computeTemporalPressure,
} from './stateMachine'
import type { DailyScore } from './stateMachine'

// ─── computeThreeDayAverage ────────────────────────────────────────────────

describe('computeThreeDayAverage', () => {
  it('returns the score itself when only one day exists', () => {
    expect(computeThreeDayAverage([0.5])).toBeCloseTo(0.5)
  })

  it('averages two days', () => {
    expect(computeThreeDayAverage([0.4, 0.6])).toBeCloseTo(0.5)
  })

  it('averages three days', () => {
    expect(computeThreeDayAverage([0.3, 0.5, 0.7])).toBeCloseTo(0.5)
  })

  it('uses only the last three when more than three days are given', () => {
    // first entry should be ignored
    expect(computeThreeDayAverage([0.9, 0.2, 0.2, 0.2])).toBeCloseTo(0.2)
  })

  it('returns 0 for empty history', () => {
    expect(computeThreeDayAverage([])).toBe(0)
  })
})

// ─── deriveStateFromAverage ────────────────────────────────────────────────
// Spec thresholds: >= 0.45 → elevated, >= 0.70 → overwhelmed

describe('deriveStateFromAverage', () => {
  it('returns normal when average is below 0.45', () => {
    expect(deriveStateFromAverage(0.44)).toBe('normal')
    expect(deriveStateFromAverage(0)).toBe('normal')
  })

  it('returns elevated when average is exactly 0.45', () => {
    expect(deriveStateFromAverage(0.45)).toBe('elevated')
  })

  it('returns elevated when average is between 0.45 and 0.70', () => {
    expect(deriveStateFromAverage(0.60)).toBe('elevated')
    expect(deriveStateFromAverage(0.69)).toBe('elevated')
  })

  it('returns overwhelmed when average is exactly 0.70', () => {
    expect(deriveStateFromAverage(0.70)).toBe('overwhelmed')
  })

  it('returns overwhelmed when average exceeds 0.70', () => {
    expect(deriveStateFromAverage(0.85)).toBe('overwhelmed')
    expect(deriveStateFromAverage(1.0)).toBe('overwhelmed')
  })
})

// ─── mergeDailyScore ───────────────────────────────────────────────────────

describe('mergeDailyScore', () => {
  it('adds a new entry when the date does not exist', () => {
    const result = mergeDailyScore([], '2026-04-17', 0.5)
    expect(result).toEqual([{ date: '2026-04-17', score: 0.5 }])
  })

  it('updates the existing entry when the same date is given', () => {
    const history: DailyScore[] = [{ date: '2026-04-17', score: 0.3 }]
    const result = mergeDailyScore(history, '2026-04-17', 0.7)
    expect(result).toEqual([{ date: '2026-04-17', score: 0.7 }])
  })

  it('keeps at most 3 entries, dropping the oldest', () => {
    const history: DailyScore[] = [
      { date: '2026-04-14', score: 0.1 },
      { date: '2026-04-15', score: 0.2 },
      { date: '2026-04-16', score: 0.3 },
    ]
    const result = mergeDailyScore(history, '2026-04-17', 0.4)
    expect(result).toHaveLength(3)
    expect(result[0].date).toBe('2026-04-15')
    expect(result[2].date).toBe('2026-04-17')
  })

  it('does not duplicate an entry when updating an existing date', () => {
    const history: DailyScore[] = [
      { date: '2026-04-15', score: 0.2 },
      { date: '2026-04-16', score: 0.3 },
    ]
    const result = mergeDailyScore(history, '2026-04-16', 0.5)
    expect(result).toHaveLength(2)
    expect(result[1].score).toBe(0.5)
  })
})

// ─── deriveNextState ───────────────────────────────────────────────────────
// Spec transition rules:
//   Normal    → Elevated:      avg >= 0.45
//   Elevated  → Overwhelmed:   avg >= 0.70
//   Elevated  → Normal:        avg < 0.45 (automatic)
//   Overwhelmed → *:           only via exitRestMode (never auto-cleared here)
//   Button press:              handled separately, not tested here

describe('deriveNextState', () => {
  it('stays normal when average is below threshold', () => {
    expect(deriveNextState('normal', 0.3)).toBe('normal')
  })

  it('transitions normal → elevated when average reaches 0.45', () => {
    expect(deriveNextState('normal', 0.45)).toBe('elevated')
  })

  it('transitions elevated → overwhelmed when average reaches 0.70', () => {
    expect(deriveNextState('elevated', 0.70)).toBe('overwhelmed')
  })

  it('transitions elevated → normal automatically when average drops below 0.45', () => {
    expect(deriveNextState('elevated', 0.44)).toBe('normal')
  })

  it('does NOT auto-clear overwhelmed state (requires user action)', () => {
    expect(deriveNextState('overwhelmed', 0.1)).toBe('overwhelmed')
    expect(deriveNextState('overwhelmed', 0.44)).toBe('overwhelmed')
    expect(deriveNextState('overwhelmed', 0.69)).toBe('overwhelmed')
  })

  it('transitions normal → overwhelmed in one step when average is >= 0.70', () => {
    expect(deriveNextState('normal', 0.70)).toBe('overwhelmed')
  })
})

// ─── computeTaskAccumulation ───────────────────────────────────────────────
// Spec: undoneCount / rolling14dayAvg (cap 1.0). If avg = 0, use count / 5.

describe('computeTaskAccumulation', () => {
  it('returns ratio of undoneCount to rolling14dayAvg', () => {
    expect(computeTaskAccumulation(10, 20)).toBeCloseTo(0.5)
  })

  it('caps at 1.0 when undone exceeds the baseline', () => {
    expect(computeTaskAccumulation(30, 10)).toBe(1.0)
  })

  it('falls back to count/5 when avg is 0 (no history)', () => {
    expect(computeTaskAccumulation(5, 0)).toBeCloseTo(1.0)
    expect(computeTaskAccumulation(2, 0)).toBeCloseTo(0.4)
  })

  it('returns 0 when undoneCount is 0', () => {
    expect(computeTaskAccumulation(0, 10)).toBe(0)
    expect(computeTaskAccumulation(0, 0)).toBe(0)
  })
})

// ─── computeDemandConcentration ───────────────────────────────────────────
// Spec: max_type_count / total_active_tasks (no minimum threshold)

describe('computeDemandConcentration', () => {
  it('returns max type fraction of total tasks', () => {
    const counts = { cognitive: 8, emotional: 2, creative: 0, routine: 0, physical: 0 }
    expect(computeDemandConcentration(counts, 10)).toBeCloseTo(0.8)
  })

  it('returns 0 when totalActiveTasks is 0', () => {
    const counts = { cognitive: 0, emotional: 0, creative: 0, routine: 0, physical: 0 }
    expect(computeDemandConcentration(counts, 0)).toBe(0)
  })

  it('returns 1.0 when all tasks are the same type', () => {
    const counts = { cognitive: 5, emotional: 0, creative: 0, routine: 0, physical: 0 }
    expect(computeDemandConcentration(counts, 5)).toBe(1.0)
  })

  it('works with fewer than 15 tasks (no minimum required)', () => {
    const counts = { cognitive: 3, emotional: 1, creative: 0, routine: 0, physical: 0 }
    expect(computeDemandConcentration(counts, 4)).toBeCloseTo(0.75)
  })
})

// ─── computeCompletionVelocity ────────────────────────────────────────────
// Spec: (added7d - completed7d) / max(added7d, 1), clamped 0–1

describe('computeCompletionVelocity', () => {
  it('returns 0 when everything added was also completed', () => {
    expect(computeCompletionVelocity(10, 10)).toBe(0)
  })

  it('returns 1.0 when nothing was completed', () => {
    expect(computeCompletionVelocity(10, 0)).toBe(1.0)
  })

  it('returns the backlog fraction when partial completion', () => {
    expect(computeCompletionVelocity(10, 6)).toBeCloseTo(0.4)
  })

  it('returns 0 when nothing was added (avoids division by zero)', () => {
    expect(computeCompletionVelocity(0, 0)).toBe(0)
  })

  it('clamps to 0 when more was completed than added', () => {
    expect(computeCompletionVelocity(5, 10)).toBe(0)
  })

  it('works with small numbers (no 50-task minimum)', () => {
    expect(computeCompletionVelocity(3, 1)).toBeCloseTo(2 / 3)
  })
})

// ─── computeTemporalPressure ─────────────────────────────────────────────
// Spec: tasksDueWithin48h / totalActiveTasks (0 when no tasks)

describe('computeTemporalPressure', () => {
  it('returns the fraction of active tasks due within 48h', () => {
    expect(computeTemporalPressure(3, 10)).toBeCloseTo(0.3)
  })

  it('returns 0 when no active tasks', () => {
    expect(computeTemporalPressure(0, 0)).toBe(0)
  })

  it('returns 1.0 when all active tasks are due within 48h', () => {
    expect(computeTemporalPressure(5, 5)).toBe(1.0)
  })

  it('returns 0 when no tasks are due within 48h', () => {
    expect(computeTemporalPressure(0, 20)).toBe(0)
  })
})
