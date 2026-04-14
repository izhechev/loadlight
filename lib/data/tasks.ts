/**
 * Data access layer — branches on IS_DEMO.
 * When Supabase is not configured, all operations use localStorage.
 * When Supabase is configured, all operations hit the database.
 */

import { createClient } from '@/lib/supabase/client'
import type { OverwhelmedState } from '@/lib/store/overwhelmedStore'

export const IS_DEMO = !process.env.NEXT_PUBLIC_SUPABASE_URL

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface Task {
  id: string
  userId?: string
  name: string
  category: string
  lifeDomain: string
  demandType: string
  difficulty: number
  priority: number
  deadline?: string | null
  startDate?: string | null
  estimatedMinutes?: number | null
  notes: string
  status: 'active' | 'completed' | 'archived'
  recurring: string
  recurringHours?: number | null
  snoozedUntil?: number | null
  createdAt?: string
  completedAt?: string | null
  done?: boolean // client-side alias for status === 'completed'
}

export interface Profile {
  id: string
  balanceMode: 'beast' | 'average' | 'chill'
  modeLockUntil?: string | null
  onboardingComplete: boolean
  createdAt?: string
}

export interface StateSnapshotInsert {
  userId: string
  compositeScore: number
  taskAccumulation: number
  demandConcentration: number
  completionVelocity: number
  temporalPressure: number
  selfReport: number
  state: string
}

export interface OverwhelmEventInsert {
  userId: string
  trigger: 'composite' | 'button'
  previousState: string
  newState: string
}

export interface AiLogInsert {
  userId: string
  callType: 'extraction' | 'advisory' | 'past-deadline'
  model: string
  tokensIn: number
  tokensOut: number
  latencyMs: number
}

// ─────────────────────────────────────────────
// localStorage helpers
// ─────────────────────────────────────────────

function lsGetTasks(): Task[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem('loadlight-tasks') ?? '[]')
  } catch { return [] }
}

function lsSetTasks(tasks: Task[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('loadlight-tasks', JSON.stringify(tasks))
}

function lsGetProfile(): Profile | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('loadlight-user')
    if (!raw) return null
    const u = JSON.parse(raw)
    return {
      id: 'demo',
      balanceMode: u.balanceMode ?? 'average',
      modeLockUntil: u.chillLockUntil ? new Date(u.chillLockUntil).toISOString() : null,
      onboardingComplete: u.onboardingComplete ?? false,
    }
  } catch { return null }
}

function lsSetProfile(updates: Partial<Profile>): void {
  if (typeof window === 'undefined') return
  try {
    const raw = JSON.parse(localStorage.getItem('loadlight-user') ?? '{}')
    if (updates.balanceMode !== undefined) raw.balanceMode = updates.balanceMode
    if (updates.modeLockUntil !== undefined) {
      raw.chillLockUntil = updates.modeLockUntil ? new Date(updates.modeLockUntil).getTime() : null
    }
    if (updates.onboardingComplete !== undefined) raw.onboardingComplete = updates.onboardingComplete
    localStorage.setItem('loadlight-user', JSON.stringify(raw))
  } catch {}
}

// ─────────────────────────────────────────────
// Task CRUD
// ─────────────────────────────────────────────

export async function getTasks(): Promise<Task[]> {
  if (IS_DEMO) return lsGetTasks()

  const supabase = createClient()
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map(dbRowToTask)
}

/** Ensure the profiles row exists for the given user — required before any task insert (FK). */
async function ensureProfile(supabase: ReturnType<typeof createClient>, userId: string): Promise<void> {
  await supabase
    .from('profiles')
    .upsert(
      { id: userId, balance_mode: 'average', onboarding_complete: false },
      { onConflict: 'id', ignoreDuplicates: true },
    )
  // Ignore errors — profile may already exist, FK will succeed either way
}

export async function addTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<Task> {
  if (IS_DEMO) {
    const newTask: Task = {
      ...task,
      id: Math.random().toString(36).slice(2),
      createdAt: new Date().toISOString(),
    }
    lsSetTasks([...lsGetTasks(), newTask])
    return newTask
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await ensureProfile(supabase, user.id)

  const { data, error } = await supabase
    .from('tasks')
    .insert(taskToDbRow({ ...task, userId: user.id }))
    .select()
    .single()

  if (error) throw error
  return dbRowToTask(data)
}

export async function addTasks(tasks: Omit<Task, 'id' | 'createdAt'>[]): Promise<Task[]> {
  if (IS_DEMO) {
    const newTasks = tasks.map(t => ({
      ...t,
      id: Math.random().toString(36).slice(2),
      createdAt: new Date().toISOString(),
    }))
    lsSetTasks([...lsGetTasks(), ...newTasks])
    return newTasks
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await ensureProfile(supabase, user.id)

  const rows = tasks.map(t => taskToDbRow({ ...t, userId: user.id }))
  const { data, error } = await supabase.from('tasks').insert(rows).select()
  if (error) throw error
  return (data ?? []).map(dbRowToTask)
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<void> {
  if (IS_DEMO) {
    const tasks = lsGetTasks()
    lsSetTasks(tasks.map(t => t.id === id ? { ...t, ...updates } : t))
    return
  }

  const supabase = createClient()
  const { error } = await supabase
    .from('tasks')
    .update(taskToDbRow(updates as Task))
    .eq('id', id)

  if (error) throw error
}

export async function deleteTask(id: string): Promise<void> {
  if (IS_DEMO) {
    lsSetTasks(lsGetTasks().filter(t => t.id !== id))
    return
  }

  const supabase = createClient()
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

// ─────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────

export async function getProfile(): Promise<Profile | null> {
  if (IS_DEMO) return lsGetProfile()

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!data) return null
  return {
    id: data.id,
    balanceMode: data.balance_mode as Profile['balanceMode'],
    modeLockUntil: data.mode_locked_until ?? null,
    onboardingComplete: data.onboarding_complete,
    createdAt: data.created_at,
  }
}

export async function upsertProfile(updates: Partial<Profile>): Promise<void> {
  if (IS_DEMO) {
    lsSetProfile(updates)
    return
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const row: Record<string, unknown> = { id: user.id }
  if (updates.balanceMode !== undefined) row.balance_mode = updates.balanceMode
  if (updates.modeLockUntil !== undefined) row.mode_locked_until = updates.modeLockUntil
  if (updates.onboardingComplete !== undefined) row.onboarding_complete = updates.onboardingComplete

  const { error } = await supabase
    .from('profiles')
    .upsert(row, { onConflict: 'id' })

  if (error) throw error
}

// ─────────────────────────────────────────────
// Analytics (fire-and-forget — never throw)
// ─────────────────────────────────────────────

export async function saveStateSnapshot(snapshot: Omit<StateSnapshotInsert, 'userId'>): Promise<void> {
  if (IS_DEMO) return // not persisted in demo mode

  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('state_snapshots').insert({
      user_id: user.id,
      composite_score:      snapshot.compositeScore,
      task_accumulation:    snapshot.taskAccumulation,
      demand_concentration: snapshot.demandConcentration,
      completion_velocity:  snapshot.completionVelocity,
      temporal_pressure:    snapshot.temporalPressure,
      self_report:          snapshot.selfReport,
      state:                snapshot.state,
    })
  } catch {}
}

export async function logOverwhelmEvent(
  trigger: 'composite' | 'button',
  previousState: OverwhelmedState,
  newState: OverwhelmedState,
): Promise<void> {
  if (IS_DEMO) return

  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('overwhelm_events').insert({
      user_id:        user.id,
      trigger,
      previous_state: previousState,
      new_state:      newState,
    })
  } catch {}
}

export async function logAiCall(log: AiLogInsert): Promise<void> {
  if (IS_DEMO) return

  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('ai_logs').insert({
      user_id:    user.id,
      call_type:  log.callType,
      model:      log.model,
      tokens_in:  log.tokensIn,
      tokens_out: log.tokensOut,
      latency_ms: log.latencyMs,
    })
  } catch {}
}

// ─────────────────────────────────────────────
// Row mappers
// ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbRowToTask(row: any): Task {
  return {
    id:               row.id,
    userId:           row.user_id,
    name:             row.name,
    category:         row.category ?? 'Personal',
    lifeDomain:       row.life_domain ?? 'personal',
    demandType:       row.demand_type ?? 'routine',
    difficulty:       row.difficulty ?? 2,
    priority:         row.priority ?? 3,
    deadline:         row.deadline ?? null,
    startDate:        row.start_date ?? null,
    estimatedMinutes: row.estimated_minutes ?? null,
    notes:            row.notes ?? '',
    status:           row.status ?? 'active',
    recurring:        row.recurring ?? 'none',
    recurringHours:   row.recurring_hours ?? null,
    snoozedUntil:     row.snoozed_until ? new Date(row.snoozed_until).getTime() : null,
    createdAt:        row.created_at,
    completedAt:      row.completed_at ?? null,
    done:             row.status === 'completed',
  }
}

// Ensure datetime strings are stored as explicit UTC so Supabase/Postgres
// doesn't reinterpret them through the database session timezone (which may
// not be UTC). We store "naive" local times as UTC — the convention used
// by formatTime (getUTCHours) in the UI.
function toUtcTs(dt: string | null | undefined): string | null | undefined {
  if (dt == null) return dt
  // Already has timezone info → leave as-is
  if (dt.includes('+') || dt.endsWith('Z')) return dt
  // Append Z to mark as UTC
  return dt + 'Z'
}

function taskToDbRow(task: Partial<Task>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (task.userId           !== undefined) row.user_id           = task.userId
  if (task.name             !== undefined) row.name              = task.name
  if (task.category         !== undefined) row.category          = task.category
  if (task.lifeDomain       !== undefined) row.life_domain       = task.lifeDomain
  if (task.demandType       !== undefined) row.demand_type       = task.demandType
  if (task.difficulty       !== undefined) row.difficulty        = task.difficulty
  if (task.priority         !== undefined) row.priority          = task.priority
  if (task.deadline         !== undefined) row.deadline          = toUtcTs(task.deadline)
  if (task.startDate        !== undefined) row.start_date        = toUtcTs(task.startDate)
  if (task.estimatedMinutes !== undefined) row.estimated_minutes = task.estimatedMinutes
  if (task.notes            !== undefined) row.notes             = task.notes
  if (task.status           !== undefined) row.status            = task.status
  if (task.recurring        !== undefined) row.recurring         = task.recurring
  if (task.recurringHours   !== undefined) row.recurring_hours   = task.recurringHours
  if (task.completedAt      !== undefined) row.completed_at      = task.completedAt
  if (task.snoozedUntil     !== undefined) {
    row.snoozed_until = task.snoozedUntil ? new Date(task.snoozedUntil).toISOString() : null
  }
  // done is a client-side alias, don't write it to DB
  if (task.done !== undefined && task.status === undefined) {
    row.status = task.done ? 'completed' : 'active'
    if (task.done) row.completed_at = new Date().toISOString()
  }
  return row
}
