"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, ArrowLeft } from "lucide-react"

type BalanceMode = 'beast' | 'balanced' | 'chill'
type WorkType = 'student' | 'professional' | 'freelancer' | 'other'

const WORK_TYPES: { id: WorkType; emoji: string; label: string; desc: string }[] = [
  { id: 'student',      emoji: '📚', label: 'Student',      desc: 'Managing studies, assignments, exams' },
  { id: 'professional', emoji: '💼', label: 'Professional', desc: 'Work projects, meetings, deadlines' },
  { id: 'freelancer',   emoji: '🎯', label: 'Freelancer',   desc: 'Client work, self-managed schedule' },
  { id: 'other',        emoji: '✨', label: 'Other',        desc: 'My own mix of everything' },
]

const BALANCE_MODES: { id: BalanceMode; emoji: string; label: string; ratio: string; desc: string; note?: string }[] = [
  { id: 'beast',    emoji: '⚡', label: 'Beast Worker',    ratio: '70% work / 30% leisure', desc: 'Maximize productivity' },
  { id: 'balanced', emoji: '⚖️', label: 'Average Worker',  ratio: '50% work / 50% leisure', desc: 'Healthy balance' },
  { id: 'chill',    emoji: '🌿', label: 'Chill Guy',       ratio: '30% work / 70% leisure', desc: 'Rest & leisure first', note: 'Includes 30-day lock to prevent impulsive switching' },
]

const SLIDE = {
  enter: (dir: number) => ({ x: dir * 40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -40, opacity: 0 }),
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [name, setName] = useState('')
  const [workType, setWorkType] = useState<WorkType | null>(null)
  const [balanceMode, setBalanceMode] = useState<BalanceMode | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('loadlight-user')
      if (stored) {
        const parsed = JSON.parse(stored) as { onboardingComplete?: boolean }
        if (parsed.onboardingComplete) router.replace('/dashboard')
      }
    } catch { /* ignore */ }
  }, [router])

  function go(nextStep: number) {
    setDir(nextStep > step ? 1 : -1)
    setStep(nextStep)
  }

  function finish() {
    localStorage.setItem('loadlight-user', JSON.stringify({
      name,
      workType,
      balanceMode,
      onboardingComplete: true,
    }))
    router.push('/dashboard')
  }

  return (
    <div className="aero-bg min-h-screen flex items-center justify-center p-4">
      <div className="glass-panel p-8 max-w-lg w-full">
        {/* Logo + progress */}
        <div className="flex flex-col items-center mb-8">
          <Image src="/logo.png" alt="LoadLight" width={64} height={64} className="logo-glow-sm mb-4" />
          <div className="flex gap-2">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === step ? 'w-8 bg-sky-500' : i < step ? 'w-2 bg-sky-300' : 'w-2 bg-white/40'
                }`}
              />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait" custom={dir}>
          {step === 0 && (
            <motion.div
              key="step0"
              custom={dir}
              variants={SLIDE}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22 }}
              className="space-y-6"
            >
              <div>
                <h1 className="text-2xl font-black text-slate-800 mb-1">What should we call you?</h1>
                <p className="text-slate-500 text-sm">This helps LoadLight personalise your experience.</p>
              </div>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && name.trim()) go(1) }}
                placeholder="Your name"
                className="w-full bg-white/60 rounded-2xl px-5 py-4 text-slate-800 font-semibold placeholder:text-slate-400 border border-white/60 focus:outline-none focus:ring-2 focus:ring-sky-300 text-lg"
              />
              <button
                onClick={() => go(1)}
                disabled={!name.trim()}
                className="glow-button w-full text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step1"
              custom={dir}
              variants={SLIDE}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22 }}
              className="space-y-5"
            >
              <div>
                <h1 className="text-2xl font-black text-slate-800 mb-1">What best describes you?</h1>
                <p className="text-slate-500 text-sm">So LoadLight can tailor its workload advice.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {WORK_TYPES.map(wt => (
                  <button
                    key={wt.id}
                    onClick={() => setWorkType(wt.id)}
                    className={`rounded-2xl p-4 text-left transition-all duration-200 border-2 ${
                      workType === wt.id
                        ? 'border-sky-400 bg-sky-50/60'
                        : 'border-white/40 bg-white/40 hover:bg-white/60'
                    }`}
                  >
                    <span className="text-2xl block mb-2">{wt.emoji}</span>
                    <p className="font-bold text-slate-800 text-sm">{wt.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-tight">{wt.desc}</p>
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => go(0)}
                  className="flex items-center gap-2 bg-white/40 border border-white/40 text-slate-600 font-medium px-4 py-3 rounded-2xl hover:bg-white/60 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => go(2)}
                  disabled={!workType}
                  className="glow-button flex-1 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              custom={dir}
              variants={SLIDE}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22 }}
              className="space-y-5"
            >
              <div>
                <h1 className="text-2xl font-black text-slate-800 mb-1">How do you want to balance your time?</h1>
                <p className="text-slate-500 text-sm">This sets your work/leisure ratio target.</p>
              </div>
              <div className="space-y-3">
                {BALANCE_MODES.map(bm => (
                  <button
                    key={bm.id}
                    onClick={() => setBalanceMode(bm.id)}
                    className={`w-full rounded-2xl p-4 text-left transition-all duration-200 border-2 ${
                      balanceMode === bm.id
                        ? 'border-sky-400 bg-sky-50/60'
                        : 'border-white/40 bg-white/40 hover:bg-white/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{bm.emoji}</span>
                      <div className="flex-1">
                        <p className="font-bold text-slate-800">{bm.label}</p>
                        <p className="text-xs text-slate-500">{bm.ratio} · {bm.desc}</p>
                        {bm.note && <p className="text-xs text-amber-600 mt-0.5">⚠ {bm.note}</p>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <p className="text-xs text-slate-400 bg-white/40 rounded-xl p-3 leading-relaxed">
                🤖 LoadLight uses AI for task extraction and workload analysis only — not for mental health support.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => go(1)}
                  className="flex items-center gap-2 bg-white/40 border border-white/40 text-slate-600 font-medium px-4 py-3 rounded-2xl hover:bg-white/60 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={finish}
                  disabled={!balanceMode}
                  className="glow-button flex-1 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Let&apos;s go! <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
