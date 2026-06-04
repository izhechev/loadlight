import type { OverwhelmedState } from '@/lib/store/overwhelmedStore'

export interface DailyScore {
  date: string   // "YYYY-MM-DD"
  score: number  // composite score for that day
}

function clamp(val: number, min = 0, max = 1): number {
  return Math.min(Math.max(val, min), max)
}

/**
 * Task accumulation: undoneCount relative to the user's personal 14-day avg.
 * Falls back to dividing by 5 when no history exists (avg = 0).
 */
export function computeTaskAccumulation(undoneCount: number, rolling14dayAvg: number): number {
  const baseline = rolling14dayAvg > 0 ? rolling14dayAvg : 5
  return clamp(undoneCount / baseline)
}

/**
 * Demand concentration: fraction of active tasks dominated by a single type.
 * No minimum task count required.
 */
export function computeDemandConcentration(
  demandTypeCounts: Record<string, number>,
  totalActiveTasks: number,
): number {
  if (totalActiveTasks === 0) return 0
  const maxCount = Math.max(...Object.values(demandTypeCounts))
  return clamp(maxCount / totalActiveTasks)
}

/**
 * Completion velocity: fraction of added tasks that were NOT completed.
 * Clamped 0–1, no task-count minimum.
 */
export function computeCompletionVelocity(addedLast7Days: number, completedLast7Days: number): number {
  return clamp((addedLast7Days - completedLast7Days) / Math.max(addedLast7Days, 1))
}

/**
 * Temporal pressure: fraction of active tasks due within 48 h.
 */
export function computeTemporalPressure(tasksDueWithin48h: number, totalActiveTasks: number): number {
  if (totalActiveTasks === 0) return 0
  return clamp(tasksDueWithin48h / totalActiveTasks)
}

// Spec thresholds (from LoadLight_context.md)
const THRESHOLD_ELEVATED    = 0.45
const THRESHOLD_OVERWHELMED = 0.70

/**
 * Average the scores of the last 3 days (or fewer if less history exists).
 * This is the 3-day rolling average used for all state transitions.
 */
export function computeThreeDayAverage(scores: number[]): number {
  if (scores.length === 0) return 0
  const recent = scores.slice(-3)
  return recent.reduce((sum, s) => sum + s, 0) / recent.length
}

/**
 * Derive the target state purely from the 3-day average score.
 * Spec: >= 0.45 → elevated, >= 0.70 → overwhelmed, else normal.
 */
export function deriveStateFromAverage(avg: number): OverwhelmedState {
  if (avg >= THRESHOLD_OVERWHELMED) return 'overwhelmed'
  if (avg >= THRESHOLD_ELEVATED)    return 'elevated'
  return 'normal'
}

/**
 * Upsert today's score into the daily history, keeping at most 3 entries.
 * If the date already exists its score is updated in place.
 * Oldest entries beyond 3 are dropped.
 */
export function mergeDailyScore(
  history: DailyScore[],
  date: string,
  score: number,
): DailyScore[] {
  const existing = history.findIndex(e => e.date === date)
  let updated: DailyScore[]

  if (existing >= 0) {
    updated = history.map((e, i) => i === existing ? { date, score } : e)
  } else {
    updated = [...history, { date, score }]
  }

  return updated.slice(-3)
}

/**
 * Apply the spec transition rules to produce the next state.
 *
 * Rules:
 *   Normal    → Elevated:    avg >= 0.45
 *   Elevated  → Overwhelmed: avg >= 0.70
 *   Normal    → Overwhelmed: avg >= 0.70  (single-step allowed)
 *   Elevated  → Normal:      avg < 0.45   (automatic)
 *   Overwhelmed → *:         never auto-cleared — requires exitRestMode
 */
export function deriveNextState(
  current: OverwhelmedState,
  avg: number,
): OverwhelmedState {
  // Overwhelmed is sticky — only the user can exit it
  if (current === 'overwhelmed') return 'overwhelmed'
  return deriveStateFromAverage(avg)
}
