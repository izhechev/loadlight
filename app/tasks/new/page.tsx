"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { Brain, Loader2, CheckCircle, Trash2, Plus, Calendar, ArrowLeft, Zap, AlertTriangle, RefreshCw, Flag, StickyNote, PlayCircle, HelpCircle } from "lucide-react"
import { AppLayout } from "@/components/app-layout"
import { useCategoryStore, getCategoryClasses } from "@/lib/store/categoryStore"
import { useOverwhelmedStore } from "@/lib/store/overwhelmedStore"
import { addTasks, IS_DEMO } from "@/lib/data/tasks"
import { CrisisRedirect } from "@/components/rest-mode-overlay"

// Crisis phrase detection — checked before any AI call
// Single words that are unambiguous crisis signals when entered alone
const CRISIS_STANDALONE = new Set(['kill', 'suicide', 'suicidal', 'die', 'dying'])

// Multi-word crisis phrase patterns
const CRISIS_PATTERNS = [
  /\bkill\s*(my)?self\b/i,
  /\bsuicid(e|al)\b/i,
  /\bend\s+(my|it\s+all|this|my\s+life)\b/i,
  /\bwant\s+to\s+(die|end it)\b/i,
  /\b(don'?t|do\s+not)\s+want\s+to\s+live\b/i,
  /\bnot\s+worth\s+living\b/i,
  /\bhurt\s+my\s*self\b/i,
  /\bself[\s-]harm\b/i,
  /\btake\s+my\s+(own\s+)?life\b/i,
  /\bno\s+(reason|point)\s+to\s+(live|go\s+on)\b/i,
]

function containsCrisisPhrase(text: string): boolean {
  const trimmed = text.trim().toLowerCase()
  // Standalone crisis word (e.g. "Kill", "suicide" with nothing else)
  if (CRISIS_STANDALONE.has(trimmed)) return true
  return CRISIS_PATTERNS.some(p => p.test(text))
}

type DemandType = 'cognitive' | 'emotional' | 'creative' | 'routine' | 'physical'

interface ExtractedTask {
  name: string
  category: string
  demand_type: DemandType
  difficulty: number
  deadline: string | null       // "YYYY-MM-DDTHH:mm" — date + optional time
  start_date: string | null     // "YYYY-MM-DDTHH:mm" — when to begin
  priority: 1 | 2 | 3 | 4      // 1=urgent, 2=high, 3=normal, 4=low
  notes: string
  estimated_minutes: number | null
  recurring?: 'none' | 'daily' | 'weekly'
  times_per_day?: number
  recurring_hours?: number | null  // e.g. 8 → "every 8 hours"
}

const DEMAND_COLORS: Record<DemandType, string> = {
  cognitive: 'bg-sky-100/90 text-sky-700',
  emotional: 'bg-pink-100/90 text-pink-700',
  creative: 'bg-purple-100/90 text-purple-700',
  routine: 'bg-blue-100/90 text-blue-700',
  physical: 'bg-teal-100/90 text-teal-700',
}

function difficultyLabel(d: number): string {
  return ['', 'Trivial', 'Easy', 'Moderate', 'Hard', 'Extreme'][d] ?? String(d)
}

function difficultyColor(d: number): string {
  if (d <= 1) return 'bg-green-100 text-green-700'
  if (d <= 2) return 'bg-lime-100 text-lime-700'
  if (d <= 3) return 'bg-yellow-100 text-yellow-700'
  if (d <= 4) return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}

interface Clarification {
  question: string
  taskName: string
  options: { label: string; recurring: 'none' | 'daily' | 'weekly' }[]
}

export default function AddTaskPage() {
  const router = useRouter()
  const shouldReduceMotion = useReducedMotion()
  const { state: overwhelmedState } = useOverwhelmedStore()
  const { categories } = useCategoryStore()
  const [input, setInput] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [preview, setPreview] = useState<ExtractedTask[] | null>(null)
  const [clarification, setClarification] = useState<Clarification | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showOverwhelmedConfirm, setShowOverwhelmedConfirm] = useState(false)
  const [showCrisisModal, setShowCrisisModal] = useState(false)
  const [showBlockedModal, setShowBlockedModal] = useState(false)

  // Restore tasks from localStorage
  function getStoredTasks(): ExtractedTask[] {
    try { return JSON.parse(localStorage.getItem('loadlight-tasks') ?? '[]') as ExtractedTask[] } catch { return [] }
  }

  function applyClarification(recurring: 'none' | 'daily' | 'weekly') {
    if (!clarification || !preview) return
    setPreview(prev => prev!.map(t =>
      t.name === clarification.taskName ? { ...t, recurring } : t
    ))
    setClarification(null)
  }

  async function handleExtractIntent() {
    if (!input.trim()) return
    // Instant local check for obvious crisis phrases (no network)
    if (containsCrisisPhrase(input)) { setShowCrisisModal(true); return }
    if (overwhelmedState === 'overwhelmed') { setShowOverwhelmedConfirm(true); return }
    await doExtract()
  }

  async function doExtract() {
    setIsExtracting(true)
    setPreview(null)
    setClarification(null)
    setError(null)
    try {
      const res = await fetch('/api/ai/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: input,
          categories: categories.map(c => c.name),
        }),
      })
      if (!res.ok) throw new Error('API error')
      const data = await res.json() as { tasks?: ExtractedTask[]; clarification?: Clarification | null; blocked?: boolean; category?: string; offline?: boolean; _debug?: unknown }
      if (data.blocked) {
        if (data.category === 'self_harm') { setShowCrisisModal(true) } else { setShowBlockedModal(true) }
        return
      }
      if (data.offline) {
        setError('AI unavailable — fields pre-filled from your input. Edit before saving.')
      }
      if (data.tasks?.length) {
        setPreview(data.tasks.map(t => ({ ...t, recurring: t.recurring || 'none', recurring_hours: t.recurring_hours ?? null })))
        if (data.clarification?.question) setClarification(data.clarification)
      } else {
        throw new Error('No tasks extracted')
      }
    } catch {
      // NFR-8: fallback to manual entry
      setPreview([{
        name: input,
        category: 'personal',
        demand_type: 'routine',
        difficulty: 2,
        deadline: null,
        start_date: null,
        priority: 3,
        notes: '',
        estimated_minutes: 30,
        recurring: 'none',
        times_per_day: 1,
        recurring_hours: null
      }])
      setError('AI unavailable — added as manual task. You can edit the details below.')
    } finally {
      setIsExtracting(false)
    }
  }

  // keep old name used by button
  const handleExtract = handleExtractIntent

  async function confirm() {
    if (!preview) return

    const finalTasks: any[] = []
    preview.forEach(t => {
      const times = t.times_per_day || 1
      if (times > 1) {
        for (let i = 1; i <= times; i++) {
          finalTasks.push({ ...t, name: `${t.name} (${i}/${times})`, id: Math.random().toString(36).slice(2), done: false, createdAt: Date.now() })
        }
      } else {
        finalTasks.push({ ...t, id: Math.random().toString(36).slice(2), done: false, createdAt: Date.now() })
      }
    })

    // Demo: keep localStorage in sync for other pages
    if (IS_DEMO) {
      const existing = getStoredTasks()
      localStorage.setItem('loadlight-tasks', JSON.stringify([...existing, ...finalTasks]))
    }

    await addTasks(finalTasks.map(t => ({
      name: t.name,
      category: t.category ?? 'Personal',
      lifeDomain: t.life_domain ?? 'personal',
      demandType: t.demand_type ?? 'routine',
      difficulty: t.difficulty ?? 2,
      priority: t.priority ?? 3,
      deadline: (() => {
        const timeMatch = t.name.match(/\b(\d{1,2}):(\d{2})\b/)
        if (timeMatch) {
          const dateStr = t.deadline ? t.deadline.split('T')[0] : new Date().toISOString().split('T')[0]
          return `${dateStr}T${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
        }
        return t.deadline ?? null
      })(),
      startDate: t.start_date ?? null,
      estimatedMinutes: t.estimated_minutes ?? null,
      notes: t.notes ?? '',
      status: 'active' as const,
      recurring: t.recurring ?? 'none',
      recurringHours: t.recurring_hours ?? null,
    }))).catch(() => {})

    setSaved(true)
    setTimeout(() => router.push('/tasks'), 800)
  }

  const mc = shouldReduceMotion ? { duration: 0 } : { duration: 0.22 }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="page-header flex items-center gap-3">
          <button onClick={() => router.back()} className="text-slate-500 hover:text-slate-800 transition-colors bg-white/50 p-2 rounded-full border border-sky-100/60 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-800">Add Tasks</h1>
            <p className="text-sm text-slate-500 font-bold">Type naturally — AI extracts and classifies each task</p>
          </div>
        </div>

        {/* Crisis support modal — shown instead of task extraction when crisis phrases detected */}
        <AnimatePresence>
          {showCrisisModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.92, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.92, y: 20 }}
                transition={mc}
                className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl border border-rose-200/60"
              >
                <h2 className="text-lg font-black text-slate-800 mb-1">This app manages tasks, not crises</h2>
                <p className="text-sm text-slate-500 mb-4">If you're going through something difficult, there are people who can help right now.</p>
                <CrisisRedirect />
                <button
                  onClick={() => { setShowCrisisModal(false); setInput('') }}
                  className="w-full glow-button font-black py-2.5 text-sm mt-2"
                >
                  Close
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Harmful content blocked modal */}
        <AnimatePresence>
          {showBlockedModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.92, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.92, y: 20 }}
                transition={mc}
                className="glass-panel w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-200/60"
              >
                <h2 className="text-lg font-black text-slate-800 mb-2">That can't be added as a task</h2>
                <p className="text-sm text-slate-500 mb-5">This app is for managing your work and daily tasks.</p>
                <button
                  onClick={() => { setShowBlockedModal(false); setInput('') }}
                  className="w-full glow-button font-black py-2.5 text-sm"
                >
                  OK
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Overwhelmed confirmation dialog */}
        <AnimatePresence>
          {showOverwhelmedConfirm && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={mc}
              className="glass-panel p-6 border-2 border-amber-200/60"
            >
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h2 className="font-black text-slate-800 mb-1">You're in Rest Mode</h2>
                  <p className="text-sm text-slate-600">Adding more tasks while overwhelmed can make things worse. Are you sure you want to continue?</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowOverwhelmedConfirm(false); doExtract() }}
                  className="flex-1 bg-amber-100/80 hover:bg-amber-200/80 text-amber-800 border border-amber-200/60 font-black text-sm py-2.5 rounded-xl transition-all"
                >
                  Add anyway
                </button>
                <button
                  onClick={() => setShowOverwhelmedConfirm(false)}
                  className="flex-1 glow-button font-black text-sm py-2.5"
                >
                  Cancel — rest first
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input form */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={mc} className="glass-panel p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-sky-600" />
              <h2 className="font-bold text-slate-700">Natural Language Input</h2>
            </div>
            <textarea
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleExtract() }}
              placeholder={'"Finish the report by Friday, buy groceries, call mom, hit the gym"'}
              className="input-skeu w-full rounded-xl p-4 text-sm text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none min-h-[100px]"
              rows={4}
            />
            {error && (
              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-3.5 h-3.5" /> {error}
              </p>
            )}
            <div className="flex justify-between items-center mt-3">
              <p className="text-xs text-slate-400 font-bold italic">Ctrl+Enter to extract</p>
              <button
                onClick={handleExtract}
                disabled={isExtracting || !input.trim()}
                className="glow-button font-black px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                {isExtracting ? 'Extracting...' : 'Extract Tasks'}
              </button>
            </div>
          </motion.div>

        {/* Preview */}
        <AnimatePresence>
          {preview && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={mc}
              className="glass-panel p-6"
            >
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                AI Extracted {preview.length} Task{preview.length !== 1 ? 's' : ''} — Review &amp; Confirm
              </p>

              {/* Clarifying question */}
              <AnimatePresence>
                {clarification && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="mb-4 bg-sky-50 border border-sky-200 rounded-2xl p-4"
                  >
                    <p className="text-xs font-black text-sky-600 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5" /> Quick question
                    </p>
                    <p className="text-sm font-semibold text-sky-900 mb-3">{clarification.question}</p>
                    <div className="flex flex-wrap gap-2">
                      {clarification.options.map(opt => (
                        <button
                          key={opt.label}
                          onClick={() => applyClarification(opt.recurring)}
                          className="px-3 py-1.5 rounded-full text-xs font-black bg-white border border-sky-200 text-sky-700 hover:bg-sky-100 transition-colors shadow-sm"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-3">
                {preview.map((task, i) => {
                  const catName = (task.category || 'Personal').toLowerCase()
                  const cat = categories.find(c => c.name.toLowerCase() === catName || c.id === task.category)
                  const cls = getCategoryClasses(cat?.color ?? 'sky')
                  return (
                  <div key={i} className={`bg-white/50 rounded-2xl border border-sky-100/60 overflow-hidden ${cls.bg.replace('bg-', 'border-l-4 border-l-')}`}>
                    {/* Task row */}
                    <div className="flex items-center gap-3 p-4">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="flex-1 font-bold text-slate-800 text-sm">{task.name}</span>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${cls.bg} ${cls.text} badge-skeu shrink-0 border border-sky-100/50 shadow-sm`}>{cat?.emoji ?? '📌'} {task.category}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${DEMAND_COLORS[task.demand_type]} border border-sky-100/50 shadow-sm`}>{task.demand_type}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${difficultyColor(task.difficulty)} border border-white/5 shadow-sm`}>{difficultyLabel(task.difficulty)}</span>
                        {task.estimated_minutes && <span className="text-[10px] text-slate-400 font-bold">{task.estimated_minutes}m</span>}
                      </div>
                      <button onClick={() => setPreview(prev => prev?.filter((_, j) => j !== i) ?? null)} className="text-slate-500 hover:text-red-400 transition-colors ml-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {/* Date / time / priority / notes row */}
                    <div className="px-4 pb-3 border-t border-sky-100/50 pt-2 space-y-2">

                      {/* Row 1: deadline + start date */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Due:</span>
                          <input
                            type="datetime-local"
                            value={task.deadline ?? ''}
                            onChange={e => setPreview(prev => prev?.map((t, j) => j === i ? { ...t, deadline: e.target.value || null } : t) ?? null)}
                            className="input-skeu text-[10px] rounded-lg px-2 py-1 text-slate-700 focus:outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <PlayCircle className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Start:</span>
                          <input
                            type="datetime-local"
                            value={task.start_date ?? ''}
                            onChange={e => setPreview(prev => prev?.map((t, j) => j === i ? { ...t, start_date: e.target.value || null } : t) ?? null)}
                            className="input-skeu text-[10px] rounded-lg px-2 py-1 text-slate-700 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Row 2: priority + recurring */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <div className="flex items-center gap-2">
                          <Flag className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Priority:</span>
                          <div className="flex gap-1">
                            {([1, 2, 3, 4] as const).map(p => (
                              <button
                                key={p}
                                onClick={() => setPreview(prev => prev?.map((t, j) => j === i ? { ...t, priority: p } : t) ?? null)}
                                className={`text-[9px] px-2 py-0.5 rounded-md font-black transition-all border ${
                                  task.priority === p
                                    ? p === 1 ? 'bg-red-100 text-red-700 border-red-300'
                                    : p === 2 ? 'bg-orange-100 text-orange-700 border-orange-300'
                                    : p === 3 ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
                                    : 'bg-slate-100 text-slate-500 border-slate-200'
                                    : 'bg-white/60 text-slate-400 border-slate-200 hover:bg-white/80'
                                }`}
                              >
                                {p === 1 ? 'P1 🔴' : p === 2 ? 'P2 🟠' : p === 3 ? 'P3 🟡' : 'P4'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Repeat:</span>
                          <div className="flex bg-sky-50/70 rounded-lg p-0.5 border border-sky-100/60">
                            {(['none', 'daily', 'weekly'] as const).map(mode => (
                              <button
                                key={mode}
                                onClick={() => setPreview(prev => prev?.map((t, j) => j === i ? { ...t, recurring: mode, recurring_hours: null } : t) ?? null)}
                                className={`text-[9px] px-2 py-0.5 rounded-md font-black transition-all ${
                                  (task.recurring || 'none') === mode && !task.recurring_hours
                                    ? 'bg-white/90 text-sky-800 shadow-inner'
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                              >
                                {mode.charAt(0).toUpperCase() + mode.slice(1)}
                              </button>
                            ))}
                            <button
                              onClick={() => setPreview(prev => prev?.map((t, j) => j === i ? { ...t, recurring: 'daily', recurring_hours: task.recurring_hours ?? 8 } : t) ?? null)}
                              className={`text-[9px] px-2 py-0.5 rounded-md font-black transition-all ${
                                task.recurring_hours
                                  ? 'bg-white/90 text-violet-800 shadow-inner'
                                  : 'text-slate-500 hover:text-slate-700'
                              }`}
                            >
                              Every Xh
                            </button>
                          </div>
                          {task.recurring_hours ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-500 font-bold">every</span>
                              <input
                                type="number"
                                min="1"
                                max="23"
                                value={task.recurring_hours}
                                onChange={e => setPreview(prev => prev?.map((t, j) => j === i ? { ...t, recurring_hours: parseInt(e.target.value) || 1 } : t) ?? null)}
                                className="input-skeu w-10 text-[10px] rounded-lg px-2 py-1 text-slate-700 focus:outline-none"
                              />
                              <span className="text-[10px] text-slate-500 font-bold">h</span>
                            </div>
                          ) : task.recurring === 'daily' && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Times/day:</span>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                value={task.times_per_day || 1}
                                onChange={e => setPreview(prev => prev?.map((t, j) => j === i ? { ...t, times_per_day: parseInt(e.target.value) || 1 } : t) ?? null)}
                                className="input-skeu w-10 text-[10px] rounded-lg px-2 py-1 text-slate-700 focus:outline-none"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Row 3: notes */}
                      <div className="flex items-start gap-2">
                        <StickyNote className="w-3.5 h-3.5 text-slate-500 mt-1 shrink-0" />
                        <input
                          type="text"
                          placeholder="Notes (optional)"
                          value={task.notes}
                          onChange={e => setPreview(prev => prev?.map((t, j) => j === i ? { ...t, notes: e.target.value } : t) ?? null)}
                          className="input-skeu flex-1 text-[10px] rounded-lg px-2 py-1 text-slate-700 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                  )
                })}
              </div>
              <div className="flex gap-3 mt-5">
                {saved ? (
                  <div className="flex items-center gap-2 text-emerald-600 font-black text-sm">
                    <CheckCircle className="w-4 h-4" /> Saved! Redirecting…
                  </div>
                ) : (
                  <>
                    <button onClick={confirm} className="glow-button font-black px-6 py-2.5 text-sm flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Save {preview.length} Task{preview.length !== 1 ? 's' : ''}
                    </button>
                    <button onClick={() => { setPreview(null); setInput('') }} className="bg-white/50 border border-sky-100/60 text-slate-500 font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-white/80 hover:text-slate-700 transition-all">
                      Discard
                    </button>
                  </>
                )}
              </div>
              <p className="text-[10px] text-slate-500 font-bold mt-3 italic">🤖 AI-generated · all fields editable before saving</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  )
}
