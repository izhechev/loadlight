"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Moon, EyeOff, HelpCircle, CheckCircle, Loader2, X, Eye } from "lucide-react"

interface PostponeTask {
  id: string
  name: string
  reason: string
}

interface ChillSuggestionsProps {
  tasks: { id: string; name: string; category?: string; priority?: number; deadline?: string | null; estimated_minutes?: number | null; done?: boolean; snoozedUntil?: number }[]
  onSnooze: (ids: string[]) => void
}

export function ChillSuggestions({ tasks, onSnooze }: ChillSuggestionsProps) {
  const [suggestions, setSuggestions]         = useState<PostponeTask[]>([])
  const [question, setQuestion]               = useState<string | null>(null)
  const [questionTaskId, setQuestionTaskId]   = useState<string | null>(null)
  const [loading, setLoading]                 = useState(true)
  const [dismissed, setDismissed]             = useState(false)
  const [snoozed, setSnoozed]                 = useState<Set<string>>(new Set())
  const [questionAnswered, setQuestionAnswered] = useState(false)
  const fetched = useRef(false)

  const now = Date.now()
  const activeTasks = tasks.filter(t => !t.done && !(t.snoozedUntil && t.snoozedUntil > now))

  useEffect(() => {
    if (fetched.current) return
    if (activeTasks.length === 0) { setLoading(false); return }
    fetched.current = true

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'chill-snooze', tasks: activeTasks }),
    })
      .then(r => r.json())
      .then((data: { canPostpone?: PostponeTask[]; question?: string | null; questionTaskId?: string | null }) => {
        setSuggestions(data.canPostpone ?? [])
        setQuestion(data.question ?? null)
        setQuestionTaskId(data.questionTaskId ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function snoozeOne(id: string) {
    setSnoozed(prev => new Set([...prev, id]))
    onSnooze([id])
  }

  function snoozeAll() {
    const ids = remaining.map(s => s.id)
    setSnoozed(prev => new Set([...prev, ...ids]))
    onSnooze(ids)
  }

  function answerQuestion(keepTask: boolean) {
    setQuestionAnswered(true)
    if (!keepTask && questionTaskId) snoozeOne(questionTaskId)
  }

  const remaining = suggestions.filter(s => !snoozed.has(s.id))
  const allSnoozed = remaining.length === 0 && suggestions.length > 0

  if (dismissed) return null
  if (!loading && suggestions.length === 0 && !question) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="skeu-card p-5 relative overflow-hidden border-2 border-violet-200/50"
    >
      {/* Vista-style header strip */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Moon className="w-5 h-5 text-violet-500 drop-shadow-sm" />
          <h2 className="font-black text-slate-700">Chill Mode</h2>
          <span className="text-xs font-black text-violet-600 bg-violet-100/80 border border-violet-200/60 px-2 py-0.5 rounded-full">
            tasks that can wait
          </span>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-all"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-2">
          <Loader2 className="w-5 h-5 animate-spin text-violet-400 shrink-0" />
          <span className="text-sm text-slate-500 font-bold">Checking which tasks can wait…</span>
        </div>
      ) : allSnoozed ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-3 py-2 bg-emerald-50/70 rounded-2xl px-4 border border-emerald-200/60"
        >
          <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-black text-emerald-700">All suggested tasks hidden for 24h</p>
            <p className="text-xs text-emerald-600 font-bold">They'll reappear automatically tomorrow. Enjoy your rest!</p>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {remaining.length > 0 && (
            <>
              <p className="text-xs text-slate-500 font-bold">These have no urgent deadline. Hide them for 24h to keep your view calm:</p>

              <div className="space-y-2">
                <AnimatePresence>
                  {remaining.map(s => (
                    <motion.div
                      key={s.id}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8, height: 0, marginTop: 0 }}
                      className="flex items-center gap-3 bg-gradient-to-r from-violet-50/70 to-purple-50/50 border border-violet-100/80 rounded-2xl px-4 py-2.5"
                    >
                      <EyeOff className="w-4 h-4 text-violet-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-700 truncate">{s.name}</p>
                        <p className="text-[11px] text-violet-600 font-bold">{s.reason}</p>
                      </div>
                      <button
                        onClick={() => snoozeOne(s.id)}
                        className="text-xs font-black text-violet-700 bg-violet-100/80 hover:bg-violet-200/80 px-3 py-1.5 rounded-full border border-violet-200/60 transition-all shrink-0 shadow-sm hover:shadow-md"
                      >
                        Hide 24h
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {remaining.length > 1 && (
                <button
                  onClick={snoozeAll}
                  className="w-full text-sm font-black text-violet-800 bg-gradient-to-r from-violet-50/90 to-purple-50/80 hover:from-violet-100/90 hover:to-purple-100/80 border-2 border-violet-200/60 rounded-2xl px-4 py-2.5 transition-all hover:shadow-md flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4 opacity-60" />
                  Hide all {remaining.length} tasks for 24h
                </button>
              )}
            </>
          )}

          {/* Clarifying question */}
          <AnimatePresence>
            {question && !questionAnswered && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="bg-sky-50/80 border-2 border-sky-200/60 rounded-2xl px-4 py-3 space-y-3"
              >
                <div className="flex items-start gap-2">
                  <HelpCircle className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                  <p className="text-sm font-black text-slate-700">{question}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => answerQuestion(true)}
                    className="flex-1 text-xs font-black bg-sky-100/80 hover:bg-sky-200/80 text-sky-800 border border-sky-200/60 px-3 py-2 rounded-full transition-all hover:shadow-sm"
                  >
                    Yes, needed today
                  </button>
                  <button
                    onClick={() => answerQuestion(false)}
                    className="flex-1 text-xs font-black bg-violet-100/80 hover:bg-violet-200/80 text-violet-800 border border-violet-200/60 px-3 py-2 rounded-full transition-all hover:shadow-sm"
                  >
                    Can wait — hide it
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <p className="text-[10px] text-slate-400 font-bold mt-3 italic">
        AI suggestions · snoozed tasks reappear after 24h · you stay in control
      </p>
    </motion.div>
  )
}
