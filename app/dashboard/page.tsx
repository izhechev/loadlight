"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import Link from "next/link"
import { Loader2, RefreshCw, Plus, ChevronRight, CheckCircle, AlertTriangle, Lock } from "@/lib/icons"
import { AppLayout } from "@/components/app-layout"
import { ScheduleConflicts } from "@/components/schedule-conflicts"
import { ChillSuggestions } from "@/components/chill-suggestions"
import { useOverwhelmedStore } from "@/lib/store/overwhelmedStore"
import { useCategoryStore, getCategoryClasses } from "@/lib/store/categoryStore"
import { ClassicIcon, categoryIconName } from "@/lib/classic-icons"
import { getTasks, updateTask, type Task } from "@/lib/data/tasks"
import { dailyAdvicePlan, describeDailyPlan } from "@/lib/ai/dailyAdvice"
import { activeWorkload, dueIn48Hours, getDailyWorkload, getTaskSignals, getWeeklyWorkload, nextCommitmentTime, taskMinutes, workloadDeadline } from "@/lib/utils/workload"
import { canSnoozeTask } from "@/lib/utils/toughDays"
import styles from "./dashboard.module.css"

type BalanceMode = 'beast' | 'average' | 'chill'

interface AnalysisResult {
  source: 'gemini' | 'groq' | 'rules'
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

const WORK_CATEGORIES = /^(work|study|administrative|admin)$/i
const SPARK_KEY = 'loadlight-sparkline-history'

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

// ── Classic bar mini-chart (chunky bars, 2008 style) ──
function Spark({ data, dataKey, color }: { data: SparkEntry[]; dataKey: keyof SparkEntry; color: string }) {
  if (data.length < 2) return null
  const values = data.map(d => d[dataKey] as number)
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-px h-8" style={{ borderBottom: '1px solid #9ab0c8' }}>
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1"
          style={{
            height: `${Math.max(6, (v / max) * 100)}%`,
            backgroundColor: color,
            border: '1px solid rgba(0,0,0,0.30)',
            borderBottom: 'none',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)',
          }}
        />
      ))}
    </div>
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
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={`text-2xl font-bold ${color}`} style={{ lineHeight: 1 }}>{value}</span>
      <Spark data={sparkData} dataKey={sparkKey} color={sparkColor} />
      {deltaStr !== null && (
        <span className="text-[10px]" style={{ color: delta! > 0 ? '#a83232' : delta! < 0 ? '#196244' : '#3e5a6d' }}>
          {deltaStr} since last week
        </span>
      )}
    </div>
  )
}

function OverwhelmedFeedback({ minutes, capacity, activeCount, rest }: {
  minutes: number
  capacity: number
  activeCount: number
  rest: boolean
}) {
  const ratio = minutes / capacity
  const state = rest || ratio >= 1 ? 'overwhelmed' : ratio >= 0.75 ? 'elevated' : 'normal'
  const label = rest ? 'Rest mode' : state === 'overwhelmed' ? 'Heavy day' : state === 'elevated' ? 'Nearly full' : 'Within capacity'
  const headline = rest
    ? 'Rest mode is active'
    : minutes > capacity
      ? `Today is ${minutes - capacity} min over capacity`
      : minutes === capacity
        ? 'Today is at capacity'
        : minutes > 0
          ? `${capacity - minutes} min of capacity left`
          : 'Nothing planned for today'

  return (
    <section className={styles.loadPanel} data-state={state} aria-labelledby="load-status-title">
      <div className={styles.loadStatus}>
        <div className={styles.loadOrb} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className={styles.loadDetails}>
        <h2 id="load-status-title">{headline}</h2>
        <p>Includes tasks planned for today, due today, or already overdue.</p>
        <div className={styles.loadTrack} aria-hidden="true">
          <div className={styles.loadFill} style={{ width: `${Math.round(Math.min(ratio, 1) * 100)}%` }} />
        </div>
        <div className={styles.loadMeta}>
          <span>{minutes} of {capacity} min planned</span>
          <span>{activeCount} {activeCount === 1 ? 'task' : 'tasks'}</span>
        </div>
      </div>
    </section>
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
        className={`trackbar-classic w-full ${locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      />
      <div className="text-center">
        <span className="text-sm font-black" style={{ color: info.color }}>{info.name}</span>
        <p className="text-xs mt-0.5" style={{ color: '#4a6a8a' }}>{info.desc}</p>
        {locked && (
          <p className="text-[11px] text-amber-600 font-black mt-1.5 flex items-center justify-center gap-1">
            <Lock style={{ width: 12, height: 12 }} /> Chill Guy lock active · {lockDaysLeft}d remaining · change in Settings
          </p>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { state, computeAndTransition } = useOverwhelmedStore()
  const { categories } = useCategoryStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [loaded, setLoaded] = useState(false)
  const [sliderValue, setSliderValue] = useState(50)
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('average')
  const [chillLockUntil, setChillLockUntil] = useState<number | null>(null)
  const [showChillLockModal, setShowChillLockModal] = useState(false)
  const [pendingChillValue, setPendingChillValue] = useState<number | null>(null)
  const [weeklyAnalysis, setWeeklyAnalysis] = useState<AnalysisResult | null>(null)
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [advisory, setAdvisory] = useState<{ advice: string; source?: 'gemini' | 'groq' } | null>(null)
  const [sparkHistory, setSparkHistory] = useState<SparkEntry[]>([])
  const lastSummary = useRef('')
  const summaryRequest = useRef(0)
  const lastSignals = useRef('')

  const loadTasks = useCallback(() => {
    return getTasks()
      .then(data => {
        setTasks(data)
        setLoaded(true)
      })
      .catch(() => {})
  }, [])

  // Live refresh: pick up tasks added elsewhere (e.g. balance-popup suggestions)
  useEffect(() => {
    window.addEventListener('loadlight:tasks-changed', loadTasks)
    return () => window.removeEventListener('loadlight:tasks-changed', loadTasks)
  }, [loadTasks])

  // Load tasks + balance mode
  useEffect(() => {
    loadTasks()
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
  }, [loadTasks])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!loaded) return
    const signals = getTaskSignals(tasks, now)
    const key = JSON.stringify(signals)
    if (lastSignals.current === key) return
    lastSignals.current = key
    computeAndTransition(signals)
  }, [tasks, loaded, now, computeAndTransition])

  const pending = activeWorkload(tasks, now)
  const day = getDailyWorkload(tasks, balanceMode, now)
  const week = useMemo(() => getWeeklyWorkload(tasks, now), [tasks, now])
  const advicePlan = useMemo(() => dailyAdvicePlan(tasks, now), [tasks, now])
  const nextStep = describeDailyPlan(advicePlan)
  const completed = tasks.filter(task => task.done || task.status === 'completed').length
  const plannedWork = day.tasks.filter(task => WORK_CATEGORIES.test(task.category))
    .reduce((sum, task) => sum + taskMinutes(task), 0)
  const targetWork = balanceMode === 'beast' ? 70 : balanceMode === 'average' ? 50 : 30
  const workPct = day.minutes > 0 ? Math.round(plannedWork / day.minutes * 100) : 0
  const donePct = tasks.length > 0 ? Math.round(completed / tasks.length * 100) : 0
  const upcoming = pending.map(task => ({ ...task, deadline: workloadDeadline(task, now) }))
  const pendingTasks = upcoming.slice().sort((a, b) =>
    nextCommitmentTime(a, day.today) - nextCommitmentTime(b, day.today) || (a.priority ?? 3) - (b.priority ?? 3)
  ).slice(0, 5)
  const dueSoon = upcoming.filter(task => dueIn48Hours(task.deadline, now)).length

  useEffect(() => {
    if (!loaded) return
    const today = day.today
    const history = loadSparkHistory()
    const entry: SparkEntry = { date: today, undone: pending.length, done: completed, minutes: day.minutes, dueSoon }
    const updated = [...history.filter(day => day.date !== today), entry].slice(-8)
    saveSparkHistory(updated)
    setSparkHistory(updated)
  }, [day.today, day.minutes, pending.length, completed, dueSoon, loaded])

  const fetchSummary = useCallback(async () => {
    const request = ++summaryRequest.current
    setIsAnalysing(true)
    setAdvisory(null)
    setWeeklyAnalysis(null)
    const { state: currentState, signals } = useOverwhelmedStore.getState()
    try {
      const [summary, advice] = await Promise.allSettled([
        fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'weekly', week, balanceMode, todayStr: advicePlan.today, currentTime: advicePlan.currentTime }),
        }).then(res => res.ok ? res.json() as Promise<AnalysisResult> : null),
        fetch('/api/ai/advise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state: currentState,
            signals: { taskAccumulation: signals.taskAccumulation, temporalPressure: signals.temporalPressure },
            taskCount: pending.length,
            urgentCount: dueSoon,
            todayMinutes: day.minutes,
            capacityMinutes: day.capacity,
            effortPoints: day.effortPoints,
            demandingTasks: day.demandingTasks,
            plan: { ...advicePlan, conflicts: advicePlan.conflicts?.slice(0, 5) },
          }),
        }).then(res => res.ok ? res.json() as Promise<{ advice: string | null; source?: 'gemini' | 'groq' }> : null),
      ])
      if (request !== summaryRequest.current) return
      if (summary.status === 'fulfilled') setWeeklyAnalysis(summary.value)
      if (advice.status === 'fulfilled') {
        const result = advice.value
        setAdvisory(result?.advice ? { advice: result.advice, source: result.source } : null)
      }
    } finally {
      if (request === summaryRequest.current) setIsAnalysing(false)
    }
  }, [week, balanceMode, pending.length, dueSoon, day.minutes, day.capacity, day.effortPoints, day.demandingTasks, advicePlan])

  // Refresh when the work or the next commitment changes, including an appointment starting.
  const summaryKey = JSON.stringify([state, balanceMode, pending.length, dueSoon, day.minutes, day.capacity, day.effortPoints, day.demandingTasks, week,
    advicePlan.today, advicePlan.next, advicePlan.appointment, advicePlan.flexible, advicePlan.conflicts, advicePlan.resolutions])
  useEffect(() => {
    if (!loaded || lastSummary.current === summaryKey) return
    lastSummary.current = summaryKey
    if (!tasks.length) {
      summaryRequest.current++
      setAdvisory(null)
      setWeeklyAnalysis(null)
      setIsAnalysing(false)
      return
    }
    void fetchSummary()
  }, [loaded, tasks.length, summaryKey, fetchSummary])

  const chillLocked = !!chillLockUntil && Date.now() < chillLockUntil

  function handleSliderChange(v: number) {
    if (chillLocked && v > 40) {
      setSliderValue(30)
      return
    }
    const mode: BalanceMode = v <= 40 ? 'chill' : v <= 60 ? 'average' : 'beast'
    if (mode === 'chill' && balanceMode !== 'chill') {
      setPendingChillValue(v)
      setShowChillLockModal(true)
      return
    }
    applySliderMode(v, mode, null)
  }

  function applySliderMode(v: number, mode: BalanceMode, lockDays: number | null) {
    setSliderValue(v)
    setBalanceMode(mode)
    if (mode === 'chill' && lockDays) {
      const until = Date.now() + lockDays * 24 * 60 * 60 * 1000
      setChillLockUntil(until)
      try { localStorage.setItem('loadlight-chill-lock', String(until)) } catch { /* ignore */ }
    }
    try {
      const u = localStorage.getItem('loadlight-user')
      const p = u ? JSON.parse(u) as Record<string, unknown> : {}
      localStorage.setItem('loadlight-user', JSON.stringify({ ...p, balanceMode: mode, sliderValue: v }))
      window.dispatchEvent(new Event('loadlight:balance-mode-changed'))
    } catch { /* ignore */ }
  }

  function confirmChillLock(lockDays: number | null) {
    if (pendingChillValue !== null) {
      applySliderMode(pendingChillValue, 'chill', lockDays)
    }
    setShowChillLockModal(false)
    setPendingChillValue(null)
  }

  async function handleSnooze(ids: string[]) {
    const now = Date.now()
    const snoozedUntil = now + 24 * 60 * 60_000
    const eligible = (await getTasks()).filter(task => ids.includes(task.id) && canSnoozeTask(task, now))
    const settled = await Promise.allSettled(eligible.map(task => updateTask(task.id, { snoozedUntil })))
    await loadTasks()
    return eligible.filter((_, index) => settled[index].status === 'fulfilled').map(task => task.id)
  }

  return (
    <AppLayout>
      {showChillLockModal && (
        <div className="anim-overlay-in" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: 16 }}>
          <div className="skeu-card max-w-sm w-full p-6 anim-scale-in">
            <div className="mb-4">
              <h2 className="font-black text-lg mb-1" style={{ color: '#1a1a1a' }}>Switching to Chill Guy</h2>
              <p className="text-sm font-bold" style={{ color: '#5a7a9a' }}>Do you want to set a commitment lock? This prevents impulsive switching back.</p>
            </div>
            <div className="flex flex-col gap-2 mb-4">
              {[7, 14, 30].map(days => (
                <button
                  key={days}
                  onClick={() => confirmChillLock(days)}
                  className="vista-btn-secondary font-bold text-sm py-2.5 text-left px-4 rounded-xl"
                >
                  Lock for {days} days
                </button>
              ))}
              <button
                onClick={() => confirmChillLock(null)}
                className="vista-btn-secondary font-bold text-sm py-2.5 text-left px-4 rounded-xl opacity-70"
              >
                No lock, switch freely
              </button>
            </div>
            <button
              onClick={() => { setShowChillLockModal(false); setPendingChillValue(null) }}
              className="w-full vista-btn-secondary font-bold text-sm py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4 max-w-4xl mx-auto">

        <h1 className={styles.pageTitle}>Workload overview</h1>
        <OverwhelmedFeedback minutes={day.minutes} capacity={day.capacity} activeCount={day.tasks.length} rest={state === 'overwhelmed'} />

        {/* ── Chill Mode suggestions (only in chill balance mode) ── */}
        {balanceMode === 'chill' && tasks.length > 0 && (
          <ChillSuggestions
            tasks={tasks}
            onSnooze={handleSnooze}
          />
        )}

        {/* ── Stats row with sparklines ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 anim-fade-in-up" style={{ animationDelay: '0.05s' }}>
          <StatCard label="Total tasks"      value={tasks.length}                                      color="text-sky-800"                                    sparkData={sparkHistory} sparkKey="undone"   sparkColor="#0ea5e9" />
          <StatCard label="Completed"        value={completed}                  color="text-emerald-800"                                sparkData={sparkHistory} sparkKey="done"    sparkColor="#10b981" />
          <StatCard label="Hours planned today"  value={`${Math.round(day.minutes / 60 * 10) / 10}h`}        color="text-purple-800"                                 sparkData={sparkHistory} sparkKey="minutes" sparkColor="#a855f7" deltaFormat={m => `${Math.round(m / 60 * 10) / 10}h`} />
          <StatCard label="Due soon"         value={dueSoon}                                     color={dueSoon > 0 ? 'text-red-800' : 'text-slate-700'} sparkData={sparkHistory} sparkKey="dueSoon" sparkColor="#ef4444" />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* ── Balance card with slider ── */}
          <div className="skeu-card p-5 anim-fade-in-up" style={{ animationDelay: '0.08s' }}>
            <div className="flex items-center gap-2 mb-3">
              <ClassicIcon name="balanced" size={20} />
              <h2 className="font-black" style={{ color: '#1a2a3a' }}>Balance</h2>
            </div>

            {/* Work gauge — only meaningful with enough active tasks */}
            {day.tasks.length >= 4 ? (
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
                {day.tasks.length === 0
                  ? 'No tasks planned for today.'
                  : `Only ${day.tasks.length} task${day.tasks.length > 1 ? 's' : ''} for today — balance gauge needs 4+ tasks to be meaningful.`}
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

            {day.tasks.length >= 4 && workPct > targetWork + 15 && (
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
                <ClassicIcon name="tasks" size={20} />
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
                      <ClassicIcon name={categoryIconName(cat ?? { name: t.category })} size={18} alt={t.category} />
                      <span className="flex-1 text-sm font-semibold truncate" style={{ color: '#1a1a1a' }}>{t.name}</span>
                      {dueIn48Hours(t.deadline, now) && (
                        <span className="text-xs text-red-500 font-bold shrink-0">Due soon!</span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${cls.bg} ${cls.text} badge-skeu shrink-0 shadow-sm border border-white/10`}>
                        {t.category}
                      </span>
                    </div>
                  )
                })}
                {pending.length > 5 && (
                  <p className="text-xs text-slate-400 text-center pt-1 font-bold">+{pending.length - 5} more tasks</p>
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
              <ClassicIcon name="chart" size={20} />
              <h2 className="font-black" style={{ color: '#1a2a3a' }}>Workload Analysis</h2>
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

          {state !== 'overwhelmed' && (
            <div className={advicePlan.conflicts?.length || nextStep ? 'mb-3' : undefined}>
              <ScheduleConflicts conflicts={advicePlan.conflicts} />
              {nextStep && <p className="font-semibold">{nextStep}</p>}
            </div>
          )}
          {day.tasks.length > 0 && (
            <p className="mb-3 text-sm"><strong>{day.effortPoints} effort points</strong> · {day.demandingTasks} higher-effort {day.demandingTasks === 1 ? 'task' : 'tasks'} today</p>
          )}
          {isAnalysing && !weeklyAnalysis ? (
            <div className="skeu-inset rounded-2xl p-6 text-center">
              <Loader2 className="w-8 h-8 mx-auto mb-2 text-purple-500/50 animate-spin" />
              <p className="text-sm text-slate-400 font-bold">Analysing your workload…</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Real-time advisory (spec: 1-2 sentence observation) */}
              {advisory && state !== 'overwhelmed' && (
                <div className="skeu-inset rounded-2xl p-4 border-l-4" style={{ borderLeftColor: 'rgba(139,92,246,0.60)' }}>
                  <p className="text-xs font-bold">{advisory.source === 'groq' ? 'Groq suggestion' : 'Gemini suggestion'}</p>
                  <p className="text-sm leading-relaxed font-medium" style={{ color: '#1a2a3a' }}>{advisory.advice}</p>
                </div>
              )}

              <div className="skeu-inset rounded-2xl p-4">
                <h3 className="font-bold">This week</h3>
                <p>{week.completed} completed, {week.pending} pending, {week.minutes} min left</p>
              </div>
              {weeklyAnalysis && weeklyAnalysis.source !== 'rules' ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold">{weeklyAnalysis.source === 'groq' ? 'Groq summary' : 'Gemini summary'}</p>
                  <p>{weeklyAnalysis.trend}</p>
                  {weeklyAnalysis.advice && <p>{weeklyAnalysis.advice}</p>}
                  {weeklyAnalysis.suggestion && <p>{weeklyAnalysis.suggestion}</p>}
                </div>
              ) : (
                <p className="text-sm">
                  {tasks.length > 0
                    ? 'Showing task totals. AI summary unavailable.'
                    : 'Add tasks to see your workload.'}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
