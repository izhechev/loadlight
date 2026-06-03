"use client"

import { useState, useEffect } from 'react'
import { Lightbulb, Calendar, Loader2, ArrowLeft, Trash2 } from '@/lib/icons'

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
      <div
        className="anim-overlay-in"
        style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: 16 }}
        onClick={onCancel}
      >
        <div
          className="vista-dialog anim-scale-in"
          style={{ width: '100%', maxWidth: 460, padding: 24 }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Loading ── */}
          {phase === 'loading' && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 style={{ width: 28, height: 28, color: '#5a7a9a' }} className="animate-spin" />
              <p style={{ fontSize: 13, color: '#5a7a9a', fontWeight: 700 }}>Analysing task...</p>
            </div>
          )}

          {/* ── Advice ── */}
          {phase === 'advice' && (
            <div className="space-y-5">
              {/* Header */}
              <div className="space-y-1">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1a2a4a' }}>
                  <Calendar style={{ width: 18, height: 18, flexShrink: 0 }} />
                  <h2 style={{ fontWeight: 900, fontSize: 15, color: '#1a2a4a' }}>This deadline has already passed</h2>
                </div>
                <p style={{ fontSize: 11, color: '#5a7a9a', fontWeight: 700, paddingLeft: 26 }}>
                  Task: &quot;{task.name}&quot;
                </p>
                <p style={{ fontSize: 11, color: '#5a7a9a', fontWeight: 700, paddingLeft: 26 }}>
                  Was due: {wasDueLabel}
                </p>
              </div>

              {observation && (
                <p style={{ fontSize: 13, color: '#2a3a5a', lineHeight: 1.6 }}>{observation}</p>
              )}

              {/* Suggested time badge */}
              {suggestedLabel && (
                <div className="flex items-center gap-2 aero-warning rounded-xl px-4 py-2.5">
                  <Lightbulb className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-black">
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
                  className="w-full py-2.5 text-sm font-bold transition-all flex items-center justify-center gap-2 vista-btn-secondary"
                >
                  <Calendar className="w-4 h-4" />
                  Pick a different time
                </button>

                {/* Text-level actions */}
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1">
                  <button
                    onClick={onRemoveDeadline}
                    style={{ fontSize: 13, color: '#5a7a9a', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Remove deadline
                  </button>
                  {onDelete && (
                    <button
                      onClick={onDelete}
                      style={{ fontSize: 13, color: '#c83030', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'underline' }}
                    >
                      <Trash2 style={{ width: 13, height: 13 }} />
                      Don&apos;t need it
                    </button>
                  )}
                </div>

                {/* Cancel */}
                <div className="flex justify-center pt-1">
                  <button
                    onClick={onCancel}
                    style={{ fontSize: 13, color: '#5a7a9a', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'underline' }}
                  >
                    <ArrowLeft style={{ width: 13, height: 13 }} />
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1a2a4a' }}>
                  <Calendar style={{ width: 18, height: 18, flexShrink: 0 }} />
                  <h2 style={{ fontWeight: 900, fontSize: 15, color: '#1a2a4a' }}>This deadline has already passed</h2>
                </div>
                <p style={{ fontSize: 11, color: '#5a7a9a', fontWeight: 700, paddingLeft: 26 }}>
                  Task: &quot;{task.name}&quot;
                </p>
                <p style={{ fontSize: 11, color: '#5a7a9a', fontWeight: 700, paddingLeft: 26 }}>
                  Was due: {wasDueLabel}
                </p>
              </div>

              {clarificationQ && (
                <p style={{ fontSize: 13, color: '#2a3a5a', lineHeight: 1.6 }}>{clarificationQ}</p>
              )}

              {/* Answer input */}
              <textarea
                value={clarificationA}
                onChange={e => setClarificationA(e.target.value)}
                placeholder="Your answer…"
                rows={3}
                className="input-skeu w-full rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none"
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
                    style={{ fontSize: 13, color: '#5a7a9a', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'underline' }}
                  >
                    <ArrowLeft style={{ width: 13, height: 13 }} />
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calendar style={{ width: 18, height: 18, flexShrink: 0, color: '#1a2a4a' }} />
                <h2 style={{ fontWeight: 900, fontSize: 15, color: '#1a2a4a' }}>Pick a new deadline</h2>
              </div>

              {/* datetime-local input */}
              <input
                type="datetime-local"
                value={customTime}
                onChange={e => setCustomTime(e.target.value)}
                className="input-skeu w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
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
                    style={{ fontSize: 13, color: '#5a7a9a', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'underline' }}
                  >
                    <ArrowLeft style={{ width: 13, height: 13 }} />
                    Back
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
  )
}
