"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import { Lock, ChevronRight, Brain, RefreshCw, BarChart3, Info } from "lucide-react"
import { AppLayout } from "@/components/app-layout"
import { useOverwhelmedStore } from "@/lib/store/overwhelmedStore"

type BalanceMode = 'beast' | 'balanced' | 'chill'

const MODES: { id: BalanceMode; emoji: string; label: string; ratio: string; targetWork: number; desc: string }[] = [
  { id: 'beast',    emoji: '⚡', label: 'Beast Worker',   ratio: '70/30', targetWork: 70, desc: 'Maximize productivity. High output focus.' },
  { id: 'balanced', emoji: '⚖️', label: 'Average Worker', ratio: '50/50', targetWork: 50, desc: 'Healthy balance. Sustainable long-term.' },
  { id: 'chill',    emoji: '🌿', label: 'Chill Guy',      ratio: '30/70', targetWork: 30, desc: 'Rest and leisure first. Recovery-focused.' },
]

export default function SettingsPage() {
  const { state, signals, reset } = useOverwhelmedStore()
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('balanced')
  const [chillLockUntil, setChillLockUntil] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)
  const [now, setNow] = useState<number>(0)
  const [showAnalysis, setShowAnalysis] = useState(false)

  useEffect(() => {
    const time = Date.now()
    requestAnimationFrame(() => {
      setNow(time)
      try {
        const stored = localStorage.getItem('loadlight-user')
        if (stored) {
          const p = JSON.parse(stored) as { balanceMode?: BalanceMode }
          if (p.balanceMode) setBalanceMode(p.balanceMode)
        }
        const lock = localStorage.getItem('loadlight-chill-lock')
        if (lock) setChillLockUntil(parseInt(lock, 10))
      } catch { /* ignore */ }
    })
  }, [])

  const isLocked = useCallback((mode: BalanceMode, currentTime: number): boolean => {
    return mode !== 'chill' && balanceMode === 'chill' && !!chillLockUntil && currentTime > 0 && currentTime < chillLockUntil
  }, [balanceMode, chillLockUntil])

  const selectMode = useCallback((mode: BalanceMode) => {
    const currentTime = now || Date.now()
    if (isLocked(mode, currentTime)) return
    
    let updatedLockUntil = chillLockUntil
    if (mode === 'chill' && balanceMode !== 'chill') {
      updatedLockUntil = currentTime + 30 * 24 * 60 * 60 * 1000
      setChillLockUntil(updatedLockUntil)
      localStorage.setItem('loadlight-chill-lock', String(updatedLockUntil))
    }
    
    setBalanceMode(mode)
    try {
      const stored = localStorage.getItem('loadlight-user')
      const p = stored ? JSON.parse(stored) as Record<string, unknown> : {}
      localStorage.setItem('loadlight-user', JSON.stringify({ ...p, balanceMode: mode }))
    } catch { /* ignore */ }
    
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [balanceMode, chillLockUntil, isLocked, now])

  const lockDaysLeft = (chillLockUntil && now > 0) ? Math.ceil((chillLockUntil - now) / 86400000) : 0

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-6">
        <div className="page-header">
          <h1 className="text-2xl font-black text-slate-800">Settings</h1>
          <p className="text-sm text-slate-500 font-bold">Configure your balance goals and monitor workload status</p>
        </div>

        {/* Balance mode selector */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="skeu-card p-6">
          <h2 className="font-black text-slate-700 mb-1">Balance Mode</h2>
          <p className="text-xs text-slate-500 mb-5 font-bold">Sets your target work/leisure ratio. AI advice adapts per mode.</p>

          {balanceMode === 'chill' && chillLockUntil && now > 0 && now < chillLockUntil && (
            <div className="mb-4 bg-amber-50/90 border border-amber-300/60 rounded-2xl px-4 py-3 flex items-center gap-3">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-700">Chill Guy lock active</p>
                <p className="text-xs text-amber-600/80 font-bold">{lockDaysLeft} days remaining · Prevents impulsive switching</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {MODES.map(mode => {
              const locked = isLocked(mode.id, now)
              const active = balanceMode === mode.id
              return (
                <button
                  key={mode.id}
                  onClick={() => selectMode(mode.id)}
                  disabled={locked}
                  className={`w-full flex items-center gap-4 rounded-2xl p-4 text-left transition-all border-2 ${
                    active    ? 'border-sky-400 bg-sky-50/80 shadow-inner' :
                    locked    ? 'border-sky-100/40 bg-sky-50/30 opacity-40 cursor-not-allowed' :
                                'border-sky-100/60 bg-white/40 hover:bg-white/70'
                  }`}
                >
                  <span className="text-3xl">{mode.emoji}</span>
                  <div className="flex-1">
                    <p className={`font-black ${active ? 'text-sky-800' : 'text-slate-700'}`}>{mode.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5 font-bold">{mode.ratio} work/leisure · {mode.desc}</p>
                    {locked && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1 font-bold">
                        <Lock className="w-3 h-3" /> Locked until {new Date(chillLockUntil!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  {active && <ChevronRight className="w-4 h-4 text-sky-600 shrink-0" />}
                </button>
              )
            })}
          </div>
          {saved && <p className="text-xs text-emerald-600 mt-3 font-bold">✓ Settings saved</p>}
        </motion.div>

        {/* Status Toggle */}
        <div className="flex justify-center pb-2">
          <button 
            onClick={() => setShowAnalysis(!showAnalysis)}
            className="text-xs text-slate-500 font-bold hover:text-slate-700 transition-colors bg-white/40 px-4 py-2 rounded-full border border-white/60 shadow-sm"
          >
            {showAnalysis ? 'Hide workload analysis' : 'Show workload analysis'}
          </button>
        </div>

        {/* Workload Analysis panel */}
        {showAnalysis && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="skeu-card p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-sky-600" />
                <h2 className="font-black text-slate-700">Workload Analysis</h2>
              </div>
              <button onClick={reset} className="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1 transition-colors font-bold">
                <RefreshCw className="w-3.5 h-3.5" /> Reset Data
              </button>
            </div>

            <div className={`rounded-2xl px-5 py-4 mb-6 flex items-center justify-between border ${
              state === 'normal'      ? 'bg-emerald-50/90 text-emerald-700 border-emerald-300/60' :
              state === 'elevated'    ? 'bg-amber-50/90 text-amber-700 border-amber-300/60' :
                                        'bg-red-50/90 text-red-700 border-red-300/60'
            }`}>
              <div>
                <p className="text-xs font-black uppercase tracking-wider opacity-70 mb-0.5">Current Status</p>
                <p className="text-xl font-black">{state === 'normal' ? 'Everything looks good' : state === 'elevated' ? 'Workload is high' : 'You are overwhelmed'}</p>
              </div>
              <div className="text-3xl">
                {state === 'normal' ? '✅' : state === 'elevated' ? '⚠️' : '🌿'}
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest px-1">Factors affecting your status</p>
              
              {([
                ['Task Volume', signals.taskAccumulation, 'Number of active tasks compared to your usual.'],
                ['Focus Area', signals.demandConcentration, 'How much one type of work is dominating your time.'],
                ['Completion Rate', 1 - signals.completionVelocity, 'Speed of finishing tasks versus adding new ones.'],
                ['Urgency', signals.temporalPressure, 'Proportion of tasks due in the next 48 hours.'],
                ['Self-Reported', signals.explicitSelfReport, 'Whether you have explicitly marked yourself as overwhelmed.'],
              ] as [string, number, string][]).map(([label, val, desc]) => (
                <div key={label} className="skeu-inset rounded-2xl p-4">
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <p className="font-black text-slate-700 text-sm">{label}</p>
                      <p className="text-[10px] text-slate-500 font-bold leading-tight mt-0.5">{desc}</p>
                    </div>
                    <p className="text-xs font-black text-slate-600">{Math.round(val * 100)}%</p>
                  </div>
                  <div className="w-full bg-sky-50/70 rounded-full h-2.5 overflow-hidden border border-sky-100/60">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${val > 0.7 ? 'bg-gradient-to-r from-red-400 to-pink-500' : val > 0.45 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-emerald-400 to-teal-500'}`} 
                      style={{ width: `${val * 100}%` }} 
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 bg-sky-50/90 rounded-2xl p-4 border border-sky-300/60 flex items-start gap-3">
              <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-sky-700 font-bold leading-relaxed">
                LoadLight monitors these signals to detect potential burnout. If your status reaches &quot;Overwhelmed&quot;, we&apos;ll suggest taking a break and prioritizing rest.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </AppLayout>
  )
}
