import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type OverwhelmedState = 'normal' | 'elevated' | 'overwhelmed'
export type DemandType = 'cognitive' | 'emotional' | 'creative' | 'routine' | 'physical'

export interface TaskSignalData {
  undoneCount: number
  doneCount: number
  addedLast7Days: number
  completedLast7Days: number
  tasksWithDeadlines: number
  tasksDueWithin48h: number
  demandTypeCounts: Record<DemandType, number>
  totalUndoneDifficulty: number
  totalUndoneMinutes: number
}

interface Signals {
  taskAccumulation: number
  demandConcentration: number
  completionVelocity: number
  temporalPressure: number
  explicitSelfReport: number
}

interface OverwhelmedStore {
  state: OverwhelmedState
  selfReportCount: number
  scoreHistory: number[]
  lastComputed: number
  signals: Signals
  compositeScore: number
  computeAndTransition: (data: TaskSignalData) => void
  triggerOverwhelmedButton: () => void
  exitRestMode: () => void
  reset: () => void
}

const WEIGHTS = {
  taskAccumulation: 0.30, // Increased weight since it's smarter now
  demandConcentration: 0.15,
  completionVelocity: 0.25,
  temporalPressure: 0.15,
  explicitSelfReport: 0.15,
}

const THRESHOLDS = { elevated: 0.45, overwhelmed: 0.70 }

function clamp(val: number, min = 0, max = 1): number {
  return Math.min(Math.max(val, min), max)
}

function computeSignals(data: TaskSignalData, selfReportCount: number): Signals {
  // 1. Task accumulation: Smart calculation based on volume, difficulty, and time
  const diffScore = data.totalUndoneDifficulty / 30; // 30+ difficulty points is heavy (e.g. 10 hard tasks)
  const timeScore = data.totalUndoneMinutes / 480; // 480 mins (8 hours) of active work is heavy
  const countScore = data.undoneCount / 15; // 15+ active tasks is heavy
  
  // Use the highest metric so we catch overwhelming loads of *any* type (many small tasks vs few huge ones)
  const taskAccumulation = clamp(Math.max(diffScore, timeScore, countScore))

  // 2. Demand concentration: dominant type % of total tasks (min 6 tasks to avoid false positives)
  const totalTasks = Object.values(data.demandTypeCounts).reduce((a, b) => a + b, 0)
  let demandConcentration = 0
  if (totalTasks >= 6) {
    const maxCount = Math.max(...Object.values(data.demandTypeCounts))
    const dominantPct = maxCount / totalTasks
    // < 30% = 0.0, > 60% = 1.0, linear between
    demandConcentration = clamp((dominantPct - 0.3) / 0.3)
  }

  // 3. Completion velocity: 1 - (completed/added). Requires 6+ tasks added to matter.
  let completionVelocity = 0
  if (data.addedLast7Days >= 6) {
    completionVelocity = clamp(1 - data.completedLast7Days / data.addedLast7Days)
  }

  // 4. Temporal pressure: % of deadline tasks due within 48h
  const temporalPressure = data.tasksWithDeadlines > 0
    ? clamp(data.tasksDueWithin48h / data.tasksWithDeadlines)
    : 0

  // 5. Explicit self-report: presses this session / 8
  const explicitSelfReport = clamp(selfReportCount / 8)

  return { taskAccumulation, demandConcentration, completionVelocity, temporalPressure, explicitSelfReport }
}

function deriveStateFromScore(score: number): OverwhelmedState {
  if (score >= THRESHOLDS.overwhelmed) return 'overwhelmed'
  if (score >= THRESHOLDS.elevated) return 'elevated'
  return 'normal'
}

const STATE_RANK: Record<OverwhelmedState, number> = { normal: 0, elevated: 1, overwhelmed: 2 }

export const useOverwhelmedStore = create<OverwhelmedStore>()(
  persist(
    (set, get) => ({
      state: 'normal',
      selfReportCount: 0,
      scoreHistory: [],
      lastComputed: 0,
      signals: {
        taskAccumulation: 0,
        demandConcentration: 0,
        completionVelocity: 0,
        temporalPressure: 0,
        explicitSelfReport: 0,
      },
      compositeScore: 0,

      computeAndTransition(data: TaskSignalData) {
        const { selfReportCount, scoreHistory, state } = get()
        const signals = computeSignals(data, selfReportCount)

        const composite =
          signals.taskAccumulation * WEIGHTS.taskAccumulation +
          signals.demandConcentration * WEIGHTS.demandConcentration +
          signals.completionVelocity * WEIGHTS.completionVelocity +
          signals.temporalPressure * WEIGHTS.temporalPressure +
          signals.explicitSelfReport * WEIGHTS.explicitSelfReport

        const newHistory = [...scoreHistory, composite].slice(-3)
        const targetState = deriveStateFromScore(composite)

        // Increase only if last 2 scores both exceed threshold (3-day rolling window protection)
        let nextState = state
        if (STATE_RANK[targetState] > STATE_RANK[state]) {
          const recentScores = newHistory.slice(-2)
          const threshold = targetState === 'overwhelmed' ? THRESHOLDS.overwhelmed : THRESHOLDS.elevated
          const sustained = recentScores.length >= 2 && recentScores.every(s => s >= threshold)
          if (sustained) nextState = targetState
        } else {
          // Always allow immediate decrease
          nextState = targetState
        }

        set({
          signals,
          compositeScore: composite,
          scoreHistory: newHistory,
          lastComputed: Date.now(),
          state: nextState,
        })
      },

      triggerOverwhelmedButton() {
        set(s => ({
          selfReportCount: s.selfReportCount + 1,
          state: 'overwhelmed',
          signals: {
            ...s.signals,
            explicitSelfReport: clamp((s.selfReportCount + 1) / 8),
          },
        }))
      },

      exitRestMode() {
        set({ state: 'normal' })
      },

      reset() {
        set({
          state: 'normal',
          selfReportCount: 0,
          scoreHistory: [],
          lastComputed: 0,
          compositeScore: 0,
          signals: {
            taskAccumulation: 0,
            demandConcentration: 0,
            completionVelocity: 0,
            temporalPressure: 0,
            explicitSelfReport: 0,
          },
        })
      },
    }),
    { name: 'loadlight-overwhelmed' }
  )
)
