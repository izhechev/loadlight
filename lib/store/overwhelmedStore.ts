import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { saveStateSnapshot, logOverwhelmEvent } from '@/lib/data/tasks'

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

// Calibrated for high-volume task managers: 30 tasks/day is normal.
// "overwhelmed" should only trigger from real signals (urgent deadlines, explicit button)
// — not just from having a large backlog.
const THRESHOLDS = { elevated: 0.62, overwhelmed: 0.85 }

function clamp(val: number, min = 0, max = 1): number {
  return Math.min(Math.max(val, min), max)
}

function computeSignals(data: TaskSignalData, selfReportCount: number): Signals {
  // 1. Task accumulation
  // 200 undone = saturated (30/day × ~1 week backlog)
  const countScore = data.undoneCount / 200
  // 100 hours of undone work = saturated
  const timeScore = data.totalUndoneMinutes / 6000
  // 500 difficulty pts = saturated (200 tasks × avg 2.5)
  const diffScore = data.totalUndoneDifficulty / 500
  const taskAccumulation = clamp(Math.max(diffScore, timeScore, countScore))

  // 2. Demand concentration (needs 15+ tasks, kicks in only at 70%+ dominance)
  const totalTasks = Object.values(data.demandTypeCounts).reduce((a, b) => a + b, 0)
  let demandConcentration = 0
  if (totalTasks >= 15) {
    const maxCount = Math.max(...Object.values(data.demandTypeCounts))
    const dominantPct = maxCount / totalTasks
    // < 70% = 0, > 90% = 1.0 — only extreme concentration matters
    demandConcentration = clamp((dominantPct - 0.7) / 0.2)
  }

  // 3. Completion velocity — broken for recurring-heavy users (recurring tasks are always
  // "added" but rarely "done"). Requires 50+ added to kick in; capped at 0.6 max so it
  // can never saturate the score on its own.
  let completionVelocity = 0
  if (data.addedLast7Days >= 50) {
    completionVelocity = clamp(1 - data.completedLast7Days / data.addedLast7Days) * 0.6
  }

  // 4. Temporal pressure: urgent deadlines are a real overload signal
  const temporalPressure = data.tasksWithDeadlines > 0
    ? clamp(data.tasksDueWithin48h / data.tasksWithDeadlines)
    : 0

  // 5. Explicit self-report: user knows best — each press counts
  const explicitSelfReport = clamp(selfReportCount / 5)

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
        // Auto-detection caps at 'elevated' — only the user can trigger 'overwhelmed' via the button
        const rawTarget = deriveStateFromScore(composite)
        const targetState: OverwhelmedState = rawTarget === 'overwhelmed' ? 'elevated' : rawTarget

        // Increase only if last 2 scores both exceed threshold (rolling window protection)
        let nextState: OverwhelmedState = state === 'overwhelmed' ? 'overwhelmed' : state // never auto-clear overwhelmed
        if (STATE_RANK[targetState] > STATE_RANK[nextState]) {
          const recentScores = newHistory.slice(-2)
          const sustained = recentScores.length >= 2 && recentScores.every(s => s >= THRESHOLDS.elevated)
          if (sustained) nextState = targetState
        } else if (state !== 'overwhelmed') {
          // Allow immediate decrease but don't auto-clear overwhelmed
          nextState = targetState
        }

        set({
          signals,
          compositeScore: composite,
          scoreHistory: newHistory,
          lastComputed: Date.now(),
          state: nextState,
        })

        // Fire-and-forget persistence
        saveStateSnapshot({
          compositeScore:      composite,
          taskAccumulation:    signals.taskAccumulation,
          demandConcentration: signals.demandConcentration,
          completionVelocity:  signals.completionVelocity,
          temporalPressure:    signals.temporalPressure,
          selfReport:          signals.explicitSelfReport,
          state:               nextState,
        }).catch(() => {})

        if (nextState !== state) {
          logOverwhelmEvent('composite', state, nextState).catch(() => {})
        }
      },

      triggerOverwhelmedButton() {
        const { state } = get()
        set(s => ({
          selfReportCount: s.selfReportCount + 1,
          state: 'overwhelmed',
          signals: {
            ...s.signals,
            explicitSelfReport: clamp((s.selfReportCount + 1) / 8),
          },
        }))
        if (state !== 'overwhelmed') {
          logOverwhelmEvent('button', state, 'overwhelmed').catch(() => {})
        }
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
