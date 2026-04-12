"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Plus, Trash2, Tag, RefreshCw, Palette, ChevronDown, ChevronRight,
  CheckCircle, LayoutGrid, CalendarDays, Calendar, ChevronLeft,
  GripVertical, AlertTriangle, Settings2,
} from "lucide-react"
import { AppLayout } from "@/components/app-layout"
import { useCategoryStore, COLOR_OPTIONS, getCategoryClasses, type ColorKey } from "@/lib/store/categoryStore"
import { getTasks } from "@/lib/data/tasks"

interface Task {
  id: string
  name: string
  category: string
  demand_type: string
  difficulty: number
  deadline: string | null
  start_date?: string | null
  estimated_minutes: number | null
  done: boolean
  createdAt: number
  recurring?: string
}

type BalanceMode = 'beast' | 'average' | 'chill'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

// These category names count toward "work" for balance purposes
const WORK_NAMES = new Set(['work', 'study', 'admin', 'administrative', 'creative'])
function isWorkCat(name: string) { return WORK_NAMES.has(name.toLowerCase()) }

function isDueWithin48h(deadline: string | null): boolean {
  if (!deadline) return false
  const ms = new Date(deadline).getTime() - Date.now()
  return ms <= 172800000
}

function targetWorkPct(mode: BalanceMode) {
  return mode === 'beast' ? 70 : mode === 'chill' ? 30 : 50
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function CategoriesPage() {
  const { categories, addCategory, deleteCategory, resetToDefaults, reorderCategories } = useCategoryStore()
  const [view, setView] = useState<'manage' | 'board' | 'calendar'>('manage')
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [newEmoji, setNewEmoji] = useState("✨")
  const [newColor, setNewColor] = useState<ColorKey>('blue')
  const [tasks, setTasks] = useState<Task[]>([])
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const [calMonth, setCalMonth] = useState(() => new Date())
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('average')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  useEffect(() => {
    getTasks()
      .then(data => setTasks(data as unknown as Task[]))
      .catch(() => {
        try {
          const t = localStorage.getItem('loadlight-tasks')
          if (t) setTasks(JSON.parse(t))
        } catch { /* ignore */ }
      })
    try {
      const u = localStorage.getItem('loadlight-user')
      if (u) {
        const p = JSON.parse(u) as { balanceMode?: string }
        const bm = p.balanceMode === 'balanced' ? 'average' : p.balanceMode
        if (bm) setBalanceMode(bm as BalanceMode)
      }
    } catch { /* ignore */ }
  }, [])

  function handleAdd() {
    if (!newName.trim()) return
    addCategory({ name: newName.trim(), emoji: newEmoji, color: newColor })
    setNewName(""); setNewEmoji("✨"); setNewColor('blue'); setIsAdding(false)
  }

  // ── Per-category stats ──
  const target = targetWorkPct(balanceMode)
  const totalActiveMin = tasks.filter(t => !t.done).reduce((a, t) => a + (t.estimated_minutes ?? 30), 0)

  function catStats(catName: string) {
    const all = tasks.filter(t => (t.category || 'Personal').toLowerCase() === catName.toLowerCase())
    const active = all.filter(t => !t.done)
    const done = all.filter(t => t.done)
    const activeMin = active.reduce((a, t) => a + (t.estimated_minutes ?? 30), 0)
    const workSharePct = totalActiveMin > 0 ? Math.round(activeMin / totalActiveMin * 100) : 0
    return { all, active, done, activeMin, workSharePct }
  }

  // Which work-type categories together exceed the target?
  const workMin = tasks.filter(t => !t.done && isWorkCat(t.category || 'Personal'))
    .reduce((a, t) => a + (t.estimated_minutes ?? 30), 0)
  const workPct = totalActiveMin > 0 ? Math.round(workMin / totalActiveMin * 100) : 0
  const overshootPct = Math.max(0, workPct - target)

  // Calendar
  const calYear = calMonth.getFullYear()
  const calMonthNum = calMonth.getMonth()
  const daysInMonth = new Date(calYear, calMonthNum + 1, 0).getDate()
  const startOffset = (() => { const d = new Date(calYear, calMonthNum, 1).getDay(); return d === 0 ? 6 : d - 1 })()
  // Calendar: use deadline if set, fall back to start_date (scheduled time)
  const tasksByDate = new Map<string, Task[]>()
  tasks.filter(t => !t.done).forEach(t => {
    const dateStr = (t.deadline ?? t.start_date) as string | null | undefined
    if (!dateStr) return
    const key = dateStr.slice(0, 10)
    tasksByDate.set(key, [...(tasksByDate.get(key) ?? []), t])
  })
  const noDeadlineTasks = tasks.filter(t => !t.done && !t.deadline && !t.start_date)

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-5">

        {/* Header */}
        <div className="page-header flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Categories</h1>
            <p className="text-sm text-slate-500 font-bold">
              {view === 'manage'   ? `${categories.length} categories · drag to reorder` :
               view === 'board'   ? 'Task status by category — what state is everything in?' :
                                    'Deadline view — when is it all due?'}
            </p>
          </div>
          {view === 'manage' && (
            <button onClick={() => setIsAdding(!isAdding)} className="glow-button font-bold px-4 py-2 text-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add
            </button>
          )}
        </div>

        {/* View switcher */}
        <div className="flex gap-1 glass-panel rounded-2xl p-1.5 shadow-md w-fit">
          {([
            { id: 'manage'   as const, icon: Settings2,   label: 'Manage',   sub: 'What do I have?' },
            { id: 'board'    as const, icon: LayoutGrid,  label: 'Board',    sub: 'What state is it in?' },
            { id: 'calendar' as const, icon: CalendarDays, label: 'Calendar', sub: 'When is it due?' },
          ]).map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => setView(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                view === id ? 'nav-item-active' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* ── MANAGE VIEW ── */}
        {view === 'manage' && (
          <div className="space-y-4 max-w-2xl">

            {/* Balance overshoot banner */}
            {overshootPct > 0 && totalActiveMin > 0 && (
              <div className="bg-gradient-to-r from-orange-50/90 to-amber-50/90 border-2 border-orange-300/70 rounded-2xl px-4 py-3 flex items-start gap-3 shadow-md">
                <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5 drop-shadow-sm" />
                <div className="text-xs text-orange-700">
                  <span className="font-black text-orange-800">Work overload detected.</span> Work-type categories use <strong>{workPct}%</strong> of your estimated time — {overshootPct}% above your <strong>{target}%</strong> {balanceMode} target. Categories highlighted in orange are the main contributors.
                </div>
              </div>
            )}

            {/* Add form */}
            <AnimatePresence>
              {isAdding && (
                <motion.div key="add" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="skeu-card p-5">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-sky-500" /> New Category
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-[3rem_1fr] gap-3">
                      <input type="text" value={newEmoji} onChange={e => setNewEmoji(e.target.value)} maxLength={2}
                        className="input-skeu text-center text-xl p-2 rounded-xl border border-white/60 focus:outline-none focus:ring-2 focus:ring-sky-400"
                        placeholder="✨" />
                      <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                        className="input-skeu w-full p-3 rounded-xl border border-white/60 focus:outline-none focus:ring-2 focus:ring-sky-400 text-sm font-semibold"
                        placeholder="Category name (e.g. Fitness, Chores)" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleAdd() }} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1.5"><Palette className="w-3 h-3" /> Color</p>
                      <div className="flex flex-wrap gap-2">
                        {COLOR_OPTIONS.map(opt => (
                          <button key={opt.key} onClick={() => setNewColor(opt.key)}
                            className={`w-8 h-8 rounded-full ${opt.dot} border-2 transition-all ${newColor === opt.key ? 'border-slate-800 scale-110 shadow-md' : 'border-transparent opacity-70 hover:opacity-100'}`} />
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-1">
                      <button onClick={() => setIsAdding(false)} className="text-slate-500 font-bold px-4 py-2 hover:bg-white/40 rounded-xl transition-colors text-sm">Cancel</button>
                      <button onClick={handleAdd} disabled={!newName.trim()} className="glow-button font-bold px-6 py-2 text-sm disabled:opacity-50">Save</button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Category cards */}
            <div className="space-y-2">
              {categories.map((cat, i) => {
                const colorData = getCategoryClasses(cat.color)
                const stats = catStats(cat.name)
                const isWork = isWorkCat(cat.name)
                const overshootCat = isWork && overshootPct > 0
                const isDragging = draggingId === cat.id
                const isOver = dragOverId === cat.id
                const isExpanded = expandedCat === cat.id
                const showBar = stats.all.length >= 5
                const donePct = stats.all.length > 0 ? Math.round(stats.done.length / stats.all.length * 100) : 0
                const isEmpty = stats.active.length === 0

                return (
                  <motion.div
                    key={cat.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: isDragging ? 0.4 : 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    draggable
                    onDragStart={() => setDraggingId(cat.id)}
                    onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
                    onDragOver={e => { e.preventDefault(); setDragOverId(cat.id) }}
                    onDrop={() => { if (draggingId && draggingId !== cat.id) reorderCategories(draggingId, cat.id); setDraggingId(null); setDragOverId(null) }}
                    className={`rounded-2xl border transition-all duration-150 ${
                      overshootCat
                        ? 'bg-orange-50/80 border-orange-200'
                        : `bg-white/60 ${colorData.bg.replace('bg-', 'border-').replace('/90', '/40')}`
                    } ${isOver && !isDragging ? 'ring-2 ring-sky-400 ring-offset-1' : ''}`}
                  >
                    {/* Card header — always visible */}
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      {/* Drag handle */}
                      <GripVertical className="w-4 h-4 text-slate-300 shrink-0 cursor-grab active:cursor-grabbing" />

                      {/* Emoji + color swatch */}
                      <div className={`w-8 h-8 rounded-lg ${colorData.bg} flex items-center justify-center text-sm border border-white/50 shrink-0`}>
                        {cat.emoji}
                      </div>

                      {/* Name + stats */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-black text-sm ${overshootCat ? 'text-orange-700' : colorData.text}`}>{cat.name}</span>
                          {overshootCat && (
                            <span className="text-[9px] font-black bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full border border-orange-200">
                              ↑{stats.workSharePct}% work load
                            </span>
                          )}
                          {isWork && !overshootCat && (
                            <span className="text-[9px] font-bold text-slate-400">{stats.workSharePct}% of work time</span>
                          )}
                        </div>
                        {isEmpty ? (
                          <p className="text-[10px] text-slate-400 font-bold">Empty</p>
                        ) : (
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[10px] text-slate-500 font-bold">{stats.active.length} active</p>
                            {stats.done.length > 0 && <p className="text-[10px] text-slate-400">· {stats.done.length} done</p>}
                            {showBar && (
                              <div className="flex-1 max-w-[80px] progress-track h-2 overflow-hidden">
                                <div className={`h-full ${overshootCat ? '!bg-gradient-to-r from-orange-400 to-orange-500' : 'progress-aero'} transition-all duration-500`}
                                  style={{ width: `${donePct}%` }} />
                              </div>
                            )}
                            {showBar && <span className="text-[10px] text-slate-400 font-bold">{donePct}%</span>}
                          </div>
                        )}
                      </div>

                      {/* Expand toggle (only if has active tasks) */}
                      {stats.active.length > 0 && (
                        <button onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                          className="text-slate-400 hover:text-slate-600 transition-colors p-1">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      )}

                      {/* Delete */}
                      <button onClick={() => deleteCategory(cat.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Expanded task list */}
                    <AnimatePresence>
                      {isExpanded && stats.active.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 pt-1 border-t border-white/50 space-y-1.5 mt-1">
                            {stats.active.map(t => (
                              <div key={t.id} className="flex items-center gap-2 text-xs text-slate-700 bg-white/50 px-3 py-2 rounded-xl">
                                <CheckCircle className={`w-3.5 h-3.5 shrink-0 ${colorData.text}`} />
                                <span className="flex-1 font-semibold truncate">{t.name}</span>
                                {t.deadline && (
                                  <span className={`text-[10px] font-bold shrink-0 ${isDueWithin48h(t.deadline) ? 'text-red-500' : 'text-slate-400'}`}>
                                    {new Date(t.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </div>

            <div className="pt-2 flex justify-center">
              <button onClick={() => { if (confirm('Reset all categories to defaults?')) resetToDefaults() }}
                className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-600 font-bold transition-colors bg-white/40 px-4 py-2 rounded-full border border-white/60 shadow-sm">
                <RefreshCw className="w-3 h-3" /> Reset to defaults
              </button>
            </div>
          </div>
        )}

        {/* ── BOARD VIEW ── active / done per category column ── */}
        {view === 'board' && (
          <div className="space-y-3">
            {/* Balance ratio bar at top */}
            {totalActiveMin > 0 && (
              <div className="skeu-card px-4 py-3 flex items-center gap-3">
                <span className="text-xs font-black text-slate-500 shrink-0">Work ratio</span>
                <div className="flex-1 relative progress-track h-4 overflow-hidden">
                  <div className={`h-full transition-all duration-500 ${workPct > target + 10 ? '!bg-gradient-to-r from-orange-400 via-red-400 to-orange-500' : 'progress-aero !bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500'}`}
                    style={{ width: `${workPct}%` }} />
                  <div className="absolute top-0 h-full w-px bg-white/50" style={{ left: `${target}%` }} />
                </div>
                <span className={`text-xs font-black shrink-0 ${workPct > target + 10 ? 'text-orange-600' : 'text-emerald-600'}`}>
                  {workPct}% / {target}% target
                </span>
              </div>
            )}

            <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
              {categories.map(cat => {
                const cls = getCategoryClasses(cat.color)
                const stats = catStats(cat.name)
                const overshootCat = isWorkCat(cat.name) && overshootPct > 0
                return (
                  <div key={cat.id} className={`w-52 flex-shrink-0 rounded-2xl overflow-hidden border ${overshootCat ? 'border-orange-200 bg-orange-50/40' : 'border-sky-100/40 bg-white/50'} shadow-sm`}>
                    {/* Column header */}
                    <div className={`px-3 py-2.5 flex items-center gap-2 border-b ${overshootCat ? 'border-orange-200 bg-orange-50' : `border-sky-100/50 ${cls.bg}`}`}>
                      <span className="text-sm">{cat.emoji}</span>
                      <span className={`font-black text-xs flex-1 ${overshootCat ? 'text-orange-700' : cls.text}`}>{cat.name}</span>
                      <span className="text-[10px] text-slate-400 font-bold">{stats.active.length} active</span>
                    </div>

                    <div className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
                      {/* Active section */}
                      {stats.active.length > 0 && (
                        <>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 pt-1">Active</p>
                          {stats.active.map(task => (
                            <div key={task.id} className={`skeu-card p-2 border-l-2 ${overshootCat ? 'border-l-orange-300' : 'border-l-sky-200'}`}>
                              <p className="text-[10px] font-bold text-slate-700 leading-snug">{task.name}</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {task.deadline && (
                                  <span className={`text-[9px] px-1 py-0.5 rounded-full font-bold flex items-center gap-0.5 ${isDueWithin48h(task.deadline) ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-slate-500'}`}>
                                    <Calendar className="w-2 h-2" />
                                    {new Date(task.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                  </span>
                                )}
                                {task.estimated_minutes && <span className="text-[9px] text-slate-400 font-bold">{task.estimated_minutes}m</span>}
                              </div>
                            </div>
                          ))}
                        </>
                      )}

                      {/* Completed section (last 3) */}
                      {stats.done.length > 0 && (
                        <>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 pt-2">Done · {stats.done.length}</p>
                          {stats.done.slice(-3).map(task => (
                            <div key={task.id} className="p-2 bg-slate-50/60 rounded-lg border border-slate-100">
                              <p className="text-[10px] text-slate-400 line-through leading-snug">{task.name}</p>
                            </div>
                          ))}
                        </>
                      )}

                      {stats.all.length === 0 && (
                        <div className="text-center py-6 text-slate-300">
                          <CheckCircle className="w-6 h-6 mx-auto mb-1 opacity-30" />
                          <p className="text-[10px] font-bold">Empty</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── CALENDAR VIEW ── */}
        {view === 'calendar' && (
          <div className="glass-panel p-4 space-y-3">
            <div className="flex items-center justify-between">
              <button onClick={() => setCalMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return d })}
                className="w-8 h-8 rounded-full bg-white/60 border border-sky-100/60 flex items-center justify-center text-slate-500 hover:text-sky-700 transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h3 className="font-black text-slate-700">{MONTH_NAMES[calMonthNum]} {calYear}</h3>
              <button onClick={() => setCalMonth(m => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return d })}
                className="w-8 h-8 rounded-full bg-white/60 border border-sky-100/60 flex items-center justify-center text-slate-500 hover:text-sky-700 transition-all">
                <ChevronLeft className="w-4 h-4 rotate-180" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {DAY_NAMES.map(d => (
                <div key={d} className="text-center text-[10px] font-black text-slate-400 uppercase tracking-wider py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: startOffset }).map((_, i) => <div key={`off-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const dateKey = `${calYear}-${String(calMonthNum + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const dayTasks = tasksByDate.get(dateKey) ?? []
                const today = new Date()
                const isToday = today.getFullYear() === calYear && today.getMonth() === calMonthNum && today.getDate() === day
                const isPast = new Date(calYear, calMonthNum, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate())
                return (
                  <div key={day} className={`min-h-[64px] rounded-xl p-1.5 border transition-all ${
                    isToday    ? 'bg-sky-100/80 border-sky-300/60' :
                    dayTasks.length > 0 ? 'bg-white/60 border-sky-100/60' :
                    isPast     ? 'bg-slate-50/30 border-slate-100/30' :
                                 'bg-white/30 border-sky-100/30'
                  }`}>
                    <p className={`text-[11px] font-black mb-1 ${isToday ? 'text-sky-700' : isPast ? 'text-slate-300' : 'text-slate-400'}`}>{day}</p>
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 2).map(task => {
                        const cat = categories.find(c => c.name.toLowerCase() === (task.category || 'Personal').toLowerCase())
                        const cls = getCategoryClasses(cat?.color ?? 'sky')
                        return (
                          <div key={task.id} className={`text-[9px] px-1 py-0.5 rounded font-bold truncate ${cls.bg} ${cls.text}`} title={task.name}>
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

            {noDeadlineTasks.length > 0 && (
              <div className="border-t border-sky-100/50 pt-3">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">No deadline · {noDeadlineTasks.length}</p>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {noDeadlineTasks.map(task => {
                    const cat = categories.find(c => c.name.toLowerCase() === (task.category || 'Personal').toLowerCase())
                    const cls = getCategoryClasses(cat?.color ?? 'sky')
                    return (
                      <div key={task.id} className={`flex items-center gap-2 p-2 skeu-card border-l-4 ${cls.bg.replace('bg-', 'border-l-')}`}>
                        <span className="text-sm shrink-0">{cat?.emoji ?? '📌'}</span>
                        <p className="text-xs font-bold text-slate-700 flex-1 truncate">{task.name}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {tasks.filter(t => !t.done).length === 0 && (
              <div className="text-center py-8 text-slate-400 font-bold text-sm">No active tasks.</div>
            )}
          </div>
        )}

      </div>
    </AppLayout>
  )
}
