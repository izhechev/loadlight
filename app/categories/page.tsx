"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Trash2, Tag, RefreshCw, Palette, ChevronDown, ChevronRight, CheckCircle, List, LayoutGrid, CalendarDays, Calendar, ChevronLeft } from "lucide-react"
import { AppLayout } from "@/components/app-layout"
import { useCategoryStore, COLOR_OPTIONS, getCategoryClasses, type ColorKey } from "@/lib/store/categoryStore"

interface Task {
  id: string
  name: string
  category: string
  demand_type: string
  difficulty: number
  deadline: string | null
  estimated_minutes: number | null
  done: boolean
  createdAt: number
  recurring?: string
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function isDueWithin48h(deadline: string | null): boolean {
  if (!deadline) return false
  const ms = new Date(deadline).getTime() - Date.now()
  return ms >= 0 && ms <= 172800000
}

export default function CategoriesPage() {
  const { categories, addCategory, deleteCategory, resetToDefaults } = useCategoryStore()
  const [view, setView] = useState<'manage' | 'board' | 'calendar'>('manage')
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [newEmoji, setNewEmoji] = useState("✨")
  const [newColor, setNewColor] = useState<ColorKey>('blue')
  const [tasks, setTasks] = useState<Task[]>([])
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const [calMonth, setCalMonth] = useState(() => new Date())

  useEffect(() => {
    try {
      const t = localStorage.getItem('loadlight-tasks')
      if (t) setTasks(JSON.parse(t))
    } catch { /* ignore */ }
  }, [])

  function handleAdd() {
    if (!newName.trim()) return
    addCategory({ name: newName.trim(), emoji: newEmoji, color: newColor })
    setNewName("")
    setNewEmoji("✨")
    setNewColor('blue')
    setIsAdding(false)
  }

  const activeTasks = tasks.filter(t => !t.done)

  // Group active tasks by category
  const grouped: { cat: typeof categories[0]; tasks: Task[] }[] = []
  categories.forEach(cat => {
    const catTasks = activeTasks.filter(t =>
      (t.category || 'Personal').toLowerCase() === cat.name.toLowerCase() || t.category === cat.id
    )
    if (catTasks.length > 0) grouped.push({ cat, tasks: catTasks })
  })

  // Calendar data
  const calYear = calMonth.getFullYear()
  const calMonthNum = calMonth.getMonth()
  const daysInMonth = new Date(calYear, calMonthNum + 1, 0).getDate()
  const firstDayOfWeek = new Date(calYear, calMonthNum, 1).getDay()
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1
  const tasksByDate = new Map<string, Task[]>()
  activeTasks.filter(t => t.deadline).forEach(t => {
    const arr = tasksByDate.get(t.deadline!) ?? []
    tasksByDate.set(t.deadline!, [...arr, t])
  })
  const noDeadlineTasks = activeTasks.filter(t => !t.deadline)

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="page-header flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Categories</h1>
            <p className="text-sm text-slate-500 font-bold">
              {view === 'manage' ? 'Manage tags for your tasks. The AI will use these.' : `${activeTasks.length} active tasks`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {view === 'manage' && (
              <button onClick={() => setIsAdding(!isAdding)} className="glow-button font-bold px-4 py-2 text-sm flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Category
              </button>
            )}
          </div>
        </div>

        {/* View switcher */}
        <div className="flex gap-1 bg-white/60 rounded-xl p-1 border border-sky-100/60 shadow-sm w-fit">
          {([
            { id: 'manage' as const, icon: Tag, label: 'Manage' },
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

        {/* ── MANAGE VIEW ── */}
        {view === 'manage' && (
          <div className="max-w-xl space-y-4">
            {isAdding && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="skeu-card p-5">
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
                      placeholder="Category Name (e.g. Fitness, Chores)" autoFocus />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1.5"><Palette className="w-3 h-3" /> Select Color</p>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.map(opt => (
                        <button key={opt.key} onClick={() => setNewColor(opt.key)}
                          className={`w-8 h-8 rounded-full ${opt.dot} border-2 transition-all ${newColor === opt.key ? 'border-slate-800 scale-110 shadow-md' : 'border-transparent opacity-70 hover:opacity-100'}`} />
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setIsAdding(false)} className="text-slate-500 font-bold px-4 py-2 hover:bg-white/40 rounded-xl transition-colors text-sm">Cancel</button>
                    <button onClick={handleAdd} disabled={!newName.trim()} className="glow-button font-bold px-6 py-2 text-sm disabled:opacity-50">Save</button>
                  </div>
                </div>
              </motion.div>
            )}

            <div className="space-y-3">
              {categories.map((cat, i) => {
                const colorData = COLOR_OPTIONS.find(c => c.key === cat.color) || COLOR_OPTIONS[0]
                const catTasks = tasks.filter(t => (t.category || 'Personal').toLowerCase() === cat.name.toLowerCase() && !t.done)
                const isExpanded = expandedCat === cat.id
                return (
                  <motion.div key={cat.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className={`flex flex-col p-4 rounded-2xl border bg-white/60 shadow-inner-sm ${colorData.bg.replace('bg-', 'border-')}`}>
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => setExpandedCat(isExpanded ? null : cat.id)}>
                        <div className={`w-10 h-10 rounded-xl ${colorData.bg} flex items-center justify-center text-lg border border-white/50 shadow-inner`}>{cat.emoji}</div>
                        <div className="flex-1">
                          <span className={`font-black ${colorData.text}`}>{cat.name}</span>
                          <p className="text-xs text-slate-500 font-bold mt-0.5">{catTasks.length} active task{catTasks.length !== 1 ? 's' : ''}</p>
                        </div>
                        {catTasks.length > 0 && (
                          <div className="text-slate-400 mr-2">
                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                          </div>
                        )}
                      </div>
                      <button onClick={() => deleteCategory(cat.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete Category">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <AnimatePresence>
                      {isExpanded && catTasks.length > 0 && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <div className="pt-4 space-y-2 mt-2 border-t border-white/50">
                            {catTasks.map(t => (
                              <div key={t.id} className="flex items-start gap-2 text-sm text-slate-700 bg-white/50 p-2 rounded-lg">
                                <CheckCircle className={`w-4 h-4 mt-0.5 shrink-0 ${colorData.text}`} />
                                <span className="font-semibold">{t.name}</span>
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

            <div className="pt-4 flex justify-center">
              <button onClick={() => { if (confirm('Reset all categories to defaults?')) resetToDefaults() }}
                className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-600 font-bold transition-colors bg-white/40 px-4 py-2 rounded-full border border-white/60 shadow-sm">
                <RefreshCw className="w-3.5 h-3.5" /> Reset to Default Categories
              </button>
            </div>
          </div>
        )}

        {/* ── BOARD VIEW ── */}
        {view === 'board' && (
          <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4">
            {grouped.length === 0 ? (
              <div className="glass-panel p-10 text-center text-slate-500 font-bold w-full">
                <CheckCircle className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No active tasks.</p>
              </div>
            ) : grouped.map(({ cat, tasks: catTasks }) => {
              const cls = getCategoryClasses(cat.color)
              return (
                <div key={cat.id} className="w-52 flex-shrink-0 glass-panel overflow-hidden">
                  <div className={`px-3 py-2.5 flex items-center gap-2 border-b border-sky-100/50 ${cls.bg}`}>
                    <span className="text-sm">{cat.emoji}</span>
                    <span className={`font-black text-xs ${cls.text}`}>{cat.name}</span>
                    <span className="ml-auto text-xs text-slate-400 font-bold">{catTasks.length}</span>
                  </div>
                  <div className="p-2 space-y-2 max-h-[65vh] overflow-y-auto">
                    {catTasks.map(task => {
                      return (
                        <div key={task.id} className={`skeu-card p-2.5 border-l-4 ${cls.bg.replace('bg-', 'border-l-')}`}>
                          <p className="text-xs font-bold text-slate-800 leading-snug">{task.name}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {task.deadline && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5 ${isDueWithin48h(task.deadline) ? 'bg-red-50 text-red-600' : 'bg-sky-50/80 text-slate-500'}`}>
                                <Calendar className="w-2.5 h-2.5" />
                                {new Date(task.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                            {task.estimated_minutes && <span className="text-[9px] text-slate-400 font-bold">{task.estimated_minutes}m</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
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
                <div className="space-y-1.5">
                  {noDeadlineTasks.map(task => {
                    const cat = categories.find(c => c.name.toLowerCase() === (task.category || 'Personal').toLowerCase())
                    const cls = getCategoryClasses(cat?.color ?? 'sky')
                    return (
                      <div key={task.id} className={`flex items-center gap-2 p-2.5 skeu-card border-l-4 ${cls.bg.replace('bg-', 'border-l-')}`}>
                        <span className="text-sm">{cat?.emoji ?? '📌'}</span>
                        <p className="text-xs font-bold text-slate-700 flex-1">{task.name}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${cls.bg} ${cls.text}`}>{task.category}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {activeTasks.length === 0 && (
              <div className="text-center py-8 text-slate-400 font-bold text-sm">No active tasks with deadlines.</div>
            )}
          </div>
        )}

      </div>
    </AppLayout>
  )
}
