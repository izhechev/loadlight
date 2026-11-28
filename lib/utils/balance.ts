import type { Task } from '@/lib/data/tasks'
import { dayKey } from './workload'

export type BalanceVerdict = 'too_much' | 'ok' | 'too_little'
export interface RemoveItem { id: string; name: string; reason: string }
export interface AddItem { name: string; category: string; reason: string; estimatedMinutes?: number }
export interface BalanceResult {
  verdict: BalanceVerdict
  headline: string
  reason: string
  remove: RemoveItem[]
  add: AddItem[]
  source?: 'gemini' | 'rules'
}

export type TaskInsert = Omit<Task, 'id' | 'createdAt'>

/** Whether the dashboard should ask the AI for a balance check at all. */
export function shouldRequestBalanceCheck(state: string, activeTaskCount: number): boolean {
  if (state === 'overwhelmed') return false
  if (activeTaskCount <= 0) return false
  return true
}

/** Demand type implied by a suggestion's category. */
function demandTypeFor(category: string): string {
  if (/exercise|sport|fitness|gym/i.test(category)) return 'physical'
  if (/work|study|admin/i.test(category)) return 'cognitive'
  if (/creative/i.test(category)) return 'creative'
  return 'routine'
}

/** Map an AI "add" suggestion into a real task insert with safe defaults. */
export function addSuggestionToTask(item: Pick<AddItem, 'name' | 'category' | 'estimatedMinutes'>, now = new Date()): TaskInsert {
  return {
    name: item.name,
    category: item.category || 'Personal',
    lifeDomain: 'personal',
    demandType: demandTypeFor(item.category ?? ''),
    difficulty: 2,
    priority: 3,
    // Suggestions are for today — a concrete date, no invented clock time
    deadline: null,
    startDate: dayKey(now),
    estimatedMinutes: item.estimatedMinutes ?? 30,
    notes: '',
    status: 'active',
    recurring: 'none',
    recurringHours: null,
  }
}
