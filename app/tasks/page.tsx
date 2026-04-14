"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { CheckCircle, Circle, Trash2, Calendar, Plus, Filter, RefreshCw, Sparkles, Loader2, List, LayoutGrid, CalendarDays, ChevronLeft, ChevronRight, CalendarClock, Pencil, X } from "lucide-react"
import Link from "next/link"
import { AppLayout } from "@/components/app-layout"
import { useOverwhelmedStore, type DemandType, type TaskSignalData } from "@/lib/store/overwhelmedStore"
import { useCategoryStore, getCategoryClasses } from "@/lib/store/categoryStore"
import { getTasks, updateTask, deleteTask, addTasks, IS_DEMO } from "@/lib/data/tasks"
import { PastDeadlineModal } from "@/components/past-deadline-modal"

interface Task {
  id: string
  name: string
  category: string
  demand_type: DemandType
  difficulty: number
  deadline: string | null    // "YYYY-MM-DDTHH:mm" or legacy "YYYY-MM-DD"
  start_date: string | null  // "YYYY-MM-DDTHH:mm"
  priority: 1 | 2 | 3 | 4
  notes: string
  estimated_minutes: number | null
  done: boolean
  createdAt: number
  recurring?: 'none' | 'daily' | 'weekly'
  recurring_hours?: number | null
  snoozedUntil?: number
}

const DEMAND_COLORS: Record<DemandType, string> = {
  cognitive: 'bg-sky-100/90 text-sky-700',
  emotional: 'bg-pink-100/90 text-pink-700',
  creative: 'bg-purple-100/90 text-purple-700',
  routine: 'bg-blue-100/90 text-blue-700',
  physical: 'bg-teal-100/90 text-teal-700',
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function isDueWithin48h(deadline: string | null, currentTime: number): boolean {
  if (!deadline || currentTime === 0) return false
  const ms = new Date(deadline).getTime() - currentTime
  // Include overdue tasks (ms < 0) and tasks due within 48h
  return ms <= 172800000
}

function difficultyDots(d: number): string {
  return '●'.repeat(d) + '○'.repeat(5 - d)
}

export default function TasksPage() {
  const shouldReduceMotion = useReducedMotion()
  const { state: overwhelmedState, computeAndTransition } = useOverwhelmedStore()
  const { categories } = useCategoryStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('active')
  const [showSnoozed, setShowSnoozed] = useState(false)
  const [view, setView] = useState<'list' | 'board' | 'calendar'>('list')
  const [calMonth, setCalMonth] = useState(() => new Date())
  const [now, setNow] = useState<number>(0)
  const [breakingDownId, setBreakingDownId] = useState<string | null>(null)
  const [scheduleText, setScheduleText]     = useState('')
  const [overflowDate, setOverflowDate]     = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [isScheduling, setIsScheduling]     = useState(false)
  const [scheduleMsg, setScheduleMsg]       = useState<string | null>(null)
  const [showScheduler, setShowScheduler]   = useState(false)
  type ChatMsg = { role: 'assistant' | 'user'; text: string }
  const [chatHistory, setChatHistory]       = useState<ChatMsg[]>([])
  const [chatInput, setChatInput]           = useState('')
  const [chatPhase, setChatPhase]           = useState<'idle' | 'chatting' | 'confirming' | 'done'>('idle')
  const [editingTask, setEditingTask]       = useState<Task | null>(null)
  const [pastDeadlinePending, setPastDeadlinePending] = useState<Task | null>(null)

  type PendingSchedule = {
    scheduled: { id: string; name: string; start_date: string; deadline: string }[]
    overflow:  { id: string; name: string; deadline: string; start_date?: string | null }[]
    message:   string
  }
  const [pendingSchedule, setPendingSchedule] = useState<PendingSchedule | null>(null)

  useEffect(() => {
    const time = Date.now()
    setNow(time)
    getTasks()
      .then(data => setTasks(data.map(t => ({ ...t, category: t.category || t.lifeDomain || 'Personal' })) as unknown as Task[]))
      .catch(() => {
        // Fallback: read localStorage directly
        try {
          const stored = localStorage.getItem('loadlight-tasks')
          if (stored) setTasks((JSON.parse(stored) as any[]).map(t => ({ ...t, category: t.category || t.life_domain || 'Personal' })) as Task[])
        } catch { /* ignore */ }
      })
  }, [])

  const syncAndCompute = useCallback((updated: Task[]) => {
    // Demo mode: keep localStorage in sync for other pages that still read it
    if (IS_DEMO) localStorage.setItem('loadlight-tasks', JSON.stringify(updated))
    const undone = updated.filter(t => !t.done)
    const sevenDaysAgo = (now || Date.now()) - 604800000
    const demandTypeCounts: Record<DemandType, number> = { cognitive: 0, emotional: 0, creative: 0, routine: 0, physical: 0 }
    undone.forEach(t => { demandTypeCounts[t.demand_type]++ })
    computeAndTransition({
      undoneCount: undone.length,
      doneCount: updated.filter(t => t.done).length,
      addedLast7Days: updated.filter(t => t.createdAt > sevenDaysAgo).length,
      completedLast7Days: updated.filter(t => t.done && t.createdAt > sevenDaysAgo).length,
      tasksWithDeadlines: undone.filter(t => t.deadline).length,
      tasksDueWithin48h: undone.filter(t => isDueWithin48h(t.deadline, now || Date.now())).length,
      demandTypeCounts,
      totalUndoneDifficulty: undone.reduce((acc, t) => acc + (t.difficulty || 2), 0),
      totalUndoneMinutes: undone.reduce((acc, t) => acc + (t.estimated_minutes || 30), 0),
    } as TaskSignalData)
  }, [computeAndTransition, now])

  async function breakdownTask(id: string) {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    setBreakingDownId(id)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: task.name, mode: 'breakdown', categories: categories.map(c => c.name) }),
      })
      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      if (data.tasks?.length) {
        const subTasks: Task[] = data.tasks.map((t: any) => ({
          ...t, id: Math.random().toString(36).slice(2), done: false, createdAt: Date.now(), deadline: task.deadline,
        }))
        const updated = tasks.flatMap(t => t.id === id ? subTasks : [t])
        setTasks(updated)
        syncAndCompute(updated)
        deleteTask(id).catch(() => {})
        addTasks(subTasks.map(s => ({ name: s.name, category: s.category, lifeDomain: 'personal', demandType: (s as any).demand_type ?? 'routine', difficulty: s.difficulty ?? 2, priority: s.priority ?? 3, deadline: s.deadline, startDate: null, estimatedMinutes: s.estimated_minutes, notes: s.notes ?? '', status: 'active' as const, recurring: s.recurring ?? 'none', recurringHours: s.recurring_hours ?? null }))).catch(() => {})
      }
    } catch { alert('Failed to break down task.') }
    finally { setBreakingDownId(null) }
  }

  function nowHHMM(): string {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  // Start conversation
  async function handleSchedule() {
    if (tasks.filter(t => !t.done).length === 0) return
    setIsScheduling(true)
    setScheduleMsg(null)
    setPendingSchedule(null)
    setChatHistory([])
    setChatInput('')
    setChatPhase('chatting')
    await sendChat([], scheduleText)
    setIsScheduling(false)
  }

  // User sends a message in the conversation
  async function handleChatSend() {
    if (!chatInput.trim() || isScheduling) return
    const userMsg: ChatMsg = { role: 'user', text: chatInput.trim() }
    const newHistory = [...chatHistory, userMsg]
    setChatHistory(newHistory)
    setChatInput('')
    setIsScheduling(true)
    await sendChat(newHistory, '')
    setIsScheduling(false)
  }

  async function sendChat(history: ChatMsg[], initialText: string) {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'schedule_chat', text: initialText, tasks, currentTime: nowHHMM(), history }),
      })
      const data = await res.json() as { type: 'question' | 'ready'; question?: string; context?: string }
      if (data.type === 'question' && data.question) {
        setChatHistory(h => [...h, { role: 'assistant', text: data.question! }])
      } else {
        // AI is ready — run actual scheduling
        setChatHistory(h => [...h, { role: 'assistant', text: "Got it! Let me build your schedule…" }])
        // Combine original scheduleText with AI context so fixed-time hints (e.g. "lamictal 10:30") are never lost
        const combinedContext = [scheduleText, data.context ?? history.map(m => m.text).join('\n')].filter(Boolean).join('\n')
        await runSchedule(combinedContext)
      }
    } catch {
      setChatHistory(h => [...h, { role: 'assistant', text: "AI is unavailable. Running local schedule…" }])
      localGreedy()
    }
  }

  async function runSchedule(context: string) {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'schedule', text: context, tasks, overflowDate, currentTime: nowHHMM() }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as PendingSchedule
      if (!data.scheduled) throw new Error('Bad response')
      setChatPhase('confirming')
      setPendingSchedule(data)
    } catch {
      // Network/API failed — fall back to local greedy, no spinner
      localGreedy()
    }
  }

  // Pure client-side greedy — never fails, no network call
  function localGreedy() {
    const parseMin = (hhmm: string) => {
      const parts = (hhmm || '').split(':').map(Number)
      const h = isNaN(parts[0]) ? 0 : parts[0]
      const m = isNaN(parts[1]) ? 0 : parts[1]
      return h * 60 + m
    }
    const fmt = (min: number) => `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`
    const now         = parseMin(nowHHMM())
    const endOfDay    = 23 * 60 + 30
    const schedDate   = new Date().toISOString().split('T')[0]
    const nextDate    = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })()

    const undone = tasks.filter(t => !t.done)
      .sort((a, b) => {
        const pa = a.priority ?? 3, pb = b.priority ?? 3
        if (pa !== pb) return pa - pb
        return (a.estimated_minutes ?? 30) - (b.estimated_minutes ?? 30)
      })

    const scheduled: PendingSchedule['scheduled'] = []
    const overflow:  PendingSchedule['overflow']  = []

    // Pinned = has a specific time today (startsWith check handles ISO strings with seconds)
    const isPinned = (t: Task) => {
      if (!t.deadline?.includes('T')) return false
      const [dDate, dTime] = t.deadline.split('T')
      if (dDate !== schedDate) return false
      if (!dTime || dTime.startsWith('09:00')) return false
      return true
    }
    const pinnedTasks = undone.filter(isPinned)
      .sort((a, b) => parseMin(a.deadline!.split('T')[1]) - parseMin(b.deadline!.split('T')[1]))
    const flexTasks = undone.filter(t => !isPinned(t))
      .sort((a, b) => {
        const pa = a.priority ?? 3, pb = b.priority ?? 3
        if (pa !== pb) return pa - pb
        return (a.estimated_minutes ?? 30) - (b.estimated_minutes ?? 30)
      })

    const seenIds = new Set<string>()
    let cursor = now
    let fi = 0

    for (const pinned of pinnedTasks) {
      const pinnedMin = parseMin(pinned.deadline!.split('T')[1])
      const pinnedDur = pinned.estimated_minutes ?? 5
      while (fi < flexTasks.length) {
        const dur = flexTasks[fi].estimated_minutes ?? 30
        if (cursor + dur <= pinnedMin && !seenIds.has(flexTasks[fi].id)) {
          seenIds.add(flexTasks[fi].id)
          scheduled.push({ id: flexTasks[fi].id, name: flexTasks[fi].name, start_date: `${schedDate}T${fmt(cursor)}`, deadline: `${schedDate}T${fmt(cursor + dur)}` })
          cursor += dur
          fi++
        } else break
      }
      if (cursor < pinnedMin) cursor = pinnedMin
      if (!seenIds.has(pinned.id)) {
        seenIds.add(pinned.id)
        scheduled.push({ id: pinned.id, name: pinned.name, start_date: `${schedDate}T${fmt(cursor)}`, deadline: `${schedDate}T${fmt(cursor + pinnedDur)}` })
        cursor += pinnedDur
      }
    }

    while (fi < flexTasks.length) {
      const task = flexTasks[fi]
      fi++
      if (seenIds.has(task.id)) continue
      seenIds.add(task.id)
      const dur = task.estimated_minutes ?? 30
      if (cursor + dur <= endOfDay) {
        scheduled.push({ id: task.id, name: task.name, start_date: `${schedDate}T${fmt(cursor)}`, deadline: `${schedDate}T${fmt(cursor + dur)}` })
        cursor += dur
      } else {
        overflow.push({ id: task.id, name: task.name, deadline: `${nextDate}T09:00`, start_date: null })
      }
    }

    const msg = scheduled.length
      ? `${scheduled.length} task${scheduled.length !== 1 ? 's' : ''} scheduled from ${fmt(now)}. ${overflow.length > 0 ? `${overflow.length} moved to ${nextDate}.` : ''}`
      : `Nothing fits today. All ${overflow.length} tasks moved to ${nextDate}.`

    setChatPhase('confirming')
    setPendingSchedule({ scheduled, overflow, message: msg })
  }

  function applySchedule() {
    if (!pendingSchedule) return
    const todayStr = new Date().toISOString().split('T')[0]
    const updates = new Map<string, Partial<Task>>()
    // Scheduled tasks: set their new start_date and deadline
    pendingSchedule.scheduled.forEach(s => updates.set(s.id, { start_date: s.start_date, deadline: s.deadline }))
    // Overflow tasks: clear start_date, but only change deadline if the task has no deadline
    // or its deadline is already set to today (meaning it was scheduled for today but now moves)
    // Never overwrite deadlines that belong to a different day (e.g. medical reminders)
    pendingSchedule.overflow.forEach(o => {
      const existing = tasks.find(t => t.id === o.id)
      const existingDeadline = existing?.deadline
      const isFixedOnAnotherDay = existingDeadline && !existingDeadline.startsWith(todayStr)
      if (isFixedOnAnotherDay) {
        updates.set(o.id, { start_date: null }) // keep existing deadline, just clear start
      } else {
        updates.set(o.id, { start_date: o.start_date ?? null, deadline: o.deadline }) // move to overflow date with real time
      }
    })
    if (updates.size > 0) {
      const updated = tasks.map(t => updates.has(t.id) ? { ...t, ...updates.get(t.id)! } : t)
      setTasks(updated)
      syncAndCompute(updated)
      updates.forEach((patch, id) => updateTask(id, { deadline: (patch as any).deadline ?? undefined, startDate: (patch as any).start_date ?? null }).catch(() => {}))
    }
    setScheduleMsg(pendingSchedule.message)
    setPendingSchedule(null)
    setChatHistory([])
    setChatPhase('done')
  }

  function toggle(id: string) {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    const nowDone = !task.done
    let updated = tasks.map(t => t.id === id ? { ...t, done: nowDone } : t)
    updateTask(id, { done: nowDone, status: nowDone ? 'completed' : 'active', completedAt: nowDone ? new Date().toISOString() : null }).catch(() => {})
    if (!task.done && (task.recurring === 'daily' || task.recurring === 'weekly')) {
      const nextDate = task.deadline ? new Date(task.deadline) : new Date()
      if (task.recurring === 'daily') nextDate.setDate(nextDate.getDate() + 1)
      if (task.recurring === 'weekly') nextDate.setDate(nextDate.getDate() + 7)
      // Preserve the original time portion so "Take lamictal at 22:30" stays at 22:30 each day
      const timepart = task.deadline?.includes('T') ? task.deadline.split('T')[1] : null
      const nextDeadline = timepart
        ? `${nextDate.toISOString().split('T')[0]}T${timepart}`
        : nextDate.toISOString().split('T')[0]
      const newTask = { ...task, id: Math.random().toString(36).slice(2), done: false, createdAt: Date.now(), deadline: nextDeadline }
      updated = [...updated, newTask]
      addTasks([{ ...newTask, status: 'active', notes: newTask.notes ?? '', recurring: newTask.recurring ?? 'none', lifeDomain: 'personal', demandType: (newTask as any).demand_type ?? 'routine' }]).catch(() => {})
    }
    setTasks(updated)
    syncAndCompute(updated)
  }

  function remove(id: string) {
    const updated = tasks.filter(t => t.id !== id)
    setTasks(updated)
    syncAndCompute(updated)
    deleteTask(id).catch(() => {})
  }

  function performSave(edited: Task) {
    const updated = tasks.map(t => t.id === edited.id ? edited : t)
    setTasks(updated)
    syncAndCompute(updated)
    setEditingTask(null)
    updateTask(edited.id, {
      name: edited.name,
      category: edited.category,
      deadline: edited.deadline,
      startDate: edited.start_date,
      priority: edited.priority,
      difficulty: edited.difficulty,
      estimatedMinutes: edited.estimated_minutes,
      notes: edited.notes,
      recurring: edited.recurring ?? 'none',
      recurringHours: edited.recurring_hours,
      snoozedUntil: edited.snoozedUntil,
    }).catch(() => {})
  }

  function saveEdit(edited: Task) {
    if (edited.deadline) {
      const dl = new Date(edited.deadline.replace(' ', 'T'))
      if (!isNaN(dl.getTime()) && dl.getTime() < Date.now()) {
        setPastDeadlinePending(edited)
        return
      }
    }
    performSave(edited)
  }

  const snoozedCount = tasks.filter(t => !t.done && t.snoozedUntil && t.snoozedUntil > (now || Date.now())).length

  const visible = tasks
    .filter(t => {
      // Hide snoozed tasks unless user opts to show them
      if (!showSnoozed && !t.done && t.snoozedUntil && t.snoozedUntil > (now || Date.now())) return false
      return filter === 'all' ? true : filter === 'active' ? !t.done : t.done
    })
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      const pa = a.priority ?? 3, pb = b.priority ?? 3
      if (pa !== pb) return pa - pb
      if (a.deadline && b.deadline) return parseLocal(effectiveDeadline(a)!).getTime() - parseLocal(effectiveDeadline(b)!).getTime()
      if (a.deadline) return -1
      if (b.deadline) return 1
      return 0
    })

  // Group by category
  const grouped: { cat: typeof categories[0]; tasks: Task[] }[] = []
  categories.forEach(cat => {
    const catTasks = visible.filter(t =>
      (t.category || 'Personal').toLowerCase() === cat.name.toLowerCase() || t.category === cat.id
    )
    if (catTasks.length > 0) grouped.push({ cat, tasks: catTasks })
  })
  const assignedIds = new Set(grouped.flatMap(g => g.tasks.map(t => t.id)))
  const uncategorized = visible.filter(t => !assignedIds.has(t.id))
  if (uncategorized.length > 0) grouped.push({ cat: { id: '_other', name: 'Other', emoji: '📌', color: 'sky' }, tasks: uncategorized })

  // Calendar data
  const calYear = calMonth.getFullYear()
  const calMonthNum = calMonth.getMonth()
  const daysInMonth = new Date(calYear, calMonthNum + 1, 0).getDate()
  const firstDayOfWeek = new Date(calYear, calMonthNum, 1).getDay()
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1 // Mon-first
  // Helper: extract "YYYY-MM-DD" from either "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"
  // Normalize: Supabase may return "YYYY-MM-DD HH:mm:ss+00" (space) or ISO "T" separator
  function normalizeDt(dt: string): string { return dt.replace(' ', 'T') }
  function dateKey(dt: string): string { return normalizeDt(dt).split('T')[0] }
  // Convert a stored timestamp (may have tz info) to "YYYY-MM-DDTHH:mm" using UTC components
  // so datetime-local inputs always show the user's intended time, not the browser's local conversion
  function toInputDt(dt: string | null | undefined): string {
    if (!dt) return ''
    const d = new Date(normalizeDt(dt))
    if (isNaN(d.getTime())) return dt.replace(' ', 'T').slice(0, 16)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  }
  // Helper: safe local-time date parse (avoids UTC-midnight timezone shift)
  function parseLocal(dt: string): Date {
    const n = normalizeDt(dt)
    return new Date(n.includes('T') ? n : n + 'T00:00')
  }
  // Helper: format date using UTC — our times are stored as naive UTC so the
  // UTC date is always the "intended" date (avoids local-tz rollover near midnight)
  const UTC_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  function formatDate(dt: string): string {
    try {
      const d = new Date(normalizeDt(dt))
      if (isNaN(d.getTime())) return ''
      return `${d.getUTCDate()} ${UTC_MONTHS[d.getUTCMonth()]}`
    } catch { return '' }
  }
  // Helper: for recurring daily tasks, advance the deadline to the next future occurrence
  function effectiveDeadline(task: Task): string | null {
    const dl = task.deadline
    if (!dl || task.recurring !== 'daily') return dl
    const normalized = normalizeDt(dl)
    const base = new Date(normalized)
    if (isNaN(base.getTime())) return dl
    const currentNow = now || Date.now()

    // Determine the time-of-day to use:
    // 1. From the stored deadline (if it has a non-midnight time)
    // 2. From the task name (e.g. "Take Lamictal 10:30") as fallback for legacy midnight entries
    let timeStr = normalized.includes('T') ? normalized.split('T')[1] : '00:00'
    const isMidnight = timeStr.startsWith('00:00')
    if (isMidnight) {
      const nameMatch = task.name.match(/\b(\d{1,2}):(\d{2})\b/)
      if (nameMatch) timeStr = `${nameMatch[1].padStart(2, '0')}:${nameMatch[2]}`
    }

    // Reconstruct a base date that combines original date + correct time
    const dateOnlyStr = normalized.split('T')[0]
    const baseWithTime = new Date(`${dateOnlyStr}T${timeStr.split('+')[0].split('Z')[0]}Z`)
    const effectiveBase = isNaN(baseWithTime.getTime()) ? base : baseWithTime

    if (effectiveBase.getTime() > currentNow) return `${dateOnlyStr}T${timeStr}`

    // Advance by full days until it's in the future
    const msPerDay = 86400000
    const elapsed = currentNow - effectiveBase.getTime()
    const daysAhead = Math.ceil(elapsed / msPerDay)
    const next = new Date(effectiveBase.getTime() + daysAhead * msPerDay)
    const yyyy = next.getUTCFullYear()
    const mm = String(next.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(next.getUTCDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}T${timeStr}`
  }

  // Helper: format time portion — reads UTC hours (= AI's intended local time)
  function formatTime(dt: string | null): string | null {
    if (!dt) return null
    try {
      const date = new Date(normalizeDt(dt))
      if (isNaN(date.getTime())) return null
      const h = date.getUTCHours()
      const m = date.getUTCMinutes()
      if (h === 0 && m === 0) return null // midnight = date-only, skip
      const suffix = h >= 12 ? 'pm' : 'am'
      const hour12 = h % 12 || 12
      return `${hour12}:${String(m).padStart(2, '0')}${suffix}`
    } catch { return null }
  }

  const tasksByDate = new Map<string, Task[]>()
  visible.filter(t => t.deadline).forEach(t => {
    const key = dateKey(effectiveDeadline(t)!)
    const arr = tasksByDate.get(key) ?? []
    tasksByDate.set(key, [...arr, t])
  })
  const noDeadlineTasks = visible.filter(t => !t.deadline)

  const mc = shouldReduceMotion ? { duration: 0 } : { duration: 0.18 }

  // ── Shared task row (list view) ──
  function renderTaskRow(task: Task) {
    const cat = categories.find(c =>
      c.name.toLowerCase() === (task.category || 'Personal').toLowerCase() || c.id === task.category
    )
    const cls = getCategoryClasses(cat?.color ?? 'sky')
    return (
      <motion.div
        key={task.id}
        layout
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 12 }}
        transition={mc}
        className={`flex items-start gap-3 rounded-xl p-3 border-l-4 ${cls.bg.replace('bg-', 'border-l-')} ${task.done ? 'opacity-50' : task.snoozedUntil && task.snoozedUntil > (now || Date.now()) ? 'opacity-60 border-l-violet-300' : ''} skeu-card border-none border-l-4 shadow-sm`}
      >
        <button onClick={() => toggle(task.id)} className="shrink-0 mt-0.5">
          {task.done ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <Circle className="w-5 h-5 text-slate-400 hover:text-sky-500" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-sm ${task.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.name}</p>
          <div className="flex flex-wrap gap-1.5 mt-1 items-center">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${DEMAND_COLORS[task.demand_type]} border border-white/5 shadow-sm`}>{task.demand_type}</span>
            <span className="text-xs text-slate-400 font-mono tracking-tighter">{difficultyDots(task.difficulty)}</span>
            {task.recurring_hours ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-violet-100/90 text-violet-700 border border-violet-300/50 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Every {task.recurring_hours}h
              </span>
            ) : task.recurring && task.recurring !== 'none' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100/90 text-emerald-700 border border-emerald-300/50 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> {task.recurring}
              </span>
            )}
            {task.snoozedUntil && task.snoozedUntil > (now || Date.now()) && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-violet-100/80 text-violet-600 border border-violet-200/60 flex items-center gap-1">
                💤 snoozed
              </span>
            )}
            {task.estimated_minutes && <span className="text-[10px] text-slate-400 font-bold">{task.estimated_minutes}m</span>}
            {(task.priority ?? 3) <= 2 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black border ${
                task.priority === 1 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-orange-50 text-orange-600 border-orange-200'
              }`}>
                {task.priority === 1 ? 'P1' : 'P2'}
              </span>
            )}
            {task.deadline && (() => {
              const dl = effectiveDeadline(task)!
              return (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border ${
                  isDueWithin48h(dl, now) ? 'bg-red-50/90 text-red-600 border-red-300/50' : 'bg-sky-50/60 text-slate-500 border-sky-100/60'
                }`}>
                  <Calendar className="w-3 h-3" />
                  {formatDate(dl)}
                  {formatTime(dl) && ` · ${formatTime(dl)}`}
                  {isDueWithin48h(dl, now) && ' · Due soon'}
                </span>
              )
            })()}
            {task.start_date && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border bg-emerald-50/60 text-emerald-600 border-emerald-200/60">
                ▶ {formatTime(task.start_date) ?? formatDate(task.start_date!)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1.5 ml-1">
          {!task.done && (
            <button onClick={() => breakdownTask(task.id)} disabled={breakingDownId === task.id}
              className="text-sky-500 hover:text-sky-800 transition-colors disabled:opacity-50" title="AI Break Down">
              {breakingDownId === task.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            </button>
          )}
          <button onClick={() => setEditingTask(task)} className="text-slate-400 hover:text-sky-500 transition-colors" title="Edit">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={() => remove(task.id)} className="text-slate-400 hover:text-red-400 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    )
  }

  // ── Compact board card ──
  function renderBoardCard(task: Task) {
    const cat = categories.find(c =>
      c.name.toLowerCase() === (task.category || 'Personal').toLowerCase() || c.id === task.category
    )
    const cls = getCategoryClasses(cat?.color ?? 'sky')
    return (
      <div key={task.id} className={`skeu-card p-2.5 border-l-4 ${cls.bg.replace('bg-', 'border-l-')} ${task.done ? 'opacity-50' : ''}`}>
        <div className="flex items-start gap-1.5">
          <button onClick={() => toggle(task.id)} className="shrink-0 mt-0.5">
            {task.done ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Circle className="w-3.5 h-3.5 text-slate-400" />}
          </button>
          <p className={`text-xs font-bold flex-1 leading-snug ${task.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.name}</p>
          <button onClick={() => remove(task.id)} className="text-slate-300 hover:text-red-400 transition-colors shrink-0">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${DEMAND_COLORS[task.demand_type]}`}>{task.demand_type}</span>
          {task.deadline && (() => {
            const dl = effectiveDeadline(task)!
            return (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 ${isDueWithin48h(dl, now) ? 'bg-red-50 text-red-600' : 'bg-sky-50/80 text-slate-500'}`}>
                <Calendar className="w-2.5 h-2.5" />
                {formatDate(dl)}
                {formatTime(dl) && ` ${formatTime(dl)}`}
              </span>
            )
          })()}
          {task.estimated_minutes && <span className="text-[9px] text-slate-400 font-bold">{task.estimated_minutes}m</span>}
        </div>
      </div>
    )
  }

  const emptyState = (
    <div className="text-center py-10 text-slate-500 font-bold">
      <CheckCircle className="w-10 h-10 mx-auto mb-2 opacity-20" />
      <p className="text-sm">{filter === 'done' ? 'No completed tasks yet.' : 'No tasks. Add some!'}</p>
      {filter !== 'done' && (
        <Link href="/tasks/new" className="inline-flex items-center gap-1.5 mt-3 text-sky-600 text-sm font-bold hover:text-sky-900 transition-colors">
          <Plus className="w-4 h-4" /> Add your first task
        </Link>
      )}
    </div>
  )

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-4">

        {/* Header */}
        <div className="page-header flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Tasks</h1>
            <p className="text-sm text-slate-500 font-bold">{tasks.filter(t => !t.done).length} active · {tasks.filter(t => t.done).length} done</p>
          </div>
          <Link href="/tasks/new" className="glow-button font-bold px-4 py-2.5 text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Tasks
          </Link>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {(['active', 'all', 'done'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                  filter === f ? 'bg-sky-100/90 text-sky-800 shadow-inner border border-sky-300/70' : 'bg-white/50 text-slate-500 border border-sky-100/70 hover:bg-white/70'
                }`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400 font-bold flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> {visible.length}
          </span>
          {snoozedCount > 0 && (
            <button
              onClick={() => setShowSnoozed(s => !s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all border ${
                showSnoozed
                  ? 'bg-violet-100/90 text-violet-800 border-violet-300/70 shadow-inner'
                  : 'bg-white/50 text-violet-500 border-violet-100/70 hover:bg-violet-50/60'
              }`}
            >
              <RefreshCw className="w-3 h-3" />
              {showSnoozed ? 'Hide snoozed' : `Snoozed (${snoozedCount})`}
            </button>
          )}
          {/* View switcher */}
          <div className="ml-auto flex gap-1 bg-white/60 rounded-xl p-1 border border-sky-100/60 shadow-sm">
            {([
              { id: 'list' as const, icon: List, label: 'List' },
              { id: 'board' as const, icon: LayoutGrid, label: 'Board' },
              { id: 'calendar' as const, icon: CalendarDays, label: 'Calendar' },
            ]).map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setView(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                  view === id ? 'bg-white/90 text-sky-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── AI Scheduler ── */}
        <div className="glass-panel overflow-hidden">
          <button
            onClick={() => { setShowScheduler(s => !s); setScheduleMsg(null) }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-white/30 transition-colors"
          >
            <CalendarClock className="w-4 h-4 text-sky-500" />
            Schedule with AI
            <span className="ml-auto text-[10px] text-slate-400 font-black uppercase tracking-wider">
              {showScheduler ? '▲ hide' : '▼ expand'}
            </span>
          </button>
          {showScheduler && (
            <div className="border-t border-sky-100/50 px-4 pb-3 pt-2 space-y-2">
              {chatPhase === 'idle' || chatPhase === 'done' ? (
                <>
                  <textarea
                    value={scheduleText}
                    onChange={e => setScheduleText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSchedule() }}
                    placeholder={`Optional hint — e.g. "tired today, skip gym" or just leave blank`}
                    className="input-skeu w-full rounded-xl px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none"
                    rows={2}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Overflow to</span>
                    <input type="date" value={overflowDate} onChange={e => setOverflowDate(e.target.value)}
                      className="input-skeu rounded-lg px-2 py-1 text-xs font-mono text-slate-700 focus:outline-none" />
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={handleSchedule} disabled={isScheduling || tasks.filter(t => !t.done).length === 0}
                      className="glow-button font-bold px-4 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50">
                      {isScheduling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
                      {isScheduling ? 'Thinking…' : 'Plan my day'}
                    </button>
                    {scheduleMsg && <p className="text-xs text-emerald-700 font-bold flex-1">{scheduleMsg}</p>}
                    <p className="text-[10px] text-slate-400 font-bold italic ml-auto">Ctrl+Enter</p>
                  </div>
                </>
              ) : chatPhase === 'chatting' ? (
                <div className="space-y-2">
                  {/* Conversation thread */}
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {chatHistory.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs font-medium leading-relaxed ${
                          msg.role === 'assistant'
                            ? 'bg-sky-50/80 text-slate-700 border border-sky-200/60'
                            : 'bg-sky-500/90 text-white'
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    {isScheduling && (
                      <div className="flex justify-start">
                        <div className="bg-sky-50/80 border border-sky-200/60 px-3 py-2 rounded-xl">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-500" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <textarea
                      autoFocus
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend() } }}
                      placeholder="Reply… (Enter to send)"
                      className="input-skeu flex-1 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none"
                      rows={1}
                    />
                    <button onClick={handleChatSend} disabled={isScheduling || !chatInput.trim()}
                      className="glow-button font-bold px-3 py-1.5 text-xs flex items-center gap-1 disabled:opacity-50 shrink-0">
                      Send
                    </button>
                  </div>
                  <button onClick={() => { setChatPhase('idle'); setChatHistory([]) }}
                    className="text-[10px] text-slate-400 hover:text-slate-600 font-bold transition-colors">
                    ← Cancel
                  </button>
                </div>
              ) : pendingSchedule && (
                <div className="space-y-2">
                  <p className="text-xs font-black text-slate-600 uppercase tracking-wider">Review Schedule</p>
                  {pendingSchedule.scheduled.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Today</p>
                      {pendingSchedule.scheduled.map(s => {
                        const startT = s.start_date.split('T')[1]
                        const endT   = s.deadline.split('T')[1]
                        return (
                          <div key={s.id} className="flex items-center gap-2 text-xs bg-emerald-50/60 rounded-lg px-2.5 py-1.5 border border-emerald-200/60">
                            <span className="font-mono text-emerald-700 font-black shrink-0">{startT}–{endT}</span>
                            <span className="text-slate-700 font-bold truncate">{s.name}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {pendingSchedule.overflow.length > 0 && (() => {
                    // Group overflow by date
                    const byDate = new Map<string, typeof pendingSchedule.overflow>()
                    pendingSchedule.overflow.forEach(o => {
                      const date = o.deadline.split('T')[0]
                      byDate.set(date, [...(byDate.get(date) ?? []), o])
                    })
                    return Array.from(byDate.entries()).map(([date, items]) => (
                      <div key={date} className="space-y-1">
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-wider">Moved to {date}</p>
                        {items.map(o => {
                          const startT = o.start_date?.split('T')[1]
                          const endT   = o.deadline.split('T')[1]
                          return (
                            <div key={o.id} className="flex items-center gap-2 text-xs bg-amber-50/60 rounded-lg px-2.5 py-1.5 border border-amber-200/60">
                              {startT && endT && <span className="font-mono text-amber-700 font-black shrink-0">{startT}–{endT}</span>}
                              <span className="text-slate-700 font-bold truncate">{o.name}</span>
                            </div>
                          )
                        })}
                      </div>
                    ))
                  })()}
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={applySchedule} className="glow-button font-bold px-4 py-1.5 text-xs flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" /> Confirm
                    </button>
                    <button onClick={() => { setPendingSchedule(null); setChatPhase('idle'); setChatHistory([]) }}
                      className="px-4 py-1.5 text-xs font-bold rounded-xl bg-white/60 border border-sky-100/60 text-slate-500 hover:text-slate-700 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rest mode notice */}
        {overwhelmedState !== 'normal' && (
          <div className={`rounded-2xl px-4 py-3 text-sm font-bold flex items-center gap-2 border ${
            overwhelmedState === 'elevated' ? 'bg-amber-50/90 border-amber-300/70 text-amber-700' : 'bg-rose-50/90 border-rose-300/70 text-rose-700'
          }`}>
            {overwhelmedState === 'elevated' ? '⚠ Elevated state — consider completing tasks before adding more.' : '🌿 Rest mode active — focus on essential tasks only.'}
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {view === 'list' && (
          <div className="space-y-3">
            {grouped.length === 0 ? (
              <div className="glass-panel p-4">{emptyState}</div>
            ) : grouped.map(({ cat, tasks: catTasks }) => {
              const cls = getCategoryClasses(cat.color)
              return (
                <div key={cat.id} className="glass-panel overflow-hidden">
                  <div className={`px-4 py-2.5 flex items-center gap-2 border-b border-sky-100/50 ${cls.bg}`}>
                    <span className="text-base">{cat.emoji}</span>
                    <span className={`font-black text-sm ${cls.text}`}>{cat.name}</span>
                    <span className="text-xs text-slate-400 font-bold ml-auto">{catTasks.length} task{catTasks.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <AnimatePresence>{catTasks.map(task => renderTaskRow(task))}</AnimatePresence>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── BOARD VIEW ── */}
        {view === 'board' && (
          <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4">
            {grouped.length === 0 ? (
              <div className="glass-panel p-4 w-full">{emptyState}</div>
            ) : grouped.map(({ cat, tasks: catTasks }) => {
              const cls = getCategoryClasses(cat.color)
              return (
                <div key={cat.id} className="w-52 flex-shrink-0 glass-panel overflow-hidden">
                  <div className={`px-3 py-2 flex items-center gap-2 border-b border-sky-100/50 ${cls.bg}`}>
                    <span className="text-sm">{cat.emoji}</span>
                    <span className={`font-black text-xs ${cls.text}`}>{cat.name}</span>
                    <span className="ml-auto text-xs text-slate-400 font-bold">{catTasks.length}</span>
                  </div>
                  <div className="p-2 space-y-2 max-h-[65vh] overflow-y-auto">
                    {catTasks.map(task => renderBoardCard(task))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── CALENDAR VIEW ── */}
        {view === 'calendar' && (
          <div className="glass-panel p-4 space-y-3">
            {/* Month navigation */}
            <div className="flex items-center justify-between">
              <button onClick={() => setCalMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d })}
                className="w-8 h-8 rounded-full bg-white/60 border border-sky-100/60 flex items-center justify-center text-slate-500 hover:text-sky-700 hover:bg-sky-50/80 transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h3 className="font-black text-slate-700">{MONTH_NAMES[calMonthNum]} {calYear}</h3>
              <button onClick={() => setCalMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d })}
                className="w-8 h-8 rounded-full bg-white/60 border border-sky-100/60 flex items-center justify-center text-slate-500 hover:text-sky-700 hover:bg-sky-50/80 transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1">
              {DAY_NAMES.map(d => (
                <div key={d} className="text-center text-[10px] font-black text-slate-400 uppercase tracking-wider py-1">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: startOffset }).map((_, i) => <div key={`off-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const calDayKey = `${calYear}-${String(calMonthNum + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const dayTasks = tasksByDate.get(calDayKey) ?? []
                const today = new Date()
                const isToday = today.getFullYear() === calYear && today.getMonth() === calMonthNum && today.getDate() === day
                return (
                  <div key={day} className={`min-h-[60px] rounded-xl p-1.5 border transition-all ${
                    isToday ? 'bg-sky-100/80 border-sky-300/60' :
                    dayTasks.length > 0 ? 'bg-white/60 border-sky-100/60' : 'bg-white/30 border-sky-100/30'
                  }`}>
                    <p className={`text-[11px] font-black mb-1 ${isToday ? 'text-sky-700' : 'text-slate-400'}`}>{day}</p>
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 2).map(task => {
                        const cat = categories.find(c => c.name.toLowerCase() === (task.category || 'Personal').toLowerCase())
                        const cls = getCategoryClasses(cat?.color ?? 'sky')
                        return (
                          <div key={task.id} className={`text-[9px] px-1 py-0.5 rounded font-bold truncate cursor-pointer ${cls.bg} ${cls.text} ${task.done ? 'opacity-40 line-through' : ''}`}
                            onClick={() => toggle(task.id)} title={task.name}>
                            {task.name}
                          </div>
                        )
                      })}
                      {dayTasks.length > 2 && <p className="text-[9px] text-slate-400 font-bold">+{dayTasks.length - 2}</p>}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* No-deadline tasks */}
            {noDeadlineTasks.length > 0 && (
              <div className="border-t border-sky-100/50 pt-3">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">No deadline · {noDeadlineTasks.length}</p>
                <div className="space-y-2">
                  <AnimatePresence>{noDeadlineTasks.map(task => renderTaskRow(task))}</AnimatePresence>
                </div>
              </div>
            )}

            {visible.length === 0 && emptyState}
          </div>
        )}

      </div>

      {/* ── Edit Task Modal (centred) ── */}
      <AnimatePresence>
        {editingTask && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
              onClick={() => setEditingTask(null)} />

            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 16 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="vista-dialog w-full max-w-md pointer-events-auto max-h-[90vh] flex flex-col">
                {/* Vista-style title bar */}
                <div className="vista-titlebar flex items-center justify-between px-4 py-2.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-sm bg-white/20 border border-white/30 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-sm bg-white/70" />
                    </div>
                    <span className="text-white font-bold text-sm tracking-wide drop-shadow-sm">Edit Task</span>
                  </div>
                  <button onClick={() => setEditingTask(null)}
                    className="vista-close-btn w-6 h-6 rounded flex items-center justify-center text-white/80 hover:text-white transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto p-5 space-y-4">
                  {/* Name */}
                  <div className="space-y-1">
                    <label className="vista-label">Task Name</label>
                    <input value={editingTask.name} onChange={e => setEditingTask({ ...editingTask, name: e.target.value })}
                      className="input-skeu w-full rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none" />
                  </div>

                  {/* Priority */}
                  <div className="space-y-1">
                    <label className="vista-label">Priority</label>
                    <div className="flex gap-2">
                      {([1,2,3,4] as const).map(p => (
                        <button key={p} onClick={() => setEditingTask({ ...editingTask, priority: p })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-black border transition-all ${editingTask.priority === p
                            ? p === 1 ? 'bg-red-100 text-red-700 border-red-300 shadow-inner' : p === 2 ? 'bg-orange-100 text-orange-700 border-orange-300 shadow-inner' : p === 3 ? 'bg-sky-100 text-sky-700 border-sky-300 shadow-inner' : 'bg-slate-100 text-slate-500 border-slate-300 shadow-inner'
                            : 'bg-white/70 text-slate-400 border-slate-200 hover:bg-white'}`}>
                          {p === 1 ? '🔴 P1' : p === 2 ? '🟠 P2' : p === 3 ? '🟡 P3' : 'P4'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Deadline + Start side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="vista-label">Deadline</label>
                      <input type="datetime-local" value={toInputDt(editingTask.deadline)} onChange={e => setEditingTask({ ...editingTask, deadline: e.target.value ? e.target.value + 'Z' : null })}
                        className="input-skeu w-full rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="vista-label">Start</label>
                      <input type="datetime-local" value={toInputDt(editingTask.start_date)} onChange={e => setEditingTask({ ...editingTask, start_date: e.target.value ? e.target.value + 'Z' : null })}
                        className="input-skeu w-full rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none" />
                    </div>
                  </div>

                  {/* Category + Duration side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="vista-label">Category</label>
                      <select value={editingTask.category} onChange={e => setEditingTask({ ...editingTask, category: e.target.value })}
                        className="input-skeu w-full rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none">
                        {categories.map(c => <option key={c.id} value={c.name}>{c.emoji} {c.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="vista-label">Duration (min)</label>
                      <input type="number" min={1} value={editingTask.estimated_minutes ?? ''} onChange={e => setEditingTask({ ...editingTask, estimated_minutes: parseInt(e.target.value) || null })}
                        className="input-skeu w-full rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none" />
                    </div>
                  </div>

                  {/* Demand type */}
                  <div className="space-y-1">
                    <label className="vista-label">Demand Type</label>
                    <select value={editingTask.demand_type} onChange={e => setEditingTask({ ...editingTask, demand_type: e.target.value as DemandType })}
                      className="input-skeu w-full rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none">
                      {(['cognitive','emotional','creative','routine','physical'] as DemandType[]).map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  {/* Recurring */}
                  <div className="space-y-1">
                    <label className="vista-label">Recurring</label>
                    <div className="flex gap-2 flex-wrap">
                      {(['none','daily','weekly'] as const).map(r => (
                        <button key={r} onClick={() => setEditingTask({ ...editingTask, recurring: r, recurring_hours: null })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-black border transition-all capitalize ${editingTask.recurring === r && !editingTask.recurring_hours ? 'bg-emerald-100 text-emerald-700 border-emerald-300 shadow-inner' : 'bg-white/70 text-slate-400 border-slate-200 hover:bg-white'}`}>
                          {r}
                        </button>
                      ))}
                      <button
                        onClick={() => setEditingTask({ ...editingTask, recurring: 'daily', recurring_hours: editingTask.recurring_hours ?? 8 })}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-black border transition-all ${editingTask.recurring_hours ? 'bg-violet-100 text-violet-700 border-violet-300 shadow-inner' : 'bg-white/70 text-slate-400 border-slate-200 hover:bg-white'}`}>
                        Every Xh
                      </button>
                    </div>
                    {editingTask.recurring_hours ? (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500 font-bold">Every</span>
                        <input
                          type="number"
                          min="1"
                          max="23"
                          value={editingTask.recurring_hours}
                          onChange={e => setEditingTask({ ...editingTask, recurring_hours: parseInt(e.target.value) || 1 })}
                          className="input-skeu w-16 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none"
                        />
                        <span className="text-xs text-slate-500 font-bold">hours</span>
                      </div>
                    ) : null}
                  </div>

                  {/* Notes */}
                  <div className="space-y-1">
                    <label className="vista-label">Notes</label>
                    <textarea value={editingTask.notes ?? ''} onChange={e => setEditingTask({ ...editingTask, notes: e.target.value })}
                      rows={2} className="input-skeu w-full rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none"
                      placeholder="Any extra context…" />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => saveEdit(editingTask)} className="glow-button font-bold px-5 py-2 text-sm flex-1">Save Changes</button>
                    <button onClick={() => setEditingTask(null)}
                      className="px-4 py-2 text-sm font-bold rounded-full bg-white/80 border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-white transition-colors shadow-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {pastDeadlinePending && (
        <PastDeadlineModal
          task={{
            name: pastDeadlinePending.name,
            deadline: pastDeadlinePending.deadline!,
            recurring: pastDeadlinePending.recurring,
            category: pastDeadlinePending.category,
          }}
          onPostpone={(newDeadline) => {
            const updated = { ...pastDeadlinePending, deadline: newDeadline }
            setPastDeadlinePending(null)
            performSave(updated)
          }}
          onRemoveDeadline={() => {
            const updated = { ...pastDeadlinePending, deadline: null }
            setPastDeadlinePending(null)
            performSave(updated)
          }}
          onDelete={() => {
            setPastDeadlinePending(null)
            remove(pastDeadlinePending.id)
          }}
          onCancel={() => setPastDeadlinePending(null)}
        />
      )}
    </AppLayout>
  )
}
