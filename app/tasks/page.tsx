"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { CheckCircle, Circle, Trash2, Calendar, Plus, Filter, RefreshCw, Sparkles, Loader2 } from "lucide-react"
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
  cognitive: 'bg-blue-50 text-blue-600',
  emotional: 'bg-rose-50 text-rose-600',
  creative: 'bg-purple-50 text-purple-600',
  routine: 'bg-slate-100 text-slate-600',
  physical: 'bg-emerald-50 text-emerald-600',
}

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
          const mapped = data.map(t => ({ ...t, category: t.category || t.life_domain || 'Personal' }))
          setTasks(mapped as Task[])
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
    const data: TaskSignalData = {
      undoneCount: undone.length,
      doneCount: updated.filter(t => t.done).length,
      addedLast7Days: updated.filter(t => t.createdAt > sevenDaysAgo).length,
      completedLast7Days: updated.filter(t => t.done && t.createdAt > sevenDaysAgo).length,
      tasksWithDeadlines: undone.filter(t => t.deadline).length,
      tasksDueWithin48h: undone.filter(t => isDueWithin48h(t.deadline, now || Date.now())).length,
      demandTypeCounts,
    }
    computeAndTransition(data)
  }, [computeAndTransition, now])

  async function breakdownTask(id: string) {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    
    setBreakingDownId(id)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: task.name, 
          mode: 'breakdown',
          categories: categories.map(c => c.name) 
        }),
      })
      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      
      if (data.tasks?.length) {
        const subTasks: Task[] = data.tasks.map((t: any) => ({
          ...t,
          id: Math.random().toString(36).slice(2),
          done: false,
          createdAt: Date.now(),
          deadline: task.deadline // inherit deadline
        }))
        
        // Replace old task with subtasks
        const updated = tasks.flatMap(t => t.id === id ? subTasks : [t])
        setTasks(updated)
        syncAndCompute(updated)
      }
    } catch (err) {
      console.error("Failed to breakdown task", err)
      alert("Failed to break down task. Make sure you are connected to the internet.")
    } finally {
      setBreakingDownId(null)
    }
  }

  function toggle(id: string) {
    const task = tasks.find(t => t.id === id)
    if (!task) return

    let updated = tasks.map(t => t.id === id ? { ...t, done: !t.done } : t)
    
    // Handle recurring tasks on completion
    if (!task.done && (task.recurring === 'daily' || task.recurring === 'weekly')) {
      const today = new Date()
      const nextDate = task.deadline ? new Date(task.deadline) : today
      if (task.recurring === 'daily') nextDate.setDate(nextDate.getDate() + 1)
      if (task.recurring === 'weekly') nextDate.setDate(nextDate.getDate() + 7)
      
      const newTask: Task = {
        ...task,
        id: Math.random().toString(36).slice(2),
        done: false,
        createdAt: Date.now(),
        deadline: nextDate.toISOString().split('T')[0]
      }
      updated = [...updated, newTask]
    }

    setTasks(updated)
    syncAndCompute(updated)
  }

  function remove(id: string) {
    const updated = tasks.filter(t => t.id !== id)
    setTasks(updated)
    syncAndCompute(updated)
  }

  const visible = tasks.filter(t =>
    filter === 'all' ? true : filter === 'active' ? !t.done : t.done
  )

  const mc = shouldReduceMotion ? { duration: 0 } : { duration: 0.18 }

  return (
    <AppLayout>
      <div className="max-w-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Tasks</h1>
            <p className="text-sm text-slate-500">{tasks.filter(t => !t.done).length} active · {tasks.filter(t => t.done).length} done</p>
          </div>
          <Link href="/tasks/new" className="glow-button text-white font-bold px-4 py-2.5 rounded-xl text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Tasks
          </Link>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {(['active', 'all', 'done'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filter === f ? 'bg-sky-100 text-sky-700 border border-sky-200' : 'bg-white/50 text-slate-500 border border-white/40 hover:bg-white/70'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5" /> {visible.length} shown
          </span>
        </div>

        {/* Rest mode notice */}
        {overwhelmedState !== 'normal' && (
          <div className={`rounded-2xl px-4 py-3 text-sm flex items-center gap-2 ${
            overwhelmedState === 'elevated' ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-pink-50 border border-pink-200 text-pink-700'
          }`}>
            {overwhelmedState === 'elevated'
              ? '⚠ Elevated state — consider completing tasks before adding more.'
              : '🌿 Rest mode active — focus on essential tasks only.'}
          </div>
        )}

        {/* Task list */}
        <div className="glass-panel p-4 space-y-2">
          <AnimatePresence>
            {visible.map(task => {
              const catName = (task.category || 'Personal').toLowerCase()
              const cat = categories.find(c => c.name.toLowerCase() === catName || c.id === task.category)
              const cls = getCategoryClasses(cat?.color ?? 'sky')
              return (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={mc}
                  className={`flex items-start gap-3 rounded-2xl p-4 border-l-4 transition-all ${
                    cls.bg.replace('bg-', 'border-l-')
                  } ${task.done ? 'bg-white/30 opacity-60' : 'bg-white/60'}`}
                >
                  <button onClick={() => toggle(task.id)} className="shrink-0 mt-0.5">
                    {task.done
                      ? <CheckCircle className="w-5 h-5 text-emerald-500" />
                      : <Circle className="w-5 h-5 text-slate-300 hover:text-slate-400" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm ${task.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {task.name}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls.bg} ${cls.text} badge-skeu shrink-0`}>
                        {cat?.emoji ?? '📌'} {task.category}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DEMAND_COLORS[task.demand_type]}`}>{task.demand_type}</span>
                      <span className="text-xs text-slate-400 font-mono">{difficultyDots(task.difficulty)}</span>
                    {task.recurring && task.recurring !== 'none' && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-600 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" /> {task.recurring}
                      </span>
                    )}
                    {task.estimated_minutes && <span className="text-xs text-slate-400">{task.estimated_minutes}m</span>}
                    {task.deadline && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                        isDueWithin48h(task.deadline, now) ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
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
                      <button 
                        onClick={() => breakdownTask(task.id)} 
                        disabled={breakingDownId === task.id}
                        className="text-sky-400 hover:text-sky-600 transition-colors mt-0.5 disabled:opacity-50"
                        title="AI Break Down"
                      >
                        {breakingDownId === task.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      </button>
                    )}
                    <button onClick={() => remove(task.id)} className="text-slate-300 hover:text-red-400 transition-colors mt-0.5">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    </div>
                    </motion.div>
                    )
                    })}
          </AnimatePresence>

          {visible.length === 0 && (
            <div className="text-center py-10 text-slate-400">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{filter === 'done' ? 'No completed tasks yet.' : 'No tasks. Add some!'}</p>
              {filter !== 'done' && (
                <Link href="/tasks/new" className="inline-flex items-center gap-1.5 mt-3 text-sky-500 text-sm font-medium hover:text-sky-700">
                  <Plus className="w-4 h-4" /> Add your first task
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
