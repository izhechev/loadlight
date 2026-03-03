"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { TrendingUp, Brain, Loader2, RefreshCw, Plus, ChevronRight, CheckCircle, AlertTriangle, Smile, Meh, Frown } from "lucide-react"
import { AppLayout } from "@/components/app-layout"
import { useOverwhelmedStore, type DemandType, type TaskSignalData } from "@/lib/store/overwhelmedStore"
import { useCategoryStore, getCategoryClasses } from "@/lib/store/categoryStore"

type BalanceMode = 'beast' | 'balanced' | 'chill'

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

interface AnalysisResult {
  verdict: 'overloaded' | 'balanced' | 'light'
  trend: string
  advice: string
  suggestion: string
}

const WORK_CATEGORIES = ['work', 'study', 'administrative', 'creative', 'Work', 'Study', 'Admin', 'Creative', 'Administrative', 'Exercise', 'exercise']

function isDueWithin48h(d: string | null) {
  if (!d) return false
  const ms = new Date(d).getTime() - Date.now()
  return ms >= 0 && ms <= 172800000
}

const STATE_INFO = {
  normal: {
    icon: Smile,
    color: 'text-emerald-400',
    bg: 'from-emerald-900/40 to-teal-900/40',
    border: 'border-emerald-500/30',
    headline: "You're managing well",
    sub: "Your workload looks balanced. Keep it up!",
  },
  elevated: {
    icon: Meh,
    color: 'text-amber-400',
    bg: 'from-amber-900/40 to-yellow-900/40',
    border: 'border-amber-500/30',
    headline: "Your plate is getting full",
    sub: "Things are building up. Consider completing a task before adding more.",
  },
  overwhelmed: {
    icon: Frown,
    color: 'text-rose-400',
    bg: 'from-rose-900/40 to-pink-900/40',
    border: 'border-rose-500/30',
    headline: "Time to take a breather",
    sub: "Rest mode is active. Focus on what truly matters right now.",
  },
}

export default function DashboardPage() {
  const shouldReduceMotion = useReducedMotion()
  const { state, computeAndTransition } = useOverwhelmedStore()
  const { categories } = useCategoryStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('balanced')
  const [weeklyAnalysis, setWeeklyAnalysis] = useState<AnalysisResult | null>(null)
  const [isAnalysing, setIsAnalysing] = useState(false)

  useEffect(() => {
    try {
      const t = localStorage.getItem('loadlight-tasks')
      if (t) {
        const data = JSON.parse(t) as any[]
        setTasks(data.map(tsk => ({ ...tsk, category: tsk.category || tsk.life_domain || 'Personal' })) as Task[])
      }
      const u = localStorage.getItem('loadlight-user')
      if (u) {
        const p = JSON.parse(u) as { balanceMode?: BalanceMode }
        if (p.balanceMode) setBalanceMode(p.balanceMode)
      }
    } catch { /* ignore */ }
  }, [])

  const updateState = useCallback(() => {
    if (!tasks.length) return
    const sevenDaysAgo = Date.now() - 604800000
    const undoneTasks = tasks.filter(t => !t.done)
    const demandTypeCounts: Record<DemandType, number> = { cognitive: 0, emotional: 0, creative: 0, routine: 0, physical: 0 }
    undoneTasks.forEach(t => { demandTypeCounts[t.demand_type]++ })
    
    const totalUndoneDifficulty = undoneTasks.reduce((acc, t) => acc + (t.difficulty || 2), 0)
    const totalUndoneMinutes = undoneTasks.reduce((acc, t) => acc + (t.estimated_minutes || 30), 0)

    computeAndTransition({
      undoneCount: undoneTasks.length,
      doneCount: tasks.filter(t => t.done).length,
      addedLast7Days: tasks.filter(t => t.createdAt > sevenDaysAgo).length,
      completedLast7Days: tasks.filter(t => t.done && t.createdAt > sevenDaysAgo).length,
      tasksWithDeadlines: undoneTasks.filter(t => t.deadline).length,
      tasksDueWithin48h: undoneTasks.filter(t => isDueWithin48h(t.deadline)).length,
      demandTypeCounts,
      totalUndoneDifficulty,
      totalUndoneMinutes,
    } as TaskSignalData)
  }, [tasks, computeAndTransition])

  useEffect(() => { updateState() }, [tasks, updateState])

  const undoneTasks = tasks.filter(t => !t.done)
  const activeMin = undoneTasks.reduce((acc, t) => acc + (t.estimated_minutes ?? 30), 0)
  const workMin = undoneTasks.filter(t => WORK_CATEGORIES.some(w => t.category?.toLowerCase().includes(w.toLowerCase()))).reduce((acc, t) => acc + (t.estimated_minutes ?? 30), 0)
  const targetWork = balanceMode === 'beast' ? 70 : balanceMode === 'balanced' ? 50 : 30
  const workPct = activeMin > 0 ? Math.round(workMin / activeMin * 100) : 0
  const donePct = tasks.length > 0 ? Math.round(tasks.filter(t => t.done).length / tasks.length * 100) : 0
  const pendingTasks = undoneTasks.slice(0, 5)
  const dueSoon = undoneTasks.filter(t => isDueWithin48h(t.deadline))

  async function fetchSummary() {
    setIsAnalysing(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'weekly', tasks, balanceMode }),
      })
      const data = await res.json() as AnalysisResult
      setWeeklyAnalysis(data)
    } catch {
      setWeeklyAnalysis({ verdict: 'balanced', trend: 'Could not load summary.', advice: 'Try again when connected.', suggestion: 'Check your internet connection.' })
    } finally {
      setIsAnalysing(false)
    }
  }

  const mc = shouldReduceMotion ? { duration: 0 } : { duration: 0.25, type: 'spring' as const, bounce: 0.15 }
  const si = STATE_INFO[state]
  const StateIcon = si.icon

  return (
    <AppLayout>
      <div className="space-y-4 max-w-4xl mx-auto">

        {/* ── Wellbeing card ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={mc}
          className={`skeu-card p-5 border bg-gradient-to-br ${si.bg} ${si.border}`}
        >
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl bg-white/70 flex items-center justify-center shadow-inner border border-white/80 shrink-0`}>
              <StateIcon className={`w-7 h-7 ${si.color}`} />
            </div>
            <div className="flex-1">
              <p className={`font-black text-xl ${si.color}`}>{si.headline}</p>
              <p className="text-sm text-slate-500 mt-0.5">{si.sub}</p>
            </div>
            <div className="hidden sm:flex flex-col items-end gap-1">
              <span className="text-xs text-slate-400">This week</span>
              <span className="text-2xl font-black text-slate-700">{tasks.filter(t => !t.done).length}</span>
              <span className="text-xs text-slate-400">tasks left</span>
            </div>
          </div>
        </motion.div>

        {/* ── Stats row ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...mc, delay: 0.05 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          {([
            ['Total tasks', tasks.length, 'text-sky-300', '📋'],
            ['Completed', tasks.filter(t => t.done).length, 'text-emerald-300', '✅'],
            ['Hours estimated', `${Math.round(activeMin / 60 * 10) / 10}h`, 'text-purple-300', '⏱'],
            ['Due soon', dueSoon.length, dueSoon.length > 0 ? 'text-red-400' : 'text-slate-400', '⚡'],
          ] as [string, string | number, string, string][]).map(([label, val, color, emoji]) => (
            <div key={label} className="skeu-card p-4 text-center bg-black/20 border-white/5">
              <div className="text-xl mb-1">{emoji}</div>
              <p className={`text-2xl font-black ${color}`}>{val}</p>
              <p className="text-xs text-slate-300 mt-0.5 font-medium">{label}</p>
            </div>
          ))}
        </motion.div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* ── Balance card ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...mc, delay: 0.08 }}
            className="skeu-card p-5 bg-black/20 border-white/5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                <h2 className="font-black text-white">Balance</h2>
              </div>
              <span className="text-xs text-slate-300 bg-white/10 px-2.5 py-1 rounded-full border border-white/10 badge-skeu">
                {balanceMode === 'beast' ? '⚡ Beast' : balanceMode === 'chill' ? '🌿 Chill' : '⚖️ Average'}
              </span>
            </div>

            {/* Visual gauge */}
            <div className="mb-3">
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-slate-200">Work <strong>{workPct}%</strong></span>
                <span className="text-slate-400">target {targetWork}%</span>
              </div>
              <div className="relative h-5 bg-black/40 rounded-full border border-white/10 overflow-hidden skeu-inset">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${workPct > targetWork + 15 ? 'bg-gradient-to-r from-orange-400 to-red-400' : 'bg-gradient-to-r from-sky-400 to-teal-400'}`}
                  style={{ width: `${workPct}%` }}
                />
                <div className="absolute top-0 h-full w-0.5 bg-white/20" style={{ left: `${targetWork}%` }} />
              </div>
            </div>

            {/* Completion bar */}
            <div>
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-slate-200">Progress</span>
                <span className="text-slate-400">{donePct}% done</span>
              </div>
              <div className="relative h-3 bg-black/40 rounded-full border border-white/10 overflow-hidden skeu-inset">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-700"
                  style={{ width: `${donePct}%` }}
                />
              </div>
            </div>

            {workPct > targetWork + 15 && (
              <div className="mt-3 bg-red-900/30 border border-red-500/20 rounded-2xl p-3 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-200">Work is taking over. Maybe move some tasks to next week?</p>
              </div>
            )}

            <Link href="/settings" className="flex items-center gap-1 text-xs text-sky-300 hover:text-white mt-3 font-medium transition-colors">
              Change balance goal <ChevronRight className="w-3 h-3" />
            </Link>
          </motion.div>

          {/* ── Pending tasks preview ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...mc, delay: 0.1 }}
            className="skeu-card p-5 bg-black/20 border-white/5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-sky-400" />
                <h2 className="font-black text-white">Up next</h2>
              </div>
              <Link href="/tasks" className="text-xs text-sky-300 hover:text-white font-medium flex items-center gap-1 transition-colors">
                See all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            {pendingTasks.length > 0 ? (
              <div className="space-y-2">
                {pendingTasks.map(t => {
                  const catName = (t.category || 'Personal').toLowerCase()
                  const cat = categories.find(c => c.name.toLowerCase() === catName || c.id === t.category)
                  const cls = getCategoryClasses(cat?.color ?? 'sky')
                  return (
                    <div key={t.id} className="flex items-center gap-3 bg-black/20 rounded-2xl p-3 border border-white/5 skeu-card shadow-lg">
                      <span className="text-base">{cat?.emoji ?? '📌'}</span>
                      <span className="flex-1 text-sm font-semibold text-white truncate">{t.name}</span>
                      {isDueWithin48h(t.deadline) && (
                        <span className="text-xs text-red-400 font-bold shrink-0">Due soon!</span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${cls.bg} ${cls.text} badge-skeu shrink-0 shadow-sm border border-white/10`}>
                        {t.category}
                      </span>
                    </div>
                  )
                })}
                {tasks.filter(t => !t.done).length > 5 && (
                  <p className="text-xs text-slate-400 text-center pt-1 font-bold">+{tasks.filter(t => !t.done).length - 5} more tasks</p>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-500/40" />
                <p className="text-sm text-slate-400 font-bold">All clear! Nothing pending.</p>
                <Link href="/tasks/new" className="inline-flex items-center gap-1.5 mt-3 text-sky-300 text-sm font-bold hover:text-white transition-colors">
                  <Plus className="w-4 h-4" /> Add tasks
                </Link>
              </div>
            )}
          </motion.div>
        </div>

        {/* ── AI Tip ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...mc, delay: 0.12 }}
          className="skeu-card p-5 bg-black/20 border-white/5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-400" />
              <h2 className="font-black text-white">AI Tip</h2>
              <span className="text-xs text-slate-400 font-bold">Analyses workload</span>
            </div>
            <button
              onClick={fetchSummary}
              disabled={isAnalysing}
              className="glow-button text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {isAnalysing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {isAnalysing ? 'Thinking...' : 'Generate'}
            </button>
          </div>

          {weeklyAnalysis ? (
            <div className="space-y-3">
              <div className={`rounded-2xl px-4 py-3 font-black text-sm border ${
                weeklyAnalysis.verdict === 'overloaded' ? 'bg-red-900/40 text-red-200 border-red-500/30' :
                weeklyAnalysis.verdict === 'balanced'   ? 'bg-emerald-900/40 text-emerald-100 border-emerald-500/30' :
                                                          'bg-sky-900/40 text-sky-100 border-sky-500/30'
              }`}>
                {weeklyAnalysis.verdict === 'overloaded' ? '⚠️ Overloaded' : weeklyAnalysis.verdict === 'balanced' ? '✅ Balanced' : '🌿 Light week'}
              </div>
              <p className="text-sm text-slate-200 leading-relaxed font-medium">{weeklyAnalysis.trend}</p>
              <div className="skeu-inset rounded-2xl p-4 bg-black/30 border-white/5">
                <p className="text-xs font-black text-slate-400 uppercase tracking-wide mb-1.5">Suggestion</p>
                <p className="text-sm text-slate-200 leading-relaxed font-medium">{weeklyAnalysis.suggestion}</p>
              </div>
              <p className="text-[10px] text-slate-500 font-bold italic">🤖 AI-generated · workload data only · not medical advice</p>
            </div>
          ) : (
            <div className="skeu-inset rounded-2xl p-6 text-center bg-black/30 border-white/5">
              <Brain className="w-8 h-8 mx-auto mb-2 text-purple-400/40" />
              <p className="text-sm text-slate-400 font-bold">Click Generate for a personalised workload tip</p>
            </div>
          )}
        </motion.div>
      </div>
    </AppLayout>
  )
}
