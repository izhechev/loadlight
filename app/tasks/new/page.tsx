/* eslint-disable react/no-unescaped-entities */
"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Brain, Loader2, CheckCircle, Trash2, Plus, ArrowLeft, Zap, AlertTriangle, RefreshCw, Flag, StickyNote } from "@/lib/icons"
import { AppLayout } from "@/components/app-layout"
import { useCategoryStore, getCategoryClasses } from "@/lib/store/categoryStore"
import { ClassicIcon, categoryIconName } from "@/lib/classic-icons"
import { useOverwhelmedStore } from "@/lib/store/overwhelmedStore"
import { addTasks, type Task } from "@/lib/data/tasks"
import { extractTaskDrafts, LIFE_DOMAINS, needsTaskDetails, taskPreview, type TaskPreview as ExtractedTask } from "@/lib/ai/taskExtraction"
import { inferTitleEffort } from "@/lib/utils/taskEffort"
import { TaskClarificationDialog } from "@/components/task-clarification-dialog"
import { localDateStr } from "@/lib/utils/scheduling"
import { isPastDeadline } from "@/lib/utils/recurrence"
import { CrisisRedirect } from "@/components/rest-mode-overlay"
import { PastDeadlineModal } from "@/components/past-deadline-modal"

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

const previewInputClass = 'input-skeu min-w-0 rounded-lg px-2 py-1 text-xs text-slate-700'

function TaskDateField({ label, value, onChange }: {
  label: string
  value: string | null
  onChange: (value: string | null) => void
}) {
  const hasTime = !!value?.replace(' ', 'T').includes('T')
  const calendarDate = value?.slice(0, 10) ?? localDateStr()
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
        {label}
        <input
          type={hasTime ? 'datetime-local' : 'date'}
          value={value?.replace(' ', 'T').slice(0, hasTime ? 16 : 10) ?? ''}
          onChange={e => onChange(e.target.value || null)}
          className={previewInputClass}
        />
      </label>
      <button
        type="button"
        className="text-xs font-semibold text-sky-800 underline underline-offset-2"
        aria-label={`${hasTime ? 'Remove' : 'Add'} ${label.toLowerCase()} time`}
        onClick={() => onChange(hasTime ? calendarDate : `${calendarDate}T09:00`)}
      >
        {hasTime ? 'Remove time' : 'Add time'}
      </button>
    </div>
  )
}

function storedDate(value: string | null): string | null {
  if (!value || !value.replace(' ', 'T').includes('T')) return value
  return `${value.replace(' ', 'T').slice(0, 16)}Z`
}

type DemandType = ExtractedTask['demand_type']

const DEMAND_TYPES: DemandType[] = ['cognitive', 'emotional', 'creative', 'routine', 'physical']

function difficultyLabel(d: number): string {
  return ['', 'Trivial', 'Easy', 'Moderate', 'Hard', 'Extreme'][d] ?? String(d)
}

interface Clarification {
  question: string
  taskName: string
  options: { label: string; recurring: ExtractedTask['recurring']; recurring_hours?: number | null }[]
}

export default function AddTaskPage() {
  const router = useRouter()
  const { state: overwhelmedState } = useOverwhelmedStore()
  const { categories } = useCategoryStore()
  const [input, setInput] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [preview, setPreview] = useState<ExtractedTask[] | null>(null)
  const [clarification, setClarification] = useState<Clarification | null>(null)
  const [unclear, setUnclear] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [offlineDraft, setOfflineDraft] = useState(false)
  const [showOverwhelmedConfirm, setShowOverwhelmedConfirm] = useState(false)
  const [showCrisisModal, setShowCrisisModal] = useState(false)
  const [showBlockedModal, setShowBlockedModal] = useState(false)
  const [pastDeadlineQueue, setPastDeadlineQueue] = useState<ExtractedTask[]>([])
  const [currentPastDeadlineTask, setCurrentPastDeadlineTask] = useState<ExtractedTask | null>(null)
  const [resolvedTasks, setResolvedTasks] = useState<ExtractedTask[]>([])

  function updateDraft(index: number, changes: Partial<ExtractedTask>) {
    setPreview(drafts => drafts?.map((draft, i) => i === index ? { ...draft, ...changes } : draft) ?? null)
  }

  function showDrafts(drafts: ExtractedTask[], modelUnclear?: string[]) {
    setPreview(drafts)
    setUnclear(drafts.flatMap((draft, index) =>
      needsTaskDetails(draft.name) || modelUnclear?.includes(draft.name) ? [index] : [],
    ))
  }

  const unclearIndex = unclear[0]
  const unclearDraft = preview?.[unclearIndex]
  const skipUnclear = () => setUnclear(current => current.slice(1))

  function applyClarification(option: Clarification['options'][number]) {
    if (!clarification) return
    setPreview(drafts => drafts?.map(draft =>
      draft.name === clarification.taskName
        ? { ...draft, recurring: option.recurring, recurring_days: null, recurring_hours: option.recurring_hours ?? null }
        : draft
    ) ?? null)
    setClarification(null)
  }

  async function handleExtractIntent() {
    if (isExtracting || savingRef.current || !input.trim()) return
    // Instant local check for obvious crisis phrases (no network)
    if (containsCrisisPhrase(input)) { setShowCrisisModal(true); return }
    if (overwhelmedState === 'overwhelmed') { setShowOverwhelmedConfirm(true); return }
    await doExtract()
  }

  async function doExtract() {
    setIsExtracting(true)
    setPreview(null)
    setClarification(null)
    setUnclear([])
    setError(null)
    const today = localDateStr()
    const categoryNames = categories.map(category => category.name)
    try {
      const res = await fetch('/api/ai/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: input,
          categories: categoryNames,
          today,
        }),
      })
      if (!res.ok) throw new Error('API error')
      const data = await res.json() as { tasks?: ExtractedTask[]; clarification?: Clarification | null; unclearTasks?: string[]; blocked?: boolean; category?: string; offline?: boolean }
      if (data.blocked) {
        if (data.category === 'self_harm') { setShowCrisisModal(true) } else { setShowBlockedModal(true) }
        return
      }
      if (!data.tasks?.length) throw new Error('No tasks extracted')
      showDrafts(data.tasks, data.unclearTasks)
      setOfflineDraft(data.offline !== false)
      if (data.clarification?.question) setClarification(data.clarification)
    } catch {
      const tasks = extractTaskDrafts(input, today, categoryNames).map(taskPreview)
      showDrafts(tasks)
      setOfflineDraft(true)
      if (!tasks.length) setError('Enter at least one task.')
    } finally {
      setIsExtracting(false)
    }
  }

  async function performSave(tasksToSave: ExtractedTask[]) {
    if (savingRef.current || !tasksToSave.length) return
    savingRef.current = true
    setSaving(true)
    setError(null)

    const finalTasks = tasksToSave.flatMap((draft): Omit<Task, 'id' | 'createdAt'>[] => {
      const count = draft.recurring === 'daily' ? draft.times_per_day : 1
      return Array.from({ length: count }, (_, index) => ({
        name: count > 1 ? `${draft.name.trim()} (${index + 1}/${count})` : draft.name.trim(),
        category: draft.category,
        lifeDomain: draft.life_domain,
        demandType: draft.demand_type,
        difficulty: draft.difficulty,
        priority: draft.priority,
        deadline: storedDate(draft.deadline),
        startDate: storedDate(draft.start_date),
        estimatedMinutes: draft.estimated_minutes,
        notes: draft.notes,
        status: 'active',
        recurring: draft.recurring,
        recurringHours: draft.recurring_hours,
        recurringDays: draft.recurring_days,
      }))
    })

    try {
      await addTasks(finalTasks)
      setSaved(true)
      router.push('/tasks')
    } catch (err) {
      setError(err instanceof Error && err.message === 'Not authenticated'
        ? 'Sign in again to save your tasks.'
        : 'Could not save tasks. Try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function confirm() {
    if (savingRef.current || !preview?.length || preview.some(task => !task.name.trim())) return

    // The app stores the selected wall-clock time in the UTC fields.
    const now = new Date()
    const wallClockNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())
    const pastTasks: ExtractedTask[] = []
    const futureTasks: ExtractedTask[] = []

    for (const task of preview) {
      if (isPastDeadline(task.deadline, task.recurring, wallClockNow)) pastTasks.push(task)
      else futureTasks.push(task)
    }

    if (pastTasks.length > 0) {
      setPastDeadlineQueue(pastTasks.slice(1))
      setCurrentPastDeadlineTask(pastTasks[0])
      setResolvedTasks(futureTasks)
      return
    }

    await performSave(preview)
  }

  function advancePastDeadlineQueue(resolvedTask: ExtractedTask | null) {
    const newResolved = resolvedTask
      ? [...resolvedTasks, resolvedTask]
      : resolvedTasks  // null = deleted, skip

    if (pastDeadlineQueue.length > 0) {
      setResolvedTasks(newResolved)
      setCurrentPastDeadlineTask(pastDeadlineQueue[0])
      setPastDeadlineQueue(pastDeadlineQueue.slice(1))
    } else {
      // All resolved — save everything
      setCurrentPastDeadlineTask(null)
      setPastDeadlineQueue([])
      setResolvedTasks([])
      if (newResolved.length) void performSave(newResolved)
      else setPreview(null)
    }
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="page-header flex items-center gap-3">
          <button onClick={() => router.back()} className="vista-btn-secondary" style={{ padding: 8, borderRadius: '50%', flexShrink: 0 }}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-800">Add Tasks</h1>
            <p className="text-sm text-slate-500 font-bold">Type naturally — Review names, dates, and estimates before saving</p>
          </div>
        </div>

        {/* Crisis support modal */}
          {showCrisisModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 anim-overlay-in">
              <div className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl border border-rose-200/60 anim-scale-in">
                <h2 className="text-lg font-black text-slate-800 mb-1">This app manages tasks, not crises</h2>
                <p className="text-sm text-slate-500 mb-4">If you're going through something difficult, there are people who can help right now.</p>
                <CrisisRedirect />
                <button
                  onClick={() => { setShowCrisisModal(false); setInput('') }}
                  className="w-full glow-button font-black py-2.5 text-sm mt-2"
                >
                  Close
                </button>
              </div>
            </div>
          )}

        {/* Harmful content blocked modal */}
          {showBlockedModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 anim-overlay-in">
              <div className="glass-panel w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-200/60 anim-scale-in">
                <h2 className="text-lg font-black text-slate-800 mb-2">That can't be added as a task</h2>
                <p className="text-sm text-slate-500 mb-5">This app is for managing your work and daily tasks.</p>
                <button
                  onClick={() => { setShowBlockedModal(false); setInput('') }}
                  className="w-full glow-button font-black py-2.5 text-sm"
                >
                  OK
                </button>
              </div>
            </div>
          )}

        {/* Overwhelmed confirmation dialog */}
          {showOverwhelmedConfirm && (
            <div className="glass-panel p-6 border-2 border-amber-200/60 anim-fade-in">
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
            </div>
          )}

        {/* Input form */}
        <div className="glass-panel p-6 anim-fade-in-up">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-sky-600" />
              <h2 className="font-bold text-slate-700">Natural Language Input</h2>
            </div>
            <textarea
              autoFocus
              aria-label="Tasks to add"
              maxLength={8000}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleExtractIntent() }}
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
                onClick={handleExtractIntent}
                disabled={isExtracting || saving || !input.trim()}
                className="glow-button font-black px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                {isExtracting ? 'Extracting...' : 'Extract Tasks'}
              </button>
            </div>
          </div>

        {/* Preview */}
          {preview && (
            <div className="glass-panel p-6 anim-fade-in-up">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                Review {preview.length} {preview.length === 1 ? 'task' : 'tasks'}
              </p>

              <div className="space-y-3">
                {preview.map((task, i) => {
                  const catName = (task.category || 'Personal').toLowerCase()
                  const cat = categories.find(c => c.name.toLowerCase() === catName || c.id === task.category)
                  const cls = getCategoryClasses(cat?.color ?? 'sky')
                  return (
                  <div key={i} className="bg-white/50 rounded-2xl border border-sky-100/60 overflow-hidden">
                    {/* Task row */}
                    <div className="flex items-center gap-3 p-4">
                      <span className={`inline-flex shrink-0 rounded-lg p-1 ${cls.bg}`} aria-hidden="true">
                        <ClassicIcon name={categoryIconName(cat ?? { name: task.category })} size={18} />
                      </span>
                      <input
                        type="text"
                        aria-label="Task name"
                        maxLength={512}
                        value={task.name}
                        onChange={e => updateDraft(i, { name: e.target.value })}
                        className={`${previewInputClass} w-full flex-1 font-bold text-sm`}
                      />
                      <button aria-label={`Remove ${task.name || 'task'}`} onClick={() => setPreview(prev => prev?.filter((_, j) => j !== i) ?? null)} className="text-slate-500 hover:text-red-400 transition-colors ml-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {/* Date / time / priority / notes row */}
                    <div className="px-4 pb-3 border-t border-sky-100/50 pt-2 space-y-2">

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <TaskDateField label="Due date" value={task.deadline} onChange={deadline => updateDraft(i, { deadline })} />
                        <TaskDateField label="Start date" value={task.start_date} onChange={start_date => updateDraft(i, { start_date })} />
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-600">
                        <label className="flex items-center gap-1">
                          Category
                          <select aria-label="Category" value={task.category} onChange={e => updateDraft(i, { category: e.target.value })} className={previewInputClass}>
                            {!categories.some(category => category.name === task.category) && <option>{task.category}</option>}
                            {categories.map(category => <option key={category.id}>{category.name}</option>)}
                          </select>
                        </label>
                        <label className="flex items-center gap-1">
                          Life area
                          <select aria-label="Life area" value={task.life_domain} onChange={e => updateDraft(i, { life_domain: e.target.value as ExtractedTask['life_domain'] })} className={previewInputClass}>
                            {LIFE_DOMAINS.map(domain => <option key={domain} value={domain}>{domain[0].toUpperCase() + domain.slice(1)}</option>)}
                          </select>
                        </label>
                        <label className="flex items-center gap-1">
                          Effort type
                          <select aria-label="Effort type" value={task.demand_type} onChange={e => updateDraft(i, { demand_type: e.target.value as DemandType })} className={previewInputClass}>
                            {DEMAND_TYPES.map(type => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}
                          </select>
                        </label>
                        <label className="flex items-center gap-1">
                          Difficulty
                          <select aria-label="Difficulty" value={task.difficulty} onChange={e => updateDraft(i, { difficulty: Number(e.target.value) })} className={previewInputClass}>
                            {[1, 2, 3, 4, 5].map(difficulty => <option key={difficulty} value={difficulty}>{difficultyLabel(difficulty)}</option>)}
                          </select>
                        </label>
                        <label className="flex items-center gap-1">
                          Minutes
                          <input
                            type="number"
                            min={0}
                            max={10080}
                            step={1}
                            value={task.estimated_minutes ?? ''}
                            onChange={e => updateDraft(i, { estimated_minutes: e.target.value ? Math.min(10080, Math.max(0, Math.round(Number(e.target.value)))) : null })}
                            className={`${previewInputClass} w-20`}
                          />
                        </label>
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
                                onClick={() => updateDraft(i, { priority: p })}
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
                            {(['none', 'daily', 'weekly', 'monthly', 'yearly'] as const).map(mode => (
                              <button
                                key={mode}
                                onClick={() => updateDraft(i, { recurring: mode, recurring_hours: null, recurring_days: null, times_per_day: 1 })}
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
                              onClick={() => updateDraft(i, { recurring: 'daily', recurring_hours: task.recurring_hours ?? 8, recurring_days: null, times_per_day: 1 })}
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
                                max="168"
                                value={task.recurring_hours}
                                aria-label="Hours between repeats"
                                onChange={e => updateDraft(i, { recurring_hours: Math.min(168, Math.max(1, Math.trunc(Number(e.target.value)) || 1)) })}
                                className="input-skeu w-10 text-[10px] rounded-lg px-2 py-1 text-slate-700 focus:outline-none"
                              />
                              <span className="text-[10px] text-slate-500 font-bold">h</span>
                            </div>
                          ) : task.recurring_days !== null ? (
                            <label className="flex items-center gap-1 text-xs font-bold text-slate-600">
                              Every
                              <input
                                type="number"
                                aria-label="Repeat interval"
                                min={1}
                                max={366}
                                value={task.recurring_days}
                                onChange={e => updateDraft(i, { recurring_days: Math.min(366, Math.max(1, Math.trunc(Number(e.target.value)) || 1)) })}
                                className={`${previewInputClass} w-14`}
                              />
                              {task.recurring === 'monthly' ? 'months' : task.recurring === 'yearly' ? 'years' : 'days'}
                            </label>
                          ) : task.recurring === 'daily' && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Times/day:</span>
                              <input
                                type="number"
                                min="1"
                                max="24"
                                value={task.times_per_day || 1}
                                aria-label="Times per day"
                                onChange={e => updateDraft(i, { times_per_day: Math.min(24, Math.max(1, Math.trunc(Number(e.target.value)) || 1)) })}
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
                          aria-label="Notes"
                          maxLength={2000}
                          onChange={e => updateDraft(i, { notes: e.target.value })}
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
                    <button disabled={saving || !preview.length || preview.some(task => !task.name.trim())} onClick={confirm} className="glow-button font-black px-6 py-2.5 text-sm flex items-center gap-2">
                      <Plus className="w-4 h-4" /> {saving ? 'Saving…' : `Save ${preview.length} Task${preview.length === 1 ? '' : 's'}`}
                    </button>
                    <button disabled={saving} onClick={() => { setPreview(null); setInput(''); setError(null) }} className="vista-btn-secondary font-bold text-sm" style={{ padding: '8px 16px' }}>
                      Discard
                    </button>
                  </>
                )}
              </div>
              <p className="text-[10px] text-slate-500 font-bold mt-3 italic">{offlineDraft ? 'Drafted with local rules.' : 'Drafted with Gemini. Check the details before saving.'}</p>
            </div>
          )}

        {unclearDraft ? (
          <TaskClarificationDialog key={unclearIndex} question={`What do you need to do for “${unclearDraft.name}”?`} onSkip={skipUnclear}>
            <form onSubmit={event => {
              event.preventDefault()
              const name = String(new FormData(event.currentTarget).get('description') ?? '').trim()
              if (!name || needsTaskDetails(name)) {
                const input = event.currentTarget.elements.namedItem('description') as HTMLInputElement
                input.setCustomValidity('Describe the action and what it applies to.')
                input.reportValidity()
                return
              }
              const effort = inferTitleEffort(name)
              updateDraft(unclearIndex, { name, ...(effort && { demand_type: effort.type, difficulty: effort.difficulty }) })
              skipUnclear()
            }}>
              <label className="block text-sm font-semibold" htmlFor="task-detail-description">What needs doing?</label>
              <input id="task-detail-description" name="description" required maxLength={512}
                onInput={event => event.currentTarget.setCustomValidity('')}
                className="input-skeu block w-full px-3 py-2 my-2 rounded-lg text-sm" />
              <button className="glow-button px-3 py-2 text-sm font-bold" type="submit">Update task</button>
            </form>
          </TaskClarificationDialog>
        ) : preview && clarification && (
          <TaskClarificationDialog question={clarification.question} onSkip={() => setClarification(null)}>
            <div className="flex flex-wrap gap-2">
              {clarification.options.map(opt => (
                <button key={opt.label} type="button" onClick={() => applyClarification(opt)}
                  className="vista-btn-secondary px-3 py-2 text-sm">{opt.label}</button>
              ))}
            </div>
          </TaskClarificationDialog>
        )}

        {currentPastDeadlineTask && (
          <PastDeadlineModal
            task={{
              name: currentPastDeadlineTask.name,
              deadline: currentPastDeadlineTask.deadline!,
              recurring: currentPastDeadlineTask.recurring,
              category: currentPastDeadlineTask.category,
            }}
            onPostpone={(newDeadline) => {
              advancePastDeadlineQueue({ ...currentPastDeadlineTask, deadline: newDeadline })
            }}
            onRemoveDeadline={() => {
              advancePastDeadlineQueue({ ...currentPastDeadlineTask, deadline: null })
            }}
            onCancel={() => {
              advancePastDeadlineQueue(currentPastDeadlineTask)
            }}
          />
        )}
      </div>
    </AppLayout>
  )
}
