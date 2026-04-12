"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Coffee, BookOpen, Music, Footprints, Phone, MessageSquare, LogOut, Loader2, CheckCircle, AlertCircle, HelpCircle } from "lucide-react"

interface RestModeOverlayProps {
  onDismiss: () => void
  onExitRestMode: () => void
}

interface TriageItem { name: string; reason: string }
interface TriageResult {
  canSkip: TriageItem[]
  urgent: TriageItem[]
  question: string | null
}

const RECOVERY_CARDS = [
  {
    icon: Coffee,
    title: "5-min break",
    desc: "Step away from the screen. Breathe slowly.",
    color: "from-amber-100 to-orange-50 border-amber-200",
    iconColor: "text-amber-600",
  },
  {
    icon: BookOpen,
    title: "Read something light",
    desc: "A short article, a few pages — nothing heavy.",
    color: "from-sky-100 to-blue-50 border-sky-200",
    iconColor: "text-sky-600",
  },
  {
    icon: Music,
    title: "Put on music",
    desc: "Calm or upbeat — whatever lifts your mood.",
    color: "from-violet-100 to-purple-50 border-violet-200",
    iconColor: "text-violet-600",
  },
  {
    icon: Footprints,
    title: "Short walk",
    desc: "Even 5 minutes outside helps reset your brain.",
    color: "from-green-100 to-emerald-50 border-green-200",
    iconColor: "text-green-600",
  },
]

function getStoredTasks() {
  try { return JSON.parse(localStorage.getItem('loadlight-tasks') ?? '[]') } catch { return [] }
}

export function RestModeOverlay({ onDismiss, onExitRestMode }: RestModeOverlayProps) {
  const [confirmExit, setConfirmExit] = useState(false)
  const [triage, setTriage] = useState<TriageResult | null>(null)
  const [triageLoading, setTriageLoading] = useState(true)
  const [questionAnswer, setQuestionAnswer] = useState<string | null>(null)

  useEffect(() => {
    async function runTriage() {
      const tasks = getStoredTasks()
      if (!tasks.length) { setTriageLoading(false); return }
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'triage', tasks }),
        })
        if (res.ok) setTriage(await res.json() as TriageResult)
      } catch { /* silent — triage is advisory only */ }
      finally { setTriageLoading(false) }
    }
    runTriage()
  }, [])

  const hasResults = triage && (triage.canSkip.length > 0 || triage.urgent.length > 0)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        className="glass-panel-strong w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-pink-200/60 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-black gradient-text">Rest Mode Active</h2>
            <p className="text-sm text-slate-500 mt-0.5">Take a moment. Your tasks will be here when you're ready.</p>
          </div>
          <button
            onClick={onDismiss}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* AI Triage */}
        <div className="mb-4">
          {triageLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-3">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Checking your task list...</span>
            </div>
          ) : hasResults ? (
            <div className="space-y-3">
              {triage!.canSkip.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5">
                  <p className="text-xs font-black text-emerald-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> These can wait today
                  </p>
                  <ul className="space-y-1.5">
                    {triage!.canSkip.map((item, i) => (
                      <li key={i} className="flex items-start justify-between gap-3">
                        <span className="text-sm font-semibold text-emerald-800 leading-snug">{item.name}</span>
                        <span className="text-xs text-emerald-600 whitespace-nowrap shrink-0">{item.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {triage!.urgent.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5">
                  <p className="text-xs font-black text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> Worth keeping on the radar
                  </p>
                  <ul className="space-y-1.5">
                    {triage!.urgent.map((item, i) => (
                      <li key={i} className="flex items-start justify-between gap-3">
                        <span className="text-sm font-semibold text-amber-800 leading-snug">{item.name}</span>
                        <span className="text-xs text-amber-600 whitespace-nowrap shrink-0">{item.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {triage!.question && questionAnswer === null && (
                <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3.5">
                  <p className="text-xs font-black text-sky-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5" /> Quick question
                  </p>
                  <p className="text-sm text-sky-800 font-medium mb-3 leading-snug">{triage!.question}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setQuestionAnswer('yes')}
                      className="flex-1 bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold py-1.5 rounded-xl text-sm transition-colors border border-sky-200"
                    >
                      Yes, today
                    </button>
                    <button
                      onClick={() => setQuestionAnswer('no')}
                      className="flex-1 bg-white hover:bg-sky-50 text-sky-700 font-bold py-1.5 rounded-xl text-sm transition-colors border border-sky-200"
                    >
                      Can wait
                    </button>
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-400 text-right">AI workload analysis · all suggestions optional</p>
            </div>
          ) : null}
        </div>

        {/* Recovery cards 2×2 */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {RECOVERY_CARDS.map(({ icon: Icon, title, desc, color, iconColor }) => (
            <div
              key={title}
              className={`bg-gradient-to-br ${color} border rounded-2xl p-3.5`}
            >
              <Icon className={`w-5 h-5 ${iconColor} mb-2`} />
              <p className="font-bold text-sm text-slate-700">{title}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">{desc}</p>
            </div>
          ))}
        </div>

        {/* Crisis lines */}
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-5">
          <p className="text-xs font-bold text-rose-700 mb-2 uppercase tracking-wide">Need to talk to someone?</p>
          <div className="flex flex-col gap-2">
            <a
              href="tel:988"
              className="flex items-center gap-2 text-sm font-semibold text-rose-700 hover:text-rose-900 transition-colors"
            >
              <Phone className="w-4 h-4 shrink-0" />
              988 — Suicide &amp; Crisis Lifeline (call or text)
            </a>
            <a
              href="sms:741741?body=HOME"
              className="flex items-center gap-2 text-sm font-semibold text-rose-700 hover:text-rose-900 transition-colors"
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              741741 — Crisis Text Line (text HOME)
            </a>
          </div>
        </div>

        {/* Actions */}
        <AnimatePresence mode="wait">
          {confirmExit ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-2"
            >
              <p className="text-sm text-slate-600 text-center font-medium mb-1">
                Exit rest mode?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { onExitRestMode(); onDismiss() }}
                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-bold py-2 rounded-xl text-sm transition-colors"
                >
                  Yes, exit
                </button>
                <button
                  onClick={() => setConfirmExit(false)}
                  className="flex-1 glass-panel text-slate-600 font-bold py-2 rounded-xl text-sm hover:bg-white/60 transition-colors border border-slate-200"
                >
                  Stay in rest mode
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex gap-2"
            >
              <button
                onClick={() => setConfirmExit(true)}
                className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2 rounded-xl text-sm transition-colors border border-slate-200"
              >
                <LogOut className="w-4 h-4" />
                Exit Rest Mode
              </button>
              <button
                onClick={onDismiss}
                className="flex-1 bg-gradient-to-r from-pink-400 to-rose-400 hover:brightness-110 text-white font-bold py-2 rounded-xl text-sm transition-all shadow-md"
              >
                Stay in Rest Mode
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
