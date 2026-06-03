"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { TrendingUp, Brain, Loader2, RefreshCw, Plus, ChevronRight, CheckCircle, AlertTriangle } from "@/lib/icons"
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

const WORK_CATEGORIES = ['work', 'study', 'administrative', 'admin', 'creative', 'Work', 'Study', 'Admin', 'Administrative', 'Creative']
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

// ── Sparkline micro-chart (pure SVG, no library) ──
function Spark({ data, dataKey, color }: { data: SparkEntry[]; dataKey: keyof SparkEntry; color: string }) {
  if (data.length < 2) return <div className="h-8 opacity-20 text-xs text-slate-400 flex items-end">no history</div>
  const values = data.map(d => d[dataKey] as number)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const W = 100, H = 32, pad = 2
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (W - pad * 2) + pad
    const y = H - pad - ((v - min) / range) * (H - pad * 2)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-8" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
    normal:      { dot: '#34d399', label: 'Light',    headline: "You're managing well",      sub: "Your workload looks balanced. Keep it up!" },
    elevated:    { dot: '#fbbf24', label: 'Moderate', headline: "Your plate is getting full", sub: "Things are building up. Consider completing a task before adding more." },
    overwhelmed: { dot: '#f87171', label: 'Heavy',    headline: "Time to take a breather",   sub: "Rest mode is active. Focus on what truly matters right now." },
  }[state]

  return (
    <div className="flex items-center gap-4">
      {/* Dot + label */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span className="w-4 h-4 rounded-full shadow-sm" style={{ background: cfg.dot, boxShadow: `0 0 6px ${cfg.dot}88`, border: '1px solid rgba(0,0,0,0.15)' }} />
        <span className="text-[10px] font-bold" style={{ color: '#6a8aaa' }}>Load</span>
        <span className="text-xs font-black" style={{ color: '#1a1a1a' }}>{cfg.label}</span>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="font-black text-xl" style={{ color: '#1a1a1a' }}>{cfg.headline}</p>
        <p className="text-sm mt-0.5" style={{ color: '#4a6a8a' }}>{cfg.sub}</p>
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
        <div className="flex justify-between text-[10px] mt-0.5 font-medium" style={{ color: '#7a9ab8' }}>
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
    30: { name: 'Chill',     desc: 'Recovery first — max 30% work time.',           color: '#5a2a9a' },
    50: { name: 'Balanced',  desc: 'Equal split between work and everything else.',  color: '#1a7a50' },
    70: { name: 'Beast mode',desc: '70% work time — you\'re in a sprint.',           color: '#1a4a90' },
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
        <span className="text-sm font-black" style={{ color: info.color }}>{info.name}</span>
        <p className="text-xs mt-0.5" style={{ color: '#4a6a8a' }}>{info.desc}</p>
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
  const { state, compositeScore, computeAndTransition } = useOverwhelmedStore()
  const { categories } = useCategoryStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [sliderValue, setSliderValue] = useState(50)
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('average')
  const [chillLockUntil, setChillLockUntil] = useState<number | null>(null)
  const [weeklyAnalysis, setWeeklyAnalysis] = useState<AnalysisResult | null>(null)
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [advisory, setAdvisory] = useState<string | null>(null)
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
    const allUndone = tasks.filter(t => !t.done)
    // Deduplicate recurring tasks so signals aren't inflated by future copies
    const seenKeys = new Set<string>()
    const undoneTasks = allUndone.filter(t => {
      if (!t.recurring || t.recurring === 'none') return true
      const key = `${t.name.trim().toLowerCase()}||${(t.category || '').toLowerCase()}`
      if (seenKeys.has(key)) return false
      seenKeys.add(key)
      return true
    })
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

  const allUndone = tasks.filter(t => !t.done)
  // Deduplicate recurring tasks for all display metrics
  const undoneTasks = (() => {
    const seen = new Set<string>()
    return allUndone
      .slice()
      .sort((a, b) => {
        if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
        if (a.deadline) return -1; if (b.deadline) return 1; return 0
      })
      .filter(t => {
        if (!t.recurring || t.recurring === 'none') return true
        const key = `${t.name.trim().toLowerCase()}||${(t.category || '').toLowerCase()}`
        if (seen.has(key)) return false
        seen.add(key); return true
      })
  })()
  const activeMin = undoneTasks.reduce((acc, t) => acc + (t.estimated_minutes ?? 30), 0)
  const workMin = undoneTasks.filter(t => WORK_CATEGORIES.some(w => t.category?.toLowerCase().includes(w.toLowerCase()))).reduce((acc, t) => acc + (t.estimated_minutes ?? 30), 0)
  const targetWork = balanceMode === 'beast' ? 70 : balanceMode === 'average' ? 50 : 30
  const workPct = activeMin > 0 ? Math.round(workMin / activeMin * 100) : 0
  const donePct = tasks.length > 0 ? Math.round(tasks.filter(t => t.done).length / tasks.length * 100) : 0
  const pendingTasks = undoneTasks.slice(0, 5)
  const dueSoon = undoneTasks.filter(t => isDueWithin48h(t.deadline))

  async function fetchSummary() {
    setIsAnalysing(true)
    // Fetch both: weekly summary (existing) + real-time advisory (spec)
    try {
      const [summaryRes, adviseRes] = await Promise.allSettled([
        fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'weekly',
            tasks: undoneTasks,
            balanceMode,
            totalDone: tasks.filter(t => t.done).length,
          }),
        }),
        fetch('/api/ai/advise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state,
            signals: { taskAccumulation: 0, temporalPressure: 0 },
            taskCount: undoneTasks.length,
            urgentCount: dueSoon.length,
          }),
        }),
      ])

      if (summaryRes.status === 'fulfilled' && summaryRes.value.ok) {
        setWeeklyAnalysis(await summaryRes.value.json() as AnalysisResult)
      } else {
        setWeeklyAnalysis({ verdict: 'light', trend: 'Unable to generate advice.', advice: '', suggestion: '' })
      }

      if (adviseRes.status === 'fulfilled' && adviseRes.value.ok) {
        const d = await adviseRes.value.json() as { advice: string | null }
        if (d.advice) setAdvisory(d.advice)
      }
    } catch {
      setWeeklyAnalysis({ verdict: 'light', trend: 'Unable to generate advice.', advice: '', suggestion: '' })
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

  return (
    <AppLayout>
      <div className="space-y-4 max-w-4xl mx-auto">

        {/* ── Wellbeing card (OverwhelmedFeedback — no emoji faces) ── */}
        <div
          className={`skeu-card p-5 anim-fade-in-up ${
            state === 'overwhelmed' ? 'aero-danger'  :
            state === 'elevated'    ? 'aero-warning' :
                                      'aero-success'
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <OverwhelmedFeedback score={compositeScore} state={state} />
            </div>
            <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
              <span className="text-xs" style={{ color: '#6a8aaa', fontWeight: 700 }}>Tasks left</span>
              <span className="text-2xl font-black" style={{ color: '#1a1a1a' }}>{undoneTasks.length}</span>
            </div>
          </div>
        </div>

        {/* ── Chill Mode suggestions (only in chill balance mode) ── */}
        {balanceMode === 'chill' && tasks.length > 0 && (
          <ChillSuggestions
            tasks={tasks}
            onSnooze={handleSnooze}
          />
        )}

        {/* ── Stats row with sparklines ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 anim-fade-in-up" style={{ animationDelay: '0.05s' }}>
          <StatCard label="Total tasks"      value={tasks.length}                                      color="text-sky-600"                                    sparkData={sparkHistory} sparkKey="undone"   sparkColor="#0ea5e9" />
          <StatCard label="Completed"        value={tasks.filter(t => t.done).length}                  color="text-emerald-600"                                sparkData={sparkHistory} sparkKey="done"    sparkColor="#10b981" />
          <StatCard label="Hours estimated"  value={`${Math.round(activeMin / 60 * 10) / 10}h`}        color="text-purple-600"                                 sparkData={sparkHistory} sparkKey="minutes" sparkColor="#a855f7" deltaFormat={m => `${Math.round(m / 60 * 10) / 10}h`} />
          <StatCard label="Due soon"         value={dueSoon.length}                                     color={dueSoon.length > 0 ? 'text-red-500' : 'text-slate-500'} sparkData={sparkHistory} sparkKey="dueSoon" sparkColor="#ef4444" />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* ── Balance card with slider ── */}
          <div className="skeu-card p-5 anim-fade-in-up" style={{ animationDelay: '0.08s' }}>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              <h2 className="font-black" style={{ color: '#1a2a3a' }}>Balance</h2>
            </div>

            {/* Work gauge — only meaningful with enough active tasks */}
            {undoneTasks.length >= 4 ? (
              <div className="mb-3">
                <div className="flex justify-between text-xs font-black mb-1.5">
                  <span style={{ color: '#3a5a7a', fontWeight: 700 }}>Work <strong style={{ color: '#1a5a98' }}>{workPct}%</strong></span>
                  <span style={{ color: '#7a9ab8', fontWeight: 600 }}>target {targetWork}%</span>
                </div>
                <div className="relative progress-track h-5 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-700 ${workPct > targetWork + 15 ? '!bg-gradient-to-r from-orange-400 via-red-400 to-rose-500' : 'progress-aero'}`}
                    style={{ width: `${workPct}%` }}
                  />
                  <div className="absolute top-0 h-full w-0.5 bg-white/40 shadow-sm" style={{ left: `${targetWork}%` }} />
                </div>
              </div>
            ) : (
              <div className="mb-3 aero-info rounded-xl p-3 text-xs" style={{ fontWeight: 600 }}>
                {undoneTasks.length === 0
                  ? 'No active tasks — add some to track your work/leisure balance.'
                  : `Only ${undoneTasks.length} active task${undoneTasks.length > 1 ? 's' : ''} — balance gauge needs 4+ tasks to be meaningful.`}
              </div>
            )}

            {/* Progress — only show when there are enough tasks to make % meaningful */}
            {tasks.length >= 4 && (
              <div className="mb-4">
                <div className="flex justify-between text-xs font-black mb-1.5">
                  <span style={{ color: '#3a5a7a', fontWeight: 700 }}>All-time completion</span>
                  <span style={{ color: '#1a7a50', fontWeight: 800 }}>{donePct}% done</span>
                </div>
                <div className="progress-track h-3 overflow-hidden">
                  <div className="h-full progress-aero !bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 transition-all duration-700" style={{ width: `${donePct}%` }} />
                </div>
              </div>
            )}

            {undoneTasks.length >= 4 && workPct > targetWork + 15 && (
              <div className="mb-4 aero-danger rounded-2xl p-3 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <p className="text-xs">Work is taking over. Maybe move some tasks to next week?</p>
              </div>
            )}

            {/* Slider */}
            <BalanceSlider
              value={sliderValue}
              onChange={handleSliderChange}
              locked={chillLocked}
              lockDaysLeft={chillLockUntil ? Math.ceil((chillLockUntil - Date.now()) / 86400000) : 0}
            />
          </div>

          {/* ── Pending tasks preview ── */}
          <div className="skeu-card p-5 anim-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-sky-600" />
                <h2 className="font-black" style={{ color: '#1a2a3a' }}>Up next</h2>
              </div>
              <Link href="/tasks" style={{ fontSize: 11, color: '#1a5a98', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
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
                      <span className="flex-1 text-sm font-semibold truncate" style={{ color: '#1a1a1a' }}>{t.name}</span>
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
                <p className="text-sm font-bold" style={{ color: '#5a7a9a' }}>All clear! Nothing pending.</p>
                <Link href="/tasks/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 10, color: '#1a5a98', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                  <Plus className="w-4 h-4" /> Add tasks
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ── AI Advisory panel (spec: auto-generates, "AI workload analysis" indicator) ── */}
        <div className="skeu-card p-5 anim-fade-in-up" style={{ animationDelay: '0.12s' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600" />
              <h2 className="font-black" style={{ color: '#1a2a3a' }}>Workload Analysis</h2>
              {/* Spec: always-visible "AI workload analysis" indicator */}
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full aero-info badge-skeu">AI workload analysis</span>
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
          ) : (
            <div className="space-y-3">
              {/* Real-time advisory (spec: 1-2 sentence observation) */}
              {advisory && (
                <div className="skeu-inset rounded-2xl p-4 border-l-4" style={{ borderLeftColor: 'rgba(139,92,246,0.60)' }}>
                  <p className="text-sm leading-relaxed font-medium" style={{ color: '#1a2a3a' }}>{advisory}</p>
                </div>
              )}

              {weeklyAnalysis && (
                <>
                  <div className={`rounded-2xl px-4 py-3 font-black text-sm ${
                    weeklyAnalysis.verdict === 'overloaded' ? 'aero-danger'  :
                    weeklyAnalysis.verdict === 'balanced'   ? 'aero-success' :
                                                              'aero-info'
                  }`}>
                    {weeklyAnalysis.verdict === 'overloaded' ? '⚠ Overloaded' : weeklyAnalysis.verdict === 'balanced' ? '✓ Balanced' : 'Light week'}
                  </div>
                  {weeklyAnalysis.trend && <p className="text-sm leading-relaxed font-medium" style={{ color: '#2a3a50' }}>{weeklyAnalysis.trend}</p>}
                  {weeklyAnalysis.suggestion && (
                    <div className="skeu-inset rounded-2xl p-4">
                      <p className="text-xs font-black uppercase tracking-wide mb-1.5" style={{ color: '#6a8aaa' }}>Observation</p>
                      <p className="text-sm leading-relaxed font-medium" style={{ color: '#2a3a50' }}>{weeklyAnalysis.suggestion}</p>
                    </div>
                  )}
                </>
              )}

              {!advisory && !weeklyAnalysis && (
                <div className="skeu-inset rounded-2xl p-6 text-center">
                  <Brain className="w-8 h-8 mx-auto mb-2 text-purple-500/50" />
                  <p className="text-sm font-bold" style={{ color: '#5a7a9a' }}>Add tasks to get workload insights</p>
                </div>
              )}

              <p className="text-[10px] font-bold" style={{ color: '#7a9ab8' }}>AI workload analysis · task data only · not medical advice</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
