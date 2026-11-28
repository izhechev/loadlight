import type { DemandType } from '@/lib/store/overwhelmedStore'

const titleRules: [RegExp, DemandType, number][] = [
  [/\b(?:difficult conversation|give difficult feedback|resolve (?:a )?(?:conflict|dispute)|apologi[sz]e)\b/i, 'emotional', 4],
  [/\b(?:debug|diagnose|investigate|analyse|analyze|reconcile|research|audit|troubleshoot)\b/i, 'cognitive', 4],
  [/\b(?:design|brainstorm|compose|draft|write)\b/i, 'creative', 3],
  [/\b(?:lift|move furniture|deep clean|workout|run|swim|train)\b/i, 'physical', 3],
  [/\b(?:review|study|prepare|solve|plan)\b/i, 'cognitive', 3],
  [/\b(?:upload|file|water|send|pay|confirm|book|schedule|submit)\b/i, 'routine', 1],
]

export function inferTitleEffort(name: string) {
  const rule = titleRules.find(([pattern]) => pattern.test(name))
  return rule ? { type: rule[1], difficulty: rule[2] } : undefined
}

export function taskEffort(name: string, type?: string, difficulty?: number) {
  const inferred = inferTitleEffort(name)
  const demand = type && type !== 'routine' ? type : inferred?.type ?? 'routine'
  const effort = Math.max(difficulty ?? 2, inferred?.difficulty ?? 1)
  return { demand, points: effort + Number(demand !== 'routine') }
}
