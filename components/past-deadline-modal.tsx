"use client"

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Lightbulb, Calendar, Loader2, ArrowLeft, Trash2 } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface PastDeadlineModalProps {
  task: {
    name: string
    deadline: string       // ISO with Z suffix (the past deadline the user entered)
    recurring?: string     // "none" | "daily" | "weekly"
    category?: string
  }
  onPostpone: (newDeadline: string) => void  // called with ISO string + Z
  onRemoveDeadline: () => void
  onDelete?: () => void                       // optional — only edit flow provides this
  onCancel: () => void
}

type Phase = 'loading' | 'advice' | 'clarifying' | 'custom-time'

interface ApiResponse {
  observation: string | null
  clarification: string | null
  suggestedTime: string | null   // "YYYY-MM-DDTHH:mmZ"
  suggestedLabel: string | null  // "Tomorrow · 10:30am"
  stillNeeded: boolean | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toInputDt(dt: string): string {
  const d = new Date(dt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** Format a UTC ISO string as "D Mon · H:MMam/pm" using UTC components */
function formatWasDue(iso: string): string {
  const d = new Date(iso)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const day = d.getUTCDate()
  const mon = months[d.getUTCMonth()]
  const h24 = d.getUTCHours()
  const min = d.getUTCMinutes()
  const ampm = h24 < 12 ? 'am' : 'pm'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const minStr = String(min).padStart(2, '0')
  return `${day} ${mon} · ${h12}:${minStr}${ampm}`
}

/** Compute a fallback suggestedTime: tomorrow at same UTC time as the given ISO string */
function tomorrowSameTime(iso: string): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Build a human-friendly label like "Tomorrow · 10:30am" from an ISO string */
function buildSuggestedLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const todayUtc = now.toISOString().split('T')[0]
  const tomorrowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    .toISOString().split('T')[0]
  const dateUtc = d.toISOString().split('T')[0]
  let dayLabel: string
  if (dateUtc === todayUtc) dayLabel = 'Today'
  else if (dateUtc === tomorrowUtc) dayLabel = 'Tomorrow'
  else {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    dayLabel = `${d.getUTCDate()} ${months[d.getUTCMonth()]}`
  }
  const h24 = d.getUTCHours()
  const min = d.getUTCMinutes()
  const ampm = h24 < 12 ? 'am' : 'pm'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const minStr = String(min).padStart(2, '0')
  return `${dayLabel} · ${h12}:${minStr}${ampm}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PastDeadlineModal({
  task,
  onPostpone,
  onRemoveDeadline,
  onDelete,
  onCancel,
}: PastDeadlineModalProps) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [observation, setObservation] = useState<string | null>(null)
  const [clarificationQ, setClarificationQ] = useState<string | null>(null)
  const [clarificationA, setClarificationA] = useState('')
  const [suggestedTime, setSuggestedTime] = useState<string | null>(null)
  const [suggestedLabel, setSuggestedLabel] = useState<string | null>(null)
  // customTime is always stored as "YYYY-MM-DDTHH:mm" (no Z) for the datetime-local input value
  const [customTime, setCustomTime] = useState<string>('')

  // ── API call ────────────────────────────────────────────────────────────────

  async function callApi(userReply: string | null) {
    try {
      const res = await fetch('/api/ai/past-deadline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskName: task.name,
          deadlineWas: task.deadline,
          now: new Date().toISOString(),
          category: task.category,
          recurring: task.recurring,
          userReply,
        }),
      })
      if (!res.ok) throw new Error('API error')
      const data: ApiResponse = await res.json()

      if (data.clarification && userReply === null) {
        // AI wants to ask a question first
        setClarificationQ(data.clarification)
        setPhase('clarifying')
      } else {
        // Use AI suggestion or fall back
        const st = data.suggestedTime ?? tomorrowSameTime(task.deadline)
        const sl = data.suggestedLabel ?? buildSuggestedLabel(st)
        setObservation(data.observation)
        setSuggestedTime(st)
        setSuggestedLabel(sl)
        setCustomTime(toInputDt(st))
        setPhase('advice')
      }
    } catch {
      // Silent fallback
      const st = tomorrowSameTime(task.deadline)
      const sl = buildSuggestedLabel(st)
      setObservation(null)
      setSuggestedTime(st)
      setSuggestedLabel(sl)
      setCustomTime(toInputDt(st))
      setPhase('advice')
    }
  }

  useEffect(() => {
    callApi(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Clarification submit ─────────────────────────────────────────────────────

  function handleGetAdvice() {
    if (!clarificationA.trim()) return
    setPhase('loading')
    callApi(clarificationA.trim())
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const wasDueLabel = formatWasDue(task.deadline)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={onCancel}
      >
        <motion.div
          initial={{ scale: 0.92, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.92, y: 20 }}
          transition={{ duration: 0.18 }}
          className="glass-panel w-full max-w-md rounded-3xl p-6 shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* ── Loading ── */}
          {phase === 'loading' && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
              <p className="text-sm text-slate-500 font-bold">Analysing task…</p>
            </div>
          )}

          {/* ── Advice ── */}
          {phase === 'advice' && (
            <div className="space-y-5">
              {/* Header */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-700">
                  <Clock className="w-5 h-5 shrink-0" />
                  <h2 className="font-black text-base">This deadline has already passed</h2>
                </div>
                <p className="text-xs text-slate-400 font-bold pl-7">
                  Task: &quot;{task.name}&quot;
                </p>
                <p className="text-xs text-slate-400 font-bold pl-7">
                  Was due: {wasDueLabel}
                </p>
              </div>

              {/* AI observation */}
              {observation && (
                <p className="text-sm text-slate-600 leading-relaxed">{observation}</p>
              )}

              {/* Suggested time badge */}
              {suggestedLabel && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                  <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-sm font-black text-amber-700">
                    Suggested: {suggestedLabel}
                  </span>
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-2.5">
                {/* Primary: postpone to suggestion */}
                {suggestedTime && (
                  <button
                    onClick={() => onPostpone(suggestedTime)}
                    className="glow-button font-black py-2.5 text-sm w-full"
                  >
                    Postpone to {suggestedLabel}
                  </button>
                )}

                {/* Pick different time */}
                <button
                  onClick={() => {
                    if (suggestedTime) setCustomTime(toInputDt(suggestedTime))
                    setPhase('custom-time')
                  }}
                  className="w-full py-2.5 rounded-xl text-sm font-bold border border-slate-200 bg-white/50 text-slate-600 hover:bg-white/80 transition-all flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  Pick a different time
                </button>

                {/* Text-level actions */}
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1">
                  <button
                    onClick={onRemoveDeadline}
                    className="text-sm text-slate-400 hover:text-slate-600 font-bold transition-colors"
                  >
                    Remove deadline
                  </button>
                  {onDelete && (
                    <button
                      onClick={onDelete}
                      className="text-sm text-slate-400 hover:text-red-500 font-bold transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Don&apos;t need it
                    </button>
                  )}
                </div>

                {/* Cancel */}
                <div className="flex justify-center pt-1">
                  <button
                    onClick={onCancel}
                    className="text-sm text-slate-400 hover:text-slate-600 font-bold transition-colors flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back / Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Clarifying ── */}
          {phase === 'clarifying' && (
            <div className="space-y-5">
              {/* Header */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-700">
                  <Clock className="w-5 h-5 shrink-0" />
                  <h2 className="font-black text-base">This deadline has already passed</h2>
                </div>
                <p className="text-xs text-slate-400 font-bold pl-7">
                  Task: &quot;{task.name}&quot;
                </p>
                <p className="text-xs text-slate-400 font-bold pl-7">
                  Was due: {wasDueLabel}
                </p>
              </div>

              {/* AI question */}
              {clarificationQ && (
                <p className="text-sm text-slate-700 leading-relaxed">{clarificationQ}</p>
              )}

              {/* Answer input */}
              <textarea
                value={clarificationA}
                onChange={e => setClarificationA(e.target.value)}
                placeholder="Your answer…"
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-white/60 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGetAdvice()
                }}
              />

              <div className="space-y-2.5">
                <button
                  onClick={handleGetAdvice}
                  disabled={!clarificationA.trim()}
                  className="glow-button font-black py-2.5 text-sm w-full disabled:opacity-50"
                >
                  Get advice →
                </button>
                <div className="flex justify-center">
                  <button
                    onClick={onCancel}
                    className="text-sm text-slate-400 hover:text-slate-600 font-bold transition-colors flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Custom time ── */}
          {phase === 'custom-time' && (
            <div className="space-y-5">
              {/* Header */}
              <div className="flex items-center gap-2 text-slate-700">
                <Calendar className="w-5 h-5 shrink-0" />
                <h2 className="font-black text-base">Pick a new deadline</h2>
              </div>

              {/* datetime-local input */}
              <input
                type="datetime-local"
                value={customTime}
                onChange={e => setCustomTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white/60 px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
              />

              <div className="space-y-2.5">
                <button
                  onClick={() => {
                    if (customTime) onPostpone(customTime + 'Z')
                  }}
                  disabled={!customTime}
                  className="glow-button font-black py-2.5 text-sm w-full disabled:opacity-50"
                >
                  Set this time
                </button>
                <div className="flex justify-center">
                  <button
                    onClick={() => setPhase('advice')}
                    className="text-sm text-slate-400 hover:text-slate-600 font-bold transition-colors flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
