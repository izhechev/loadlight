"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { CheckCircle, Circle, Trash2, Calendar, Plus, Filter, RefreshCw, Loader2, List, LayoutGrid, CalendarDays, ChevronLeft, ChevronRight, CalendarClock, Pencil, X, AlertTriangle } from "@/lib/icons"
import Link from "next/link"
import { AppLayout } from "@/components/app-layout"
import { useOverwhelmedStore, type DemandType } from "@/lib/store/overwhelmedStore"
import { useCategoryStore, getCategoryClasses } from "@/lib/store/categoryStore"
import { ClassicIcon, categoryIconName } from "@/lib/classic-icons"
import { getTasks, updateTask, completeRecurringTask, isLocalMode, type TaskStep } from "@/lib/data/tasks"
import { deadlineStatus, dateKey, toInputDt, formatDate, formatTime, difficultyDots } from "@/lib/utils/taskUtils"
import { nextRecurrenceDeadline, recurringLabel, isPastDeadline, isRecurring, localDeadlineMs } from "@/lib/utils/recurrence"
import { buildSchedule, localDateStr, selectSchedulable, type DaySchedule } from "@/lib/utils/scheduling"
import { getTaskSignals, getDailyWorkload, workloadDeadline, dueIn48Hours } from "@/lib/utils/workload"
import { TaskSteps } from "@/components/task-steps"
import { PastDeadlineModal } from "@/components/past-deadline-modal"

interface Task {
  id: string
  name: string
  category: string
  demand_type: DemandType
  difficulty: number
  deadline: string | null
  start_date: string | null
  priority: 1 | 2 | 3 | 4
  notes: string
  estimated_minutes: number | null
  done: boolean
  steps?: TaskStep[]
  completedAt?: string | null
  createdAt?: string | number
  recurring?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
  recurring_hours?: number | null
  recurring_days?: number | null
  snoozedUntil?: number
  startDate?: string | null
  status?: 'active' | 'completed' | 'archived'
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

export default function TasksPage() {
  const { state: overwhelmedState, computeAndTransition } = useOverwhelmedStore()
  const { categories } = useCategoryStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<'all' | 'active' | 'done' | 'today'>('active')
  const [showSnoozed, setShowSnoozed] = useState(false)
  const [view, setView] = useState<'list' | 'board' | 'calendar'>('list')
  const [calMonth, setCalMonth] = useState(() => new Date())
  const [now, setNow] = useState<number>(0)
  const [migrationNeeded, setMigrationNeeded] = useState(false)
  useEffect(() => {
    try { setMigrationNeeded(localStorage.getItem('loadlight-migration-needed') === '1') } catch { /* ignore */ }
  }, [tasks])
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState('')
  const [due, setDue] = useState('')
  const [sort, setSort] = useState('priority')
  const [balanceMode, setBalanceMode] = useState('average')
  const [removed, setRemoved] = useState<Task[]>([])
  const [lastRemoved, setLastRemoved] = useState<Task | null>(null)
  const [error, setError] = useState('')
  const loadVersion = useRef(0)
  const [scheduleText, setScheduleText]     = useState('')
  const [overflowDate, setOverflowDate]     = useState(() => localDateStr(1))
  const [isScheduling, setIsScheduling]     = useState(false)
  const [scheduleMsg, setScheduleMsg]       = useState<string | null>(null)
  const [showScheduler, setShowScheduler]   = useState(false)
  type ChatMsg = { role: 'assistant' | 'user'; text: string }
  const [chatHistory, setChatHistory]       = useState<ChatMsg[]>([])
  const [chatInput, setChatInput]           = useState('')
  const [chatPhase, setChatPhase]           = useState<'idle' | 'chatting' | 'confirming' | 'done'>('idle')
  const [editingTask, setEditingTask]       = useState<Task | null>(null)
  const [pastDeadlinePending, setPastDeadlinePending] = useState<Task | null>(null)
  // Missed-deadline warning: remaining overdue tasks to walk through, one modal at a time
  const [overdueQueue, setOverdueQueue] = useState<Task[]>([])
  const overdueScanned = useRef(false)

  const [pendingSchedule, setPendingSchedule] = useState<DaySchedule | null>(null)

  const reloadTasks = useCallback(async () => {
    const version = ++loadVersion.current
    try {
      const data = await getTasks(true)
      if (version !== loadVersion.current) return
      const rows = data.map(t => ({
        ...t, category: t.category || t.lifeDomain || 'Personal',
        demand_type: t.demandType as DemandType, estimated_minutes: t.estimatedMinutes ?? null,
        recurring_hours: t.recurringHours ?? null, recurring_days: t.recurringDays ?? null,
        start_date: t.startDate ?? null, deadline: t.deadline ?? null,
        priority: t.priority as Task['priority'], recurring: t.recurring as Task['recurring'],
        done: Boolean(t.done), snoozedUntil: t.snoozedUntil ?? undefined,
      }))
      setTasks(rows.filter(t => t.status !== 'archived'))
      setRemoved(rows.filter(t => t.status === 'archived'))
      computeAndTransition(getTaskSignals(data))
    } catch { setError('Could not load your tasks. Check the connection and try again.') }
  }, [computeAndTransition])

  useEffect(() => {
    setNow(Date.now())
    try { setBalanceMode(JSON.parse(localStorage.getItem('loadlight-user') ?? '{}').balanceMode ?? 'average') } catch {}
    reloadTasks()
    const clock = window.setInterval(() => setNow(Date.now()), 60_000)
    window.addEventListener('loadlight:tasks-changed', reloadTasks)
    return () => {
      window.clearInterval(clock)
      window.removeEventListener('loadlight:tasks-changed', reloadTasks)
    }
  }, [reloadTasks])

  // Warn about missed deadlines: once per day, walk overdue tasks through the
  // reschedule modal (recurring tasks are excluded — they advance on their own)
  useEffect(() => {
    if (overdueScanned.current || !now || tasks.length === 0) return
    overdueScanned.current = true
    const today = localDateStr()
    try { if (localStorage.getItem('loadlight-overdue-prompted') === today) return } catch { /* ignore */ }
    const overdue = tasks.filter(t => !t.done && (t.snoozedUntil ?? 0) <= now && isPastDeadline(t.deadline, t.recurring, now))
    if (overdue.length === 0) return
    try { localStorage.setItem('loadlight-overdue-prompted', today) } catch { /* ignore */ }
    setOverdueQueue(overdue.slice(1))
    setPastDeadlinePending(overdue[0])
  }, [tasks, now])

  // When one overdue modal closes, surface the next task in the queue
  useEffect(() => {
    if (pastDeadlinePending === null && overdueQueue.length > 0) {
      const [next, ...rest] = overdueQueue
      setOverdueQueue(rest)
      setPastDeadlinePending(next)
    }
  }, [pastDeadlinePending, overdueQueue])

  function nowHHMM(d = new Date()): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  // Start conversation
  async function handleSchedule() {
    setScheduleMsg(null)
    setPendingSchedule(null)
    setChatHistory([])
    setChatInput('')
    if (isLocalMode() || !scheduleText.trim()) {
      showPlan(scheduleText)
      return
    }
    setIsScheduling(true)
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
    const at = new Date()
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'schedule_chat',
          text: initialText,
          tasks: selectSchedulable(tasks, at.getTime()),
          currentTime: nowHHMM(at),
          todayStr: localDateStr(0, at.getTime()),
          history,
        }),
      })
      if (res.ok) {
        const data = await res.json() as { type: 'question' | 'ready'; question?: string }
        if (data.type === 'question' && data.question) {
          setChatHistory(h => [...h, { role: 'assistant', text: data.question! }])
          return
        }
      }
    } catch {
      // The day planner also works without chat.
    }
    showPlan([scheduleText, ...history.filter(message => message.role === 'user').map(message => message.text)].join('\n'))
  }

  function showPlan(text: string) {
    const at = new Date()
    const plan = buildSchedule(tasks, {
      today: localDateStr(0, at.getTime()),
      currentTime: nowHHMM(at),
      nowMs: at.getTime(),
      overflowDate,
      text,
    })
    setPendingSchedule(plan)
    setChatPhase('confirming')
  }

  async function resolveSchedule(items: DaySchedule['scheduled'], apply: boolean) {
    if (!pendingSchedule || isScheduling) return
    setScheduleMsg(null)
    const resolved = new Set(items.map(item => item.id))
    if (apply) {
      setIsScheduling(true)
      const results = await Promise.allSettled(items.map(async item => {
        const task = tasks.find(candidate => candidate.id === item.id)
        if (!task || task.done || task.status === 'archived' || (task.snoozedUntil && task.snoozedUntil > Date.now())) {
          throw new Error('Task is no longer available.')
        }
        const startDate = item.start_date + 'Z'
        await updateTask(item.id, { startDate })
        return { id: item.id, startDate }
      }))
      const saved = new Map<string, string>()
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') saved.set(result.value.id, result.value.startDate)
        else resolved.delete(items[i].id)
      })
      setTasks(current => current.map(task => {
        const startDate = saved.get(task.id)
        return startDate ? { ...task, startDate, start_date: startDate } : task
      }))
      if (saved.size !== items.length) setScheduleMsg('Some planned starts could not be saved. Review or try again.')
      setIsScheduling(false)
    }
    const next = {
      ...pendingSchedule,
      scheduled: pendingSchedule.scheduled.filter(item => !resolved.has(item.id)),
      overflow: pendingSchedule.overflow.filter(item => !resolved.has(item.id)),
    }
    if (!next.scheduled.length && !next.overflow.length && !next.unscheduled.length && !next.unusedNotes.length) {
      setScheduleMsg(apply ? 'Plan saved.' : 'Schedule review complete.')
      setPendingSchedule(null)
      setChatPhase('done')
    } else {
      setPendingSchedule(next)
    }
  }

  async function toggle(id: string) {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    try {
      if (!task.done && isRecurring(task)) {
        const next = nextRecurrenceDeadline(effectiveDeadline(task), { recurring: task.recurring, recurringDays: task.recurring_days, recurringHours: task.recurring_hours }, Date.now())
        if (next) await completeRecurringTask(id, next)
      } else {
        await updateTask(id, {
          done: !task.done, status: task.done ? 'active' : 'completed',
          completedAt: task.done ? null : new Date().toISOString(),
        })
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not change this task.') }
  }

  async function remove(id: string) {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    try {
      await updateTask(id, { status: 'archived' })
      setLastRemoved(task)
    } catch { setError('Could not remove this task. Try again.') }
  }

  async function restore(task: Task) {
    try {
      await updateTask(task.id, { status: task.done || task.completedAt ? 'completed' : 'active' })
      setLastRemoved(null)
    } catch { setError('Could not restore this task. Try again.') }
  }

  async function performSave(edited: Task) {
    try {
      await updateTask(edited.id, {
        name: edited.name, category: edited.category, demandType: edited.demand_type,
        deadline: edited.deadline, startDate: edited.start_date, priority: edited.priority,
        difficulty: edited.difficulty, estimatedMinutes: edited.estimated_minutes,
        notes: edited.notes, recurring: edited.recurring ?? 'none', recurringHours: edited.recurring_hours,
        recurringDays: edited.recurring_days ?? null, snoozedUntil: edited.snoozedUntil ?? null,
      })
      setEditingTask(null)
    } catch { setError('Could not save your changes. Try again.') }
  }

  function saveEdit(edited: Task) {
    if (isPastDeadline(edited.deadline, edited.recurring, Date.now())) {
      setPastDeadlinePending(edited)
      return
    }
    performSave(edited)
  }

  const snoozedCount = tasks.filter(t => !t.done && t.snoozedUntil && t.snoozedUntil > (now || Date.now())).length

  const day = getDailyWorkload(tasks, balanceMode, now || Date.now())
  const todayIds = new Set(day.tasks.map(task => task.id))
  function dueTime(task: Task) {
    const deadline = effectiveDeadline(task)
    return deadline ? localDeadlineMs(deadline) : Infinity
  }
  const query = search.trim().toLowerCase()
  const visible = tasks.filter(task => {
    if (!showSnoozed && !task.done && (task.snoozedUntil ?? 0) > (now || Date.now())) return false
    if (filter === 'active' && task.done || filter === 'done' && !task.done) return false
    if (filter === 'today' && !todayIds.has(task.id)) return false
    if (priority && task.priority !== Number(priority)) return false
    const deadline = effectiveDeadline(task)
    if (due === 'today' && deadline?.slice(0, 10) !== day.today) return false
    if (due === 'overdue' && (task.done || deadlineStatus(deadline, now) !== 'overdue')) return false
    if (due === 'none' && deadline) return false
    return !query || [task.name, task.notes, task.category, ...(task.steps ?? []).map(step => step.name)]
      .some(value => value?.toLowerCase().includes(query))
  }).sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (sort === 'name') return a.name.localeCompare(b.name)
    const byDue = dueTime(a) - dueTime(b)
    const byPriority = (a.priority ?? 3) - (b.priority ?? 3)
    return sort === 'due' ? byDue || byPriority : byPriority || byDue
  })

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
  function effectiveDeadline(task: Task): string | null {
    return task.done ? task.deadline : workloadDeadline(task, now || Date.now())
  }

  const todayKey = localDateStr()

  const tasksByDate = new Map<string, Task[]>()
  visible.forEach(task => {
    const due = effectiveDeadline(task)
    const dates = new Set([due, task.start_date].filter((value): value is string => Boolean(value)).map(dateKey))
    dates.forEach(date => {
      const day = tasksByDate.get(date) ?? []
      day.push(task)
      tasksByDate.set(date, day)
    })
  })
  const noDeadlineTasks = visible.filter(task => !task.deadline && !task.start_date)

  function plannedBadge(task: Task) {
    if (!task.start_date || dateKey(task.start_date) < todayKey) return null
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold border bg-emerald-50 text-emerald-800 border-emerald-200">
        Planned {formatDate(task.start_date)}{formatTime(task.start_date) ? ` · ${formatTime(task.start_date)}` : ''}
      </span>
    )
  }

  // ── Shared task row (list view) ──
  function renderTaskRow(task: Task) {
    const cat = categories.find(c =>
      c.name.toLowerCase() === (task.category || 'Personal').toLowerCase() || c.id === task.category
    )
    const cls = getCategoryClasses(cat?.color ?? 'sky')
    return (
      <div
        key={task.id}
        className={`flex items-start gap-3 rounded-xl p-3 border-l-4 ${cls.bg.replace('bg-', 'border-l-')} ${task.done ? 'opacity-50' : task.snoozedUntil && task.snoozedUntil > (now || Date.now()) ? 'opacity-60 border-l-violet-300' : ''} skeu-card border-none border-l-4 shadow-sm anim-fade-in-left`}
      >
        <button aria-label={`${task.done ? 'Reopen' : 'Complete'} ${task.name}`} onClick={() => toggle(task.id)} className="shrink-0 mt-0.5">
          {task.done ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <Circle className="w-5 h-5 text-slate-400 hover:text-sky-500" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-sm ${task.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.name}</p>
          {task.notes && (
            <p className="text-xs mt-0.5 mb-1 leading-snug" style={{ color: '#5a7a9a' }}>{task.notes}</p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-1 items-center">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${DEMAND_COLORS[task.demand_type]} border border-white/5 shadow-sm`}>{task.demand_type}</span>
            <span className="text-xs text-slate-400 font-mono tracking-tighter">{difficultyDots(task.difficulty)}</span>
            {(() => {
              const lbl = recurringLabel({ recurring: task.recurring, recurringDays: task.recurring_days, recurringHours: task.recurring_hours })
              if (!lbl) return null
              const cls = task.recurring_hours
                ? 'bg-violet-100/90 text-violet-700 border-violet-300/50'
                : 'bg-emerald-100/90 text-emerald-700 border-emerald-300/50'
              return (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border flex items-center gap-1 ${cls}`}>
                  <RefreshCw className="w-3 h-3" /> {lbl}
                </span>
              )
            })()}
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
              const status = deadlineStatus(dl, now)
              return (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border ${
                  status === 'overdue' ? 'bg-red-100 text-red-700 border-red-400/60'
                  : status === 'due-soon' ? 'bg-red-50/90 text-red-600 border-red-300/50'
                  : 'bg-sky-50/60 text-slate-500 border-sky-100/60'
                }`}>
                  {status === 'overdue' ? <AlertTriangle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                  {formatDate(dl)}
                  {formatTime(dl) && ` · ${formatTime(dl)}`}
                  {status === 'overdue' ? ' · Overdue' : status === 'due-soon' ? ' · Due soon' : ''}
                </span>
              )
            })()}
            {plannedBadge(task)}
          </div>
          <TaskSteps id={task.id} name={task.name} done={task.done} steps={task.steps ?? []} />
        </div>
        <div className="flex flex-col items-center gap-1.5 ml-1">
          <button aria-label={`Edit ${task.name}`} onClick={() => setEditingTask(task)} className="text-slate-400 hover:text-sky-500 transition-colors" title="Edit">
            <Pencil className="w-4 h-4" />
          </button>
          <button aria-label={`Remove ${task.name}`} onClick={() => remove(task.id)} className="text-slate-400 hover:text-red-400 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
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
          <button aria-label={`${task.done ? 'Reopen' : 'Complete'} ${task.name}`} onClick={() => toggle(task.id)} className="shrink-0 mt-0.5">
            {task.done ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Circle className="w-3.5 h-3.5 text-slate-400" />}
          </button>
          <p className={`text-xs font-bold flex-1 leading-snug ${task.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.name}</p>
          <button aria-label={`Edit ${task.name}`} onClick={() => setEditingTask(task)} className="shrink-0 text-sky-700">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button aria-label={`Remove ${task.name}`} onClick={() => remove(task.id)} className="text-slate-300 hover:text-red-400 transition-colors shrink-0">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
        {task.notes && (
          <p className="text-[10px] mt-1 leading-snug" style={{ color: '#5a7a9a' }}>{task.notes}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-1.5">
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${DEMAND_COLORS[task.demand_type]}`}>{task.demand_type}</span>
          {task.deadline && (() => {
            const dl = effectiveDeadline(task)!
            return (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 ${dueIn48Hours(dl, now) ? 'bg-red-50 text-red-600' : 'bg-sky-50/80 text-slate-500'}`}>
                <Calendar className="w-2.5 h-2.5" />
                {formatDate(dl)}
                {formatTime(dl) && ` ${formatTime(dl)}`}
              </span>
            )
          })()}
          {task.estimated_minutes && <span className="text-[9px] text-slate-400 font-bold">{task.estimated_minutes}m</span>}
          {plannedBadge(task)}
        </div>
      </div>
    )
  }

  const emptyState = (
    <div className="text-center py-10 text-slate-500 font-bold">
      <CheckCircle className="w-10 h-10 mx-auto mb-2 opacity-20" />
      <p className="text-sm">{tasks.length ? 'No tasks match this view.' : 'No tasks yet.'}</p>
      {!tasks.length && (
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
            {(['active', 'today', 'all', 'done'] as const).map(f => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-xs transition-all ${
                  filter === f ? 'vista-chip-active' : 'vista-chip-inactive'
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                showSnoozed ? 'vista-chip-active' : 'vista-chip-inactive'
              }`}
            >
              <RefreshCw className="w-3 h-3" />
              {showSnoozed ? 'Hide snoozed' : `Snoozed (${snoozedCount})`}
            </button>
          )}
          {/* View switcher */}
          <div className="ml-auto flex gap-1 glass-panel rounded-xl p-1">
            {([
              { id: 'list' as const, icon: List, label: 'List' },
              { id: 'board' as const, icon: LayoutGrid, label: 'Board' },
              { id: 'calendar' as const, icon: CalendarDays, label: 'Calendar' },
            ]).map(({ id, icon: Icon, label }) => (
              <button key={id} aria-pressed={view === id} onClick={() => setView(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                  view === id ? 'vista-chip-active' : 'vista-chip-inactive'
                }`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 text-xs font-bold text-slate-700">
          <label className="grow">Search tasks
            <input type="search" className="input-skeu rounded-lg px-2 py-1.5 block w-full mt-1" value={search} onChange={event => setSearch(event.target.value)} />
          </label>
          <label>Priority
            <select aria-label="Filter by priority" className="input-skeu rounded-lg px-2 py-1.5 block mt-1" value={priority} onChange={event => setPriority(event.target.value)}>
              <option value="">All priorities</option>
              {[1, 2, 3, 4].map(p => <option key={p} value={p}>P{p}</option>)}
            </select>
          </label>
          <label>Deadline
            <select aria-label="Filter by deadline" className="input-skeu rounded-lg px-2 py-1.5 block mt-1" value={due} onChange={event => setDue(event.target.value)}>
              <option value="">Any deadline</option><option value="today">Due today</option>
              <option value="overdue">Overdue</option><option value="none">No deadline</option>
            </select>
          </label>
          <label>Sort by
            <select aria-label="Sort by" className="input-skeu rounded-lg px-2 py-1.5 block mt-1" value={sort} onChange={event => setSort(event.target.value)}>
              <option value="priority">Priority</option><option value="due">Deadline</option>
              <option value="name">Name</option><option value="category">Category</option>
            </select>
          </label>
        </div>
        {filter === 'today' && <p className="text-sm font-bold">{day.minutes} min due or planned · {day.capacity} min daily target · {Math.abs(day.capacity - day.minutes)} min {day.minutes > day.capacity ? 'over target' : 'left'}</p>}
        {error && <div role="alert">{error} <button className="underline" onClick={() => { setError(''); reloadTasks() }}>Dismiss and refresh</button></div>}
        {lastRemoved && <p role="status">Removed {lastRemoved.name}. <button className="underline" onClick={() => restore(lastRemoved)}>Undo</button></p>}
        {removed.length > 0 && <details className="text-sm">
          <summary className="cursor-pointer">Removed tasks ({removed.length})</summary>
          {removed.map(task => <div key={task.id} className="flex justify-between gap-2 py-1">{task.name}
            <button className="underline" aria-label={`Restore ${task.name}`} onClick={() => restore(task)}>Restore</button>
          </div>)}
        </details>}

        {/* ── AI Scheduler ── */}
        <div className="glass-panel overflow-hidden">
          <button
            onClick={() => { setShowScheduler(s => !s); setScheduleMsg(null) }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#2a3a50', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <CalendarClock className="w-4 h-4 text-sky-500" />
            Day planner
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#7a9ab8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
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
                    aria-label="Planning notes"
                    placeholder="Optional: Busy 09:00–11:00, or Doctor at 16:00"
                    className="input-skeu w-full rounded-xl px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none"
                    rows={2}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <label htmlFor="overflow-date" className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Overflow to</label>
                    <input id="overflow-date" type="date" min={localDateStr(1)} value={overflowDate} onChange={e => setOverflowDate(e.target.value)}
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
                          msg.role === 'assistant' ? 'aero-bubble-ai' : 'aero-bubble-user'
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    {isScheduling && (
                      <div className="flex justify-start">
                        <div className="aero-bubble-ai px-3 py-2 rounded-xl">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
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
                  <p className="text-xs font-black text-slate-600 uppercase tracking-wider">Review schedule</p>
                  <p className="text-xs text-slate-600">Applying a time saves the planned start and keeps the original deadline.</p>
                  {[
                    { date: pendingSchedule.date, tasks: pendingSchedule.scheduled, tone: 'aero-success' },
                    { date: pendingSchedule.overflowDate, tasks: pendingSchedule.overflow, tone: 'aero-warning' },
                  ].map(section => section.tasks.length > 0 && (
                    <div key={section.date} className="space-y-1">
                      <p className="text-xs font-bold text-slate-700">{formatDate(section.date)}</p>
                      {section.tasks.map(item => (
                        <div key={item.id} className={`flex items-center gap-2 text-xs ${section.tone} rounded-lg px-2.5 py-1.5`}>
                          <span className="font-mono font-black shrink-0">{item.start_date.slice(11)}–{item.end_date.slice(11)}</span>
                          <span className="font-bold truncate">{item.name}</span>
                          <span className="ml-auto flex items-center gap-1.5 shrink-0">
                            <button type="button" disabled={isScheduling} onClick={() => resolveSchedule([item], true)}
                              aria-label={`Apply time for ${item.name}`}
                              className="glow-button font-black px-2.5 py-1 text-[10px] flex items-center gap-1 disabled:opacity-50">
                              <CheckCircle className="w-3 h-3" /> Apply
                            </button>
                            <button type="button" disabled={isScheduling} onClick={() => resolveSchedule([item], false)}
                              aria-label={`Skip ${item.name}`}
                              className="vista-btn-secondary font-black px-2.5 py-1 text-[10px] disabled:opacity-50">
                              Skip
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {pendingSchedule.unusedNotes.length > 0 && (
                    <div className="aero-warning rounded-lg px-2.5 py-2" role="status">
                      <p className="font-bold text-xs">Check these notes before applying. Some details may be missing from the plan.</p>
                      <ul className="text-xs space-y-1 mt-1">
                        {pendingSchedule.unusedNotes.map((note, index) => <li key={index}>{note}</li>)}
                      </ul>
                    </div>
                  )}
                  {pendingSchedule.unscheduled.length > 0 && (
                    <div className="aero-warning rounded-lg px-2.5 py-2">
                      <p className="font-bold text-xs">Not scheduled</p>
                      <ul className="text-xs space-y-1 mt-1">
                        {pendingSchedule.unscheduled.map(item => (
                          <li key={item.id}><strong>{item.name}</strong> · {item.reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!pendingSchedule.scheduled.length && !pendingSchedule.overflow.length && !pendingSchedule.unscheduled.length && (
                    <p className="text-xs text-slate-600">No tasks match these planning days.</p>
                  )}
                  {scheduleMsg && <p className="text-xs font-bold" role="status">{scheduleMsg}</p>}
                  <div className="flex items-center gap-2 pt-1">
                    {Boolean(pendingSchedule.scheduled.length || pendingSchedule.overflow.length) && (
                      <button type="button" disabled={isScheduling}
                        onClick={() => resolveSchedule([...pendingSchedule.scheduled, ...pendingSchedule.overflow], true)}
                        className="glow-button font-bold px-4 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-50">
                        <CheckCircle className="w-3.5 h-3.5" /> Apply all remaining ({pendingSchedule.scheduled.length + pendingSchedule.overflow.length})
                      </button>
                    )}
                    <button type="button" disabled={isScheduling}
                      onClick={() => { setPendingSchedule(null); setChatPhase('idle'); setChatHistory([]); setScheduleMsg(null) }}
                      className="vista-btn-secondary text-xs font-bold px-4 py-1.5 disabled:opacity-50">
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Database migration needed — repeat cadences are being dropped on save */}
        {migrationNeeded && (
          <div className="aero-warning rounded-2xl px-4 py-3 text-sm font-bold flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Your database needs a one-time update — repeat settings like &quot;every 2 days&quot;, monthly and yearly
              are being saved as plain daily until it runs. Open Supabase → SQL Editor and run the statements in{' '}
              <code className="font-mono text-xs">supabase/MIGRATIONS.sql</code>, then edit the task again.
            </span>
          </div>
        )}

        {/* Rest mode notice */}
        {overwhelmedState !== 'normal' && (
          <div className={`rounded-2xl px-4 py-3 text-sm font-bold flex items-center gap-2 ${
            overwhelmedState === 'elevated' ? 'aero-warning' : 'aero-danger'
          }`}>
            <ClassicIcon name={overwhelmedState === 'elevated' ? 'warning' : 'chill'} size={16} />
            {overwhelmedState === 'elevated' ? 'Elevated state — consider completing tasks before adding more.' : 'Rest mode active — focus on essential tasks only.'}
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {view === 'list' && sort !== 'category' && (
          <div className="glass-panel p-3 space-y-2">{visible.length ? visible.map(renderTaskRow) : emptyState}</div>
        )}
        {view === 'list' && sort === 'category' && (
          <div className="space-y-3">
            {grouped.length === 0 ? (
              <div className="glass-panel p-4">{emptyState}</div>
            ) : grouped.map(({ cat, tasks: catTasks }) => {
              const cls = getCategoryClasses(cat.color)
              return (
                <div key={cat.id} className="glass-panel overflow-hidden">
                  <div className={`px-4 py-2.5 flex items-center gap-2 border-b border-sky-100/50 ${cls.bg}`}>
                    <ClassicIcon name={categoryIconName(cat)} size={18} alt={cat.name} />
                    <span className={`font-black text-sm ${cls.text}`}>{cat.name}</span>
                    <span className="text-xs text-slate-400 font-bold ml-auto">{catTasks.length} task{catTasks.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {catTasks.map(task => renderTaskRow(task))}
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
                    <ClassicIcon name={categoryIconName(cat)} size={16} alt={cat.name} />
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
              <button aria-label="Previous month" onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                className="w-8 h-8 rounded-full vista-btn-secondary flex items-center justify-center transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h3 className="font-black" style={{ color: '#1a2a3a' }}>{MONTH_NAMES[calMonthNum]} {calYear}</h3>
              <button aria-label="Next month" onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                className="w-8 h-8 rounded-full vista-btn-secondary flex items-center justify-center transition-all">
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
                  <div key={day} className={`min-h-[60px] p-1.5 transition-all ${
                    isToday ? 'cal-cell-today' :
                    dayTasks.length > 0 ? 'cal-cell-has' : 'cal-cell'
                  }`}>
                    <p className="text-[11px] font-black mb-1" style={{ color: isToday ? '#1a5a98' : '#7a8aaa' }}>{day}</p>
                    <div className="space-y-0.5">
                      {dayTasks.map(task => {
                        const cat = categories.find(c => c.name.toLowerCase() === (task.category || 'Personal').toLowerCase())
                        const cls = getCategoryClasses(cat?.color ?? 'sky')
                        return (
                          <button key={task.id} type="button" className={`block w-full text-left text-[9px] px-1 py-0.5 rounded font-bold truncate cursor-pointer ${cls.bg} ${cls.text} ${task.done ? 'opacity-40 line-through' : ''}`}
                            onClick={() => setEditingTask(task)} aria-label={`Edit ${task.name}`} title={task.name}>
                            {task.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* No-deadline tasks */}
            {noDeadlineTasks.length > 0 && (
              <div className="border-t border-sky-100/50 pt-3">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Unscheduled · {noDeadlineTasks.length}</p>
                <div className="space-y-2">
                  {noDeadlineTasks.map(task => renderTaskRow(task))}
                </div>
              </div>
            )}

            {visible.length === 0 && emptyState}
          </div>
        )}

      </div>

      {/* ── Edit Task Modal (centred) ── */}
        {editingTask && (
          <>
            <div className="fixed inset-0 z-50 anim-overlay-in" style={{ background: 'rgba(0,0,0,0.50)' }}
              onClick={() => setEditingTask(null)} />

            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none anim-scale-in">
              <div role="dialog" aria-modal="true" aria-label="Edit task" onKeyDown={event => { if (event.key === 'Escape') setEditingTask(null) }} className="vista-dialog w-full max-w-md pointer-events-auto max-h-[90vh] flex flex-col">
                {/* Vista-style title bar */}
                <div className="vista-titlebar flex items-center justify-between px-4 py-2.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-sm bg-white/20 border border-white/30 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-sm bg-white/70" />
                    </div>
                    <span className="text-white font-bold text-sm tracking-wide drop-shadow-sm">Edit Task</span>
                  </div>
                  <button aria-label="Close editor" onClick={() => setEditingTask(null)}
                    className="vista-close-btn w-6 h-6 rounded flex items-center justify-center text-white/80 hover:text-white transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto p-5 space-y-4">
                  {/* Name */}
                  <div className="space-y-1">
                    <label htmlFor="task-name" className="vista-label">Task Name</label>
                    <input id="task-name" autoFocus value={editingTask.name} onChange={e => setEditingTask({ ...editingTask, name: e.target.value })}
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
                      <label htmlFor="task-deadline" className="vista-label">Deadline</label>
                      <input id="task-deadline" type="datetime-local" value={toInputDt(editingTask.deadline)} onChange={e => setEditingTask({ ...editingTask, deadline: e.target.value ? e.target.value + 'Z' : null })}
                        className="input-skeu w-full rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="task-start" className="vista-label">Start</label>
                      <input id="task-start" type="datetime-local" value={toInputDt(editingTask.start_date)} onChange={e => setEditingTask({ ...editingTask, start_date: e.target.value ? e.target.value + 'Z' : null })}
                        className="input-skeu w-full rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none" />
                    </div>
                  </div>

                  {/* Category + Duration side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="task-category" className="vista-label">Category</label>
                      <select id="task-category" value={editingTask.category} onChange={e => setEditingTask({ ...editingTask, category: e.target.value })}
                        className="input-skeu w-full rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none">
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="task-duration" className="vista-label">Duration (min)</label>
                      <input id="task-duration" type="number" min={1} value={editingTask.estimated_minutes ?? ''} onChange={e => setEditingTask({ ...editingTask, estimated_minutes: parseInt(e.target.value) || null })}
                        className="input-skeu w-full rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none" />
                    </div>
                  </div>

                  {/* Demand type */}
                  <div className="space-y-1">
                    <label htmlFor="task-demand" className="vista-label">Demand Type</label>
                    <select id="task-demand" value={editingTask.demand_type} onChange={e => setEditingTask({ ...editingTask, demand_type: e.target.value as DemandType })}
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
                      {(['none','daily','weekly','monthly','yearly'] as const).map(r => (
                        <button key={r} onClick={() => setEditingTask({ ...editingTask, recurring: r, recurring_hours: null, recurring_days: null })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-black border transition-all capitalize ${editingTask.recurring === r && !editingTask.recurring_hours && !editingTask.recurring_days ? 'bg-emerald-100 text-emerald-700 border-emerald-300 shadow-inner' : 'bg-white/70 text-slate-400 border-slate-200 hover:bg-white'}`}>
                          {r}
                        </button>
                      ))}
                      <button
                        onClick={() => setEditingTask({ ...editingTask, recurring: 'daily', recurring_hours: editingTask.recurring_hours ?? 8, recurring_days: null })}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-black border transition-all ${editingTask.recurring_hours ? 'bg-violet-100 text-violet-700 border-violet-300 shadow-inner' : 'bg-white/70 text-slate-400 border-slate-200 hover:bg-white'}`}>
                        Every Xh
                      </button>
                      {([
                        { label: 'Every Xd', rec: 'daily' as const, days: 2 },
                        { label: 'Every Xw', rec: 'weekly' as const, days: 14 },
                        { label: 'Every Xm', rec: 'monthly' as const, days: 2 },
                        { label: 'Every Xy', rec: 'yearly' as const, days: 2 },
                      ]).map(opt => {
                        const active = !editingTask.recurring_hours && !!editingTask.recurring_days && editingTask.recurring === opt.rec
                        return (
                          <button key={opt.label}
                            onClick={() => setEditingTask({ ...editingTask, recurring: opt.rec, recurring_days: opt.days, recurring_hours: null })}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-black border transition-all ${active ? 'bg-sky-100 text-sky-700 border-sky-300 shadow-inner' : 'bg-white/70 text-slate-400 border-slate-200 hover:bg-white'}`}>
                            {opt.label}
                          </button>
                        )
                      })}
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
                    ) : editingTask.recurring_days ? (() => {
                      // Unit-aware interval input: weeks store days×7, months/years
                      // reuse recurring_days as the calendar multiplier
                      const isWeeks = editingTask.recurring === 'weekly'
                      const unit = isWeeks ? 'weeks' : editingTask.recurring === 'monthly' ? 'months' : editingTask.recurring === 'yearly' ? 'years' : 'days'
                      const shown = isWeeks ? Math.max(1, Math.round(editingTask.recurring_days / 7)) : editingTask.recurring_days
                      return (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-500 font-bold">Every</span>
                          <input
                            type="number"
                            min="2"
                            max="60"
                            value={shown}
                            onChange={e => {
                              const v = Math.max(2, parseInt(e.target.value) || 2)
                              setEditingTask({ ...editingTask, recurring_days: isWeeks ? v * 7 : v })
                            }}
                            className="input-skeu w-16 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none"
                          />
                          <span className="text-xs text-slate-500 font-bold">{unit}</span>
                        </div>
                      )
                    })() : null}
                  </div>

                  {/* Notes */}
                  <div className="space-y-1">
                    <label htmlFor="task-notes" className="vista-label">Notes</label>
                    <textarea id="task-notes" value={editingTask.notes ?? ''} onChange={e => setEditingTask({ ...editingTask, notes: e.target.value })}
                      rows={2} className="input-skeu w-full rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none"
                      placeholder="Any extra context…" />
                  </div>

                  {error && <p role="alert" className="text-red-800">{error}</p>}
                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button disabled={!editingTask.name.trim() || (editingTask.estimated_minutes != null && editingTask.estimated_minutes < 1)} onClick={() => saveEdit(editingTask)} className="glow-button font-bold px-5 py-2 text-sm flex-1">Save Changes</button>
                    <button onClick={() => setEditingTask(null)}
                      className="px-4 py-2 text-sm font-bold rounded-full bg-white/80 border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-white transition-colors shadow-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

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
