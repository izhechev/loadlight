"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { LineChart, Line, ResponsiveContainer } from "recharts"
import { TrendingUp, Brain, Loader2, RefreshCw, Plus, ChevronRight, CheckCircle, AlertTriangle } from "lucide-react"
import { AppLayout } from "@/components/app-layout"
import { ChillSuggestions } from "@/components/chill-suggestions"
import { useOverwhelmedStore, type DemandType, type TaskSignalData } from "@/lib/store/overwhelmedStore"
import { useCategoryStore, getCategoryClasses } from "@/lib/store/categoryStore"
import { getTasks, updateTask, IS_DEMO } from "@/lib/data/tasks"

type BalanceMode = 'beast' | 'average' | 'chill'

interface Task {
  id: string
  name: string
  category: string
  demand_type: DemandType
  difficulty: number
  deadline: string | null
  start_date?: string | null
  priority?: 1 | 2 | 3 | 4
  notes?: string
  estimated_minutes: number | null
  done: boolean
  createdAt: number
  recurring?: 'none' | 'daily' | 'weekly'
  recurring_hours?: number | null
  snoozedUntil?: number
}

interface AnalysisResult {
  verdict: 'overloaded' | 'balanced' | 'light'
  trend: string
  advice: string
  suggestion: string
}

interface SparkEntry {
  date: string
  undone: number
  done: number
  minutes: number
  dueSoon: number
}

const WORK_CATEGORIES = ['work', 'study', 'administrative', 'creative', 'Work', 'Study', 'Admin', 'Creative', 'Administrative', 'Exercise', 'exercise']
const SPARK_KEY = 'loadlight-sparkline-history'

function isDueWithin48h(d: string | null) {
  if (!d) return false
  const ms = new Date(d).getTime() - Date.now()
  // Include overdue tasks (ms < 0) and tasks due within 48h
  return ms <= 172800000
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function loadSparkHistory(): SparkEntry[] {
  try {
    const raw = localStorage.getItem(SPARK_KEY)
    if (raw) return JSON.parse(raw) as SparkEntry[]
  } catch { /* ignore */ }
  return []
}

function saveSparkHistory(entries: SparkEntry[]) {
  try {
    localStorage.setItem(SPARK_KEY, JSON.stringify(entries.slice(-8)))
  } catch { /* ignore */ }
}

// ── Sparkline micro-chart ──
function Spark({ data, dataKey, color }: { data: SparkEntry[]; dataKey: keyof SparkEntry; color: string }) {
  if (data.length < 2) return <div className="h-8 opacity-20 text-xs text-slate-400 flex items-end">no history</div>
  return (
    <ResponsiveContainer width="100%" height={32}>
      <LineChart data={data}>
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Stat card with sparkline ──
function StatCard({ label, value, color, sparkData, sparkKey, sparkColor, deltaFormat }: {
  label: string
  value: string | number
  color: string
  sparkData: SparkEntry[]
  sparkKey: keyof SparkEntry
  sparkColor: string
  deltaFormat?: (raw: number) => string
}) {
  const oldest = sparkData[0]?.[sparkKey] as number | undefined
  const newest = sparkData[sparkData.length - 1]?.[sparkKey] as number | undefined
  const delta = oldest !== undefined && newest !== undefined && sparkData.length >= 2
    ? newest - oldest : null

  const deltaStr = delta === null ? null
    : deltaFormat
      ? (delta >= 0 ? '+' : '') + deltaFormat(delta)
      : (delta > 0 ? `+${delta}` : String(delta))

  return (
    <div className="skeu-card p-5 flex flex-col gap-1.5">
      <p className={`text-3xl font-black ${color} drop-shadow-sm`}>{value}</p>
      <p className="text-xs font-black text-slate-500 uppercase tracking-wide">{label}</p>
      <Spark data={sparkData} dataKey={sparkKey} color={sparkColor} />
      {deltaStr !== null && (
        <p className={`text-[10px] font-bold ${delta! > 0 ? 'text-rose-500' : delta! < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
          {deltaStr} vs 8 days ago
        </p>
      )}
    </div>
  )
}

// ── Overwhelmed Feedback (no emoji faces) ──
function OverwhelmedFeedback({ score, state }: { score: number; state: 'normal' | 'elevated' | 'overwhelmed' }) {
  const cfg = {
    normal:      { dot: 'bg-emerald-400', label: 'Light',    bar: 'bg-emerald-400', headline: "You're managing well",      sub: "Your workload looks balanced. Keep it up!" },
    elevated:    { dot: 'bg-amber-400',   label: 'Moderate', bar: 'bg-amber-400',   headline: "Your plate is getting full", sub: "Things are building up. Consider completing a task before adding more." },
    overwhelmed: { dot: 'bg-rose-500',    label: 'Heavy',    bar: 'bg-rose-500',    headline: "Time to take a breather",   sub: "Rest mode is active. Focus on what truly matters right now." },
  }[state]

  return (
    <div className="flex items-center gap-4">
      {/* Dot + label */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span className={`w-4 h-4 rounded-full ${cfg.dot} shadow-sm`} />
        <span className="text-[10px] font-bold text-slate-500">Load</span>
        <span className="text-xs font-black text-slate-700">{cfg.label}</span>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="font-black text-xl text-slate-700">{cfg.headline}</p>
        <p className="text-sm text-slate-500 mt-0.5">{cfg.sub}</p>
        {/* Score bar — Aero aqua progress */}
        <div className="mt-2 h-3 progress-track rounded-full overflow-hidden">
          <div
            className={`h-full progress-aero transition-all duration-700 ${
              state === 'elevated' ? '!bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500' :
              state === 'overwhelmed' ? '!bg-gradient-to-r from-rose-400 via-red-500 to-rose-600' : ''
            }`}
            style={{ width: `${Math.round(score * 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5 font-medium">
          <span>0</span>
          <span>score: {Math.round(score * 100)}/100</span>
          <span>100</span>
        </div>
      </div>
    </div>
  )
}

// ── Balance slider (snaps to 30 / 50 / 70) ──
function BalanceSlider({ value, onChange, locked, lockDaysLeft }: { value: number; onChange: (v: number) => void; locked?: boolean; lockDaysLeft?: number }) {
  const SNAPS = [30, 50, 70]
  const snap = (v: number) => SNAPS.reduce((best, s) => Math.abs(s - v) < Math.abs(best - v) ? s : best)

  const labels: Record<number, { name: string; desc: string; color: string }> = {
    30: { name: 'Chill',     desc: 'Recovery first — max 30% work time.',           color: 'text-violet-600' },
    50: { name: 'Balanced',  desc: 'Equal split between work and everything else.',  color: 'text-emerald-600' },
    70: { name: 'Beast mode',desc: '70% work time — you\'re in a sprint.',           color: 'text-sky-600' },
  }
  const snapped = snap(value)
  const info = labels[snapped]

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs font-bold text-slate-500 px-0.5">
        <span>Chill</span>
        <span>Balanced</span>
        <span>Beast</span>
      </div>
      <input
        type="range"
        min={10}
        max={90}
        step={1}
        value={value}
        disabled={locked}
        onChange={e => onChange(Number(e.target.value))}
        onPointerUp={e => onChange(snap(Number((e.target as HTMLInputElement).value)))}
        className={`w-full accent-sky-500 ${locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      />
      <div className="text-center">
        <span className={`text-sm font-black ${info.color}`}>{info.name}</span>
        <p className="text-xs text-slate-500 mt-0.5">{info.desc}</p>
        {locked && (
          <p className="text-[11px] text-amber-600 font-black mt-1.5 flex items-center justify-center gap-1">
            🔒 Chill Guy lock active · {lockDaysLeft}d remaining · change in Settings
          </p>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const shouldReduceMotion = useReducedMotion()
  const { state, compositeScore, computeAndTransition } = useOverwhelmedStore()
  const { categories } = useCategoryStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [sliderValue, setSliderValue] = useState(50)
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('average')
  const [chillLockUntil, setChillLockUntil] = useState<number | null>(null)
  const [weeklyAnalysis, setWeeklyAnalysis] = useState<AnalysisResult | null>(null)
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [sparkHistory, setSparkHistory] = useState<SparkEntry[]>([])
  const autoFetched = useRef(false)

  // Load tasks + balance mode
  useEffect(() => {
    getTasks()
      .then(data => setTasks(data.map(t => ({ ...t, category: t.category || t.lifeDomain || 'Personal' })) as unknown as Task[]))
      .catch(() => {
        try {
          const t = localStorage.getItem('loadlight-tasks')
          if (t) setTasks((JSON.parse(t) as any[]).map(tsk => ({ ...tsk, category: tsk.category || tsk.life_domain || 'Personal' })) as Task[])
        } catch { /* ignore */ }
      })
    try {
      const u = localStorage.getItem('loadlight-user')
      if (u) {
        const p = JSON.parse(u) as { balanceMode?: string; sliderValue?: number }
        const bm = (p.balanceMode === 'balanced' ? 'average' : p.balanceMode) as BalanceMode | undefined
        if (bm) setBalanceMode(bm)
        setSliderValue(p.sliderValue ?? (bm === 'beast' ? 70 : bm === 'chill' ? 30 : 50))
      }
      const lock = localStorage.getItem('loadlight-chill-lock')
      if (lock) setChillLockUntil(parseInt(lock, 10))
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

  // Update sparkline history on mount
  useEffect(() => {
    if (!tasks.length) return
    const undoneTasks = tasks.filter(t => !t.done)
    const activeMin = undoneTasks.reduce((acc, t) => acc + (t.estimated_minutes ?? 30), 0)
    const dueSoonCount = undoneTasks.filter(t => isDueWithin48h(t.deadline)).length
    const today = todayStr()
    const history = loadSparkHistory()
    const existing = history.findIndex(e => e.date === today)
    const entry: SparkEntry = { date: today, undone: undoneTasks.length, done: tasks.filter(t => t.done).length, minutes: activeMin, dueSoon: dueSoonCount }
    if (existing >= 0) history[existing] = entry
    else history.push(entry)
    const trimmed = history.slice(-8)
    saveSparkHistory(trimmed)
    setSparkHistory(trimmed)
  }, [tasks])

  // Auto-fetch AI advisory once on mount when tasks exist
  useEffect(() => {
    if (autoFetched.current || !tasks.length) return
    autoFetched.current = true
    fetchSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks])

  const undoneTasks = tasks.filter(t => !t.done)
  const activeMin = undoneTasks.reduce((acc, t) => acc + (t.estimated_minutes ?? 30), 0)
  const workMin = undoneTasks.filter(t => WORK_CATEGORIES.some(w => t.category?.toLowerCase().includes(w.toLowerCase()))).reduce((acc, t) => acc + (t.estimated_minutes ?? 30), 0)
  const targetWork = balanceMode === 'beast' ? 70 : balanceMode === 'average' ? 50 : 30
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
      setWeeklyAnalysis({ verdict: 'light', trend: 'Could not load summary.', advice: 'Try again when connected.', suggestion: 'Check your internet connection.' })
    } finally {
      setIsAnalysing(false)
    }
  }

  const chillLocked = !!chillLockUntil && Date.now() < chillLockUntil

  function handleSliderChange(v: number) {
    // Chill lock: prevent sliding away from chill while lock is active
    if (chillLocked && v > 40) {
      setSliderValue(30)
      return
    }
    setSliderValue(v)
    const mode: BalanceMode = v <= 40 ? 'chill' : v <= 60 ? 'average' : 'beast'
    setBalanceMode(mode)
    try {
      const u = localStorage.getItem('loadlight-user')
      const p = u ? JSON.parse(u) as Record<string, unknown> : {}
      localStorage.setItem('loadlight-user', JSON.stringify({ ...p, balanceMode: mode, sliderValue: v }))
    } catch { /* ignore */ }
  }

  function handleSnooze(ids: string[]) {
    const snoozedUntil = Date.now() + 24 * 60 * 60 * 1000
    setTasks(prev => {
      const updated = prev.map(t => ids.includes(t.id) ? { ...t, snoozedUntil } : t)
      if (IS_DEMO) { try { localStorage.setItem('loadlight-tasks', JSON.stringify(updated)) } catch { /* ignore */ } }
      return updated
    })
    ids.forEach(id => updateTask(id, { snoozedUntil }).catch(() => {}))
  }

  const mc = shouldReduceMotion ? { duration: 0 } : { duration: 0.25, type: 'spring' as const, bounce: 0.15 }

  return (
    <AppLayout>
      <div className="space-y-4 max-w-4xl mx-auto">

        {/* ── Wellbeing card (OverwhelmedFeedback — no emoji faces) ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={mc}
          className={`skeu-card p-5 border ${
            state === 'overwhelmed' ? 'bg-gradient-to-br from-rose-100/80 to-pink-100/70 border-rose-300/60' :
            state === 'elevated'    ? 'bg-gradient-to-br from-amber-100/80 to-yellow-100/70 border-amber-300/60' :
                                      'bg-gradient-to-br from-emerald-100/80 to-teal-100/70 border-emerald-300/60'
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <OverwhelmedFeedback score={compositeScore} state={state} />
            </div>
            <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
              <span className="text-xs text-slate-400">Tasks left</span>
              <span className="text-2xl font-black text-slate-700">{undoneTasks.length}</span>
            </div>
          </div>
        </motion.div>

        {/* ── Chill Mode suggestions (only in chill balance mode) ── */}
        {balanceMode === 'chill' && tasks.length > 0 && (
          <ChillSuggestions
            tasks={tasks}
            onSnooze={handleSnooze}
          />
        )}

        {/* ── Stats row with sparklines ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...mc, delay: 0.05 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          <StatCard label="Total tasks"      value={tasks.length}                                      color="text-sky-600"                                    sparkData={sparkHistory} sparkKey="undone"   sparkColor="#0ea5e9" />
          <StatCard label="Completed"        value={tasks.filter(t => t.done).length}                  color="text-emerald-600"                                sparkData={sparkHistory} sparkKey="done"    sparkColor="#10b981" />
          <StatCard label="Hours estimated"  value={`${Math.round(activeMin / 60 * 10) / 10}h`}        color="text-purple-600"                                 sparkData={sparkHistory} sparkKey="minutes" sparkColor="#a855f7" deltaFormat={m => `${Math.round(m / 60 * 10) / 10}h`} />
          <StatCard label="Due soon"         value={dueSoon.length}                                     color={dueSoon.length > 0 ? 'text-red-500' : 'text-slate-500'} sparkData={sparkHistory} sparkKey="dueSoon" sparkColor="#ef4444" />
        </motion.div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* ── Balance card with slider ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...mc, delay: 0.08 }}
            className="skeu-card p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <h2 className="font-black text-slate-700">Balance</h2>
            </div>

            {/* Work gauge */}
            <div className="mb-3">
              <div className="flex justify-between text-xs font-black mb-1.5">
                <span className="text-slate-600">Work <strong className="text-sky-700">{workPct}%</strong></span>
                <span className="text-slate-400">target {targetWork}%</span>
              </div>
              <div className="relative progress-track h-5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-700 ${workPct > targetWork + 15 ? '!bg-gradient-to-r from-orange-400 via-red-400 to-rose-500' : 'progress-aero'}`}
                  style={{ width: `${workPct}%` }}
                />
                <div className="absolute top-0 h-full w-0.5 bg-white/40 shadow-sm" style={{ left: `${targetWork}%` }} />
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex justify-between text-xs font-black mb-1.5">
                <span className="text-slate-600">Progress</span>
                <span className="text-emerald-600 font-black">{donePct}% done</span>
              </div>
              <div className="progress-track h-3 overflow-hidden">
                <div className="h-full progress-aero !bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 transition-all duration-700" style={{ width: `${donePct}%` }} />
              </div>
            </div>

            {workPct > targetWork + 15 && (
              <div className="mb-4 bg-red-50/90 border border-red-300/60 rounded-2xl p-3 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">Work is taking over. Maybe move some tasks to next week?</p>
              </div>
            )}

            {/* Slider */}
            <BalanceSlider
              value={sliderValue}
              onChange={handleSliderChange}
              locked={chillLocked}
              lockDaysLeft={chillLockUntil ? Math.ceil((chillLockUntil - Date.now()) / 86400000) : 0}
            />
          </motion.div>

          {/* ── Pending tasks preview ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...mc, delay: 0.1 }}
            className="skeu-card p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-sky-600" />
                <h2 className="font-black text-slate-700">Up next</h2>
              </div>
              <Link href="/tasks" className="text-xs text-sky-600 hover:text-sky-900 font-medium flex items-center gap-1 transition-colors">
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
                    <div key={t.id} className="flex items-center gap-3 rounded-2xl p-3 skeu-card shadow-sm">
                      <span className="text-base">{cat?.emoji ?? '📌'}</span>
                      <span className="flex-1 text-sm font-semibold text-slate-700 truncate">{t.name}</span>
                      {isDueWithin48h(t.deadline) && (
                        <span className="text-xs text-red-500 font-bold shrink-0">Due soon!</span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${cls.bg} ${cls.text} badge-skeu shrink-0 shadow-sm border border-white/10`}>
                        {t.category}
                      </span>
                    </div>
                  )
                })}
                {undoneTasks.length > 5 && (
                  <p className="text-xs text-slate-400 text-center pt-1 font-bold">+{undoneTasks.length - 5} more tasks</p>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="w-10 h-10 mx-auto mb-2 text-emerald-500/40" />
                <p className="text-sm text-slate-400 font-bold">All clear! Nothing pending.</p>
                <Link href="/tasks/new" className="inline-flex items-center gap-1.5 mt-3 text-sky-600 text-sm font-bold hover:text-sky-900 transition-colors">
                  <Plus className="w-4 h-4" /> Add tasks
                </Link>
              </div>
            )}
          </motion.div>
        </div>

        {/* ── AI Advisory (auto-loaded, refresh button stays) ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...mc, delay: 0.12 }}
          className="skeu-card p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600" />
              <h2 className="font-black text-slate-700">AI Advisory</h2>
              <span className="text-xs text-slate-400 font-bold">Auto-loads on open</span>
            </div>
            <button
              onClick={fetchSummary}
              disabled={isAnalysing}
              className="glow-button font-bold px-4 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {isAnalysing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {isAnalysing ? 'Thinking...' : 'Refresh'}
            </button>
          </div>

          {isAnalysing && !weeklyAnalysis ? (
            <div className="skeu-inset rounded-2xl p-6 text-center">
              <Loader2 className="w-8 h-8 mx-auto mb-2 text-purple-500/50 animate-spin" />
              <p className="text-sm text-slate-400 font-bold">Analysing your workload…</p>
            </div>
          ) : weeklyAnalysis ? (
            <div className="space-y-3">
              <div className={`rounded-2xl px-4 py-3 font-black text-sm border ${
                weeklyAnalysis.verdict === 'overloaded' ? 'bg-red-50/90 text-red-700 border-red-300/60' :
                weeklyAnalysis.verdict === 'balanced'   ? 'bg-emerald-50/90 text-emerald-700 border-emerald-300/60' :
                                                          'bg-sky-50/90 text-sky-700 border-sky-300/60'
              }`}>
                {weeklyAnalysis.verdict === 'overloaded' ? '⚠️ Overloaded' : weeklyAnalysis.verdict === 'balanced' ? '✅ Balanced' : '🌿 Light week'}
              </div>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">{weeklyAnalysis.trend}</p>
              <div className="skeu-inset rounded-2xl p-4">
                <p className="text-xs font-black text-slate-400 uppercase tracking-wide mb-1.5">Suggestion</p>
                <p className="text-sm text-slate-600 leading-relaxed font-medium">{weeklyAnalysis.suggestion}</p>
              </div>
              <p className="text-[10px] text-slate-500 font-bold italic">🤖 AI-generated · workload data only · not medical advice</p>
            </div>
          ) : (
            <div className="skeu-inset rounded-2xl p-6 text-center">
              <Brain className="w-8 h-8 mx-auto mb-2 text-purple-500/50" />
              <p className="text-sm text-slate-400 font-bold">Add tasks to get personalised insights</p>
            </div>
          )}
        </motion.div>
      </div>
    </AppLayout>
  )
}
