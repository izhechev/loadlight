"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { CheckCircle, Circle, Trash2, Calendar, Plus, Filter, RefreshCw, Sparkles, Loader2, List, LayoutGrid, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { AppLayout } from "@/components/app-layout"
import { useOverwhelmedStore, type DemandType, type TaskSignalData } from "@/lib/store/overwhelmedStore"
import { useCategoryStore, getCategoryClasses } from "@/lib/store/categoryStore"

interface Task {
  id: string
  name: string
  category: string
  demand_type: DemandType
  difficulty: number
  deadline: string | null
  estimated_minutes: number | null
  done: boolean
  createdAt: number
  recurring?: 'none' | 'daily' | 'weekly'
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
  return ms >= 0 && ms <= 172800000
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
  const [view, setView] = useState<'list' | 'board' | 'calendar'>('list')
  const [calMonth, setCalMonth] = useState(() => new Date())
  const [now, setNow] = useState<number>(0)
  const [breakingDownId, setBreakingDownId] = useState<string | null>(null)

  useEffect(() => {
    const time = Date.now()
    requestAnimationFrame(() => {
      setNow(time)
      try {
        const stored = localStorage.getItem('loadlight-tasks')
        if (stored) {
          const data = JSON.parse(stored) as any[]
          setTasks(data.map(t => ({ ...t, category: t.category || t.life_domain || 'Personal' })) as Task[])
        }
      } catch { /* ignore */ }
    })
  }, [])

  const syncAndCompute = useCallback((updated: Task[]) => {
    localStorage.setItem('loadlight-tasks', JSON.stringify(updated))
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
      }
    } catch { alert('Failed to break down task.') }
    finally { setBreakingDownId(null) }
  }

  function toggle(id: string) {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    let updated = tasks.map(t => t.id === id ? { ...t, done: !t.done } : t)
    if (!task.done && (task.recurring === 'daily' || task.recurring === 'weekly')) {
      const nextDate = task.deadline ? new Date(task.deadline) : new Date()
      if (task.recurring === 'daily') nextDate.setDate(nextDate.getDate() + 1)
      if (task.recurring === 'weekly') nextDate.setDate(nextDate.getDate() + 7)
      updated = [...updated, { ...task, id: Math.random().toString(36).slice(2), done: false, createdAt: Date.now(), deadline: nextDate.toISOString().split('T')[0] }]
    }
    setTasks(updated)
    syncAndCompute(updated)
  }

  function remove(id: string) {
    const updated = tasks.filter(t => t.id !== id)
    setTasks(updated)
    syncAndCompute(updated)
  }

  const visible = tasks.filter(t => filter === 'all' ? true : filter === 'active' ? !t.done : t.done)

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
  const tasksByDate = new Map<string, Task[]>()
  visible.filter(t => t.deadline).forEach(t => {
    const arr = tasksByDate.get(t.deadline!) ?? []
    tasksByDate.set(t.deadline!, [...arr, t])
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
        className={`flex items-start gap-3 rounded-xl p-3 border-l-4 ${cls.bg.replace('bg-', 'border-l-')} ${task.done ? 'opacity-50' : ''} skeu-card border-none border-l-4 shadow-sm`}
      >
        <button onClick={() => toggle(task.id)} className="shrink-0 mt-0.5">
          {task.done ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <Circle className="w-5 h-5 text-slate-400 hover:text-sky-500" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-sm ${task.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.name}</p>
          <div className="flex flex-wrap gap-1.5 mt-1 items-center">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${DEMAND_COLORS[task.demand_type]} border border-white/5 shadow-sm`}>{task.demand_type}</span>
            <span className="text-xs text-slate-400 font-mono tracking-tighter">{difficultyDots(task.difficulty)}</span>
            {task.recurring && task.recurring !== 'none' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100/90 text-emerald-700 border border-emerald-300/50 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> {task.recurring}
              </span>
            )}
            {task.estimated_minutes && <span className="text-[10px] text-slate-400 font-bold">{task.estimated_minutes}m</span>}
            {task.deadline && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border ${
                isDueWithin48h(task.deadline, now) ? 'bg-red-50/90 text-red-600 border-red-300/50' : 'bg-sky-50/60 text-slate-500 border-sky-100/60'
              }`}>
                <Calendar className="w-3 h-3" />
                {new Date(task.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                {isDueWithin48h(task.deadline, now) && ' · Due soon'}
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
          {task.deadline && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 ${isDueWithin48h(task.deadline, now) ? 'bg-red-50 text-red-600' : 'bg-sky-50/80 text-slate-500'}`}>
              <Calendar className="w-2.5 h-2.5" />
              {new Date(task.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          )}
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
                const dateKey = `${calYear}-${String(calMonthNum + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const dayTasks = tasksByDate.get(dateKey) ?? []
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
    </AppLayout>
  )
}
