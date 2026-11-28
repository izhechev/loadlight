/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState, useEffect, useRef } from "react"
import { Moon, EyeOff, HelpCircle, CheckCircle, Loader2, X, Eye } from "@/lib/icons"
import { activeWorkload, dayKey, taskMinutes, type WorkloadTask } from "@/lib/utils/workload"
import { canDeferTask } from "@/lib/utils/toughDays"

interface PostponeTask {
  id: string
  name: string
  reason: string
}

interface ChillSuggestionsProps {
  tasks: (WorkloadTask & { id: string; priority?: number })[]
  onSnooze: (ids: string[]) => Promise<string[]>
}

export function ChillSuggestions({ tasks, onSnooze }: ChillSuggestionsProps) {
  const [suggestions, setSuggestions]         = useState<PostponeTask[]>([])
  const [question, setQuestion]               = useState<string | null>(null)
  const [questionTaskId, setQuestionTaskId]   = useState<string | null>(null)
  const [loading, setLoading]                 = useState(true)
  const [dismissed, setDismissed]             = useState(false)
  const [snoozed, setSnoozed]                 = useState<Set<string>>(new Set())
  const [questionAnswered, setQuestionAnswered] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const fetched = useRef(false)

  const now = Date.now()
  const until = dayKey(new Date(now + 24 * 60 * 60_000))
  const eligible = activeWorkload(tasks, now).filter(task => canDeferTask(task, until))

  useEffect(() => {
    if (fetched.current) return
    if (eligible.length === 0) { setLoading(false); return }
    fetched.current = true

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'chill-snooze', tasks: eligible.map(task => ({ id: task.id, name: task.name, category: task.category, priority: task.priority, deadline: task.deadline, estimated_minutes: taskMinutes(task) })) }),
    })
      .then(r => r.json())
      .then((data: { canPostpone?: PostponeTask[]; question?: string | null; questionTaskId?: string | null }) => {
        setSuggestions((data.canPostpone ?? []).flatMap(item => {
          const task = eligible.find(task => task.id === item.id)
          return task ? [{ ...item, name: task.name }] : []
        }))
        if (eligible.some(task => task.id === data.questionTaskId)) {
          setQuestion(data.question ?? null)
          setQuestionTaskId(data.questionTaskId ?? null)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function snooze(ids: string[]) {
    setSaving(true)
    setError(false)
    try {
      const saved = await onSnooze(ids)
      setSnoozed(previous => new Set([...previous, ...saved]))
      setError(saved.length !== ids.length)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  function answerQuestion(keepTask: boolean) {
    setQuestionAnswered(true)
    if (!keepTask && questionTaskId) void snooze([questionTaskId])
  }

  const remaining = suggestions.filter(s => !snoozed.has(s.id) && eligible.some(task => task.id === s.id))
  const allSnoozed = remaining.length === 0 && suggestions.length > 0

  if (dismissed) return null
  if (!loading && suggestions.length === 0 && !question) return null

  return (
    <div className="skeu-card p-5 relative overflow-hidden aero-purple anim-fade-in-up">
      {/* Vista-style header strip */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Moon className="w-5 h-5 drop-shadow-sm" style={{ color: '#5a2a9a' }} />
          <h2 className="font-black" style={{ color: '#3a1a6a' }}>Chill Mode</h2>
          <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.30)', color: '#5a2a9a' }}>
            tasks that can wait
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
          style={{ color: '#7a8aaa' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(180,215,255,0.10)')}
          onMouseLeave={e => (e.currentTarget.style.background = '')}
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-2">
          <Loader2 className="w-5 h-5 animate-spin shrink-0" style={{ color: '#5a2a9a' }} />
          <span className="text-sm font-bold" style={{ color: '#4a3a6a' }}>Checking which tasks can wait…</span>
        </div>
      ) : allSnoozed ? (
        <div className="flex items-center gap-3 py-2 rounded-2xl px-4 anim-fade-in aero-success">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="text-sm font-black">All suggested tasks hidden for 24h</p>
            <p className="text-xs font-bold opacity-80">They'll reappear automatically tomorrow. Enjoy your rest!</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {remaining.length > 0 && (
            <>
              <p className="text-xs font-bold" style={{ color: '#4a3a6a' }}>These have no urgent deadline. Hide them for 24h to keep your view calm:</p>

              <div className="space-y-2">
                {remaining.map(s => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-2xl px-4 py-2.5 anim-fade-in-left aero-purple"
                  >
                    <EyeOff className="w-4 h-4 shrink-0 opacity-70" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black truncate">{s.name}</p>
                      <p className="text-[11px] font-bold opacity-70">{s.reason}</p>
                    </div>
                    <button
                      onClick={() => void snooze([s.id])}
                      disabled={saving}
                      className="vista-btn-secondary text-xs font-black px-3 py-1.5 shrink-0"
                    >
                      Hide 24h
                    </button>
                  </div>
                ))}
              </div>

              {remaining.length > 1 && (
                <button
                  onClick={() => void snooze(remaining.map(item => item.id))}
                  disabled={saving}
                  className="w-full text-sm font-black rounded-2xl px-4 py-2.5 transition-all flex items-center justify-center gap-2 vista-btn-secondary"
                >
                  <Eye className="w-4 h-4 opacity-60" />
                  Hide all {remaining.length} tasks for 24h
                </button>
              )}
            </>
          )}

          {/* Clarifying question */}
          {question && !questionAnswered && (
            <div className="aero-info rounded-2xl px-4 py-3 space-y-3 anim-fade-in-up">
              <div className="flex items-start gap-2">
                <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-sm font-black">{question}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => answerQuestion(true)}
                  className="flex-1 text-xs font-black vista-chip-active px-3 py-2 rounded-full transition-all"
                >
                  Yes, needed today
                </button>
                <button
                  onClick={() => answerQuestion(false)}
                  disabled={saving}
                  className="flex-1 text-xs font-black vista-btn-secondary px-3 py-2"
                >
                  Can wait — hide it
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm font-bold">Some tasks could not be hidden.</p>}
      <p className="text-[10px] font-bold mt-3 italic" style={{ color: '#7a8aaa' }}>
        Hidden tasks reappear after 24 hours.
      </p>
    </div>
  )
}
