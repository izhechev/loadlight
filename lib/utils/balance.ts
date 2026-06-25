import type { Task } from '@/lib/data/tasks'

export type BalanceVerdict = 'too_much' | 'ok' | 'too_little'
export interface RemoveItem { id: string; name: string; reason: string }
export interface AddItem { name: string; category: string; reason: string }
export interface BalanceResult {
  verdict: BalanceVerdict
  headline: string
  reason: string
  remove: RemoveItem[]
  add: AddItem[]
}

export type TaskInsert = Omit<Task, 'id' | 'createdAt'>

/** Whether the dashboard should ask the AI for a balance check at all. */
export function shouldRequestBalanceCheck(state: string, activeTaskCount: number): boolean {
  if (state === 'overwhelmed') return false
  if (activeTaskCount <= 0) return false
  return true
}

/** Map an AI "add" suggestion into a real task insert with safe defaults. */
export function addSuggestionToTask(item: { name: string; category: string }): TaskInsert {
  return {
    name: item.name,
    category: item.category || 'Personal',
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
  }
}
