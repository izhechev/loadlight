"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Lock, ChevronRight, Brain, RefreshCw, BarChart3, Info, Download, Upload, CheckCircle, KeyRound } from "lucide-react"
import { AppLayout } from "@/components/app-layout"
import { useOverwhelmedStore } from "@/lib/store/overwhelmedStore"

type BalanceMode = 'beast' | 'average' | 'chill'

const MODES: { id: BalanceMode; emoji: string; label: string; ratio: string; targetWork: number; desc: string }[] = [
  { id: 'beast',   emoji: '⚡', label: 'Beast Worker',   ratio: '70/30', targetWork: 70, desc: 'Maximize productivity. High output focus.' },
  { id: 'average', emoji: '⚖️', label: 'Average Worker', ratio: '50/50', targetWork: 50, desc: 'Healthy balance. Sustainable long-term.' },
  { id: 'chill',   emoji: '🌿', label: 'Chill Guy',      ratio: '30/70', targetWork: 30, desc: 'Rest and leisure first. Recovery-focused.' },
]

const BACKUP_KEYS = [
  'loadlight-tasks',
  'loadlight-categories',
  'loadlight-user',
  'loadlight-overwhelmed',
  'loadlight-chill-lock',
  'loadlight-sparkline-history',
  'loadlight-notified',
]

export default function SettingsPage() {
  const { state, signals, reset } = useOverwhelmedStore()
  const [balanceMode, setBalanceMode] = useState<BalanceMode>('average')
  const [chillLockUntil, setChillLockUntil] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)
  const [now, setNow] = useState<number>(0)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [showOverrideModal, setShowOverrideModal] = useState(false)
  const [overridePhrase, setOverridePhrase] = useState('')
  const [pendingMode, setPendingMode] = useState<BalanceMode | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const OVERRIDE_PHRASE = 'I want to switch'

  useEffect(() => {
    const time = Date.now()
    requestAnimationFrame(() => {
      setNow(time)
      try {
        const stored = localStorage.getItem('loadlight-user')
        if (stored) {
          const p = JSON.parse(stored) as { balanceMode?: string }
          // Migrate old 'balanced' value to 'average'
          const bm = p.balanceMode === 'balanced' ? 'average' : p.balanceMode
          if (bm) setBalanceMode(bm as BalanceMode)
        }
        const lock = localStorage.getItem('loadlight-chill-lock')
        if (lock) setChillLockUntil(parseInt(lock, 10))
      } catch { /* ignore */ }
    })
  }, [])

  const isLocked = useCallback((mode: BalanceMode, currentTime: number): boolean => {
    return mode !== 'chill' && balanceMode === 'chill' && !!chillLockUntil && currentTime > 0 && currentTime < chillLockUntil
  }, [balanceMode, chillLockUntil])

  function applyMode(mode: BalanceMode) {
    const currentTime = now || Date.now()
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
  }

  const selectMode = useCallback((mode: BalanceMode) => {
    const currentTime = now || Date.now()
    if (isLocked(mode, currentTime)) {
      // Offer override instead of silently blocking
      setPendingMode(mode)
      setOverridePhrase('')
      setShowOverrideModal(true)
      return
    }
    applyMode(mode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceMode, chillLockUntil, isLocked, now])

  const lockDaysLeft = (chillLockUntil && now > 0) ? Math.ceil((chillLockUntil - now) / 86400000) : 0

  return (
    <AppLayout>
      {/* Chill Guy lock override modal */}
      <AnimatePresence>
        {showOverrideModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="skeu-card max-w-sm w-full p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <KeyRound className="w-6 h-6 text-amber-600 shrink-0" />
                <div>
                  <h2 className="font-black text-slate-800">Override Chill Guy Lock</h2>
                  <p className="text-xs text-slate-500 font-bold">This lock is here to protect your recovery. Are you sure?</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Type <span className="font-black text-slate-800">{OVERRIDE_PHRASE}</span> to confirm you want to leave Chill Guy mode early.
              </p>
              <input
                autoFocus
                type="text"
                value={overridePhrase}
                onChange={e => setOverridePhrase(e.target.value)}
                placeholder={OVERRIDE_PHRASE}
                className="input-skeu w-full rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (overridePhrase.trim().toLowerCase() === OVERRIDE_PHRASE.toLowerCase() && pendingMode) {
                      // Clear the lock
                      setChillLockUntil(null)
                      localStorage.removeItem('loadlight-chill-lock')
                      setShowOverrideModal(false)
                      applyMode(pendingMode)
                    }
                  }}
                  disabled={overridePhrase.trim().toLowerCase() !== OVERRIDE_PHRASE.toLowerCase()}
                  className="flex-1 glow-button font-black text-sm py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Confirm switch
                </button>
                <button
                  onClick={() => setShowOverrideModal(false)}
                  className="flex-1 bg-white/60 border border-sky-100/60 text-slate-600 font-bold text-sm py-2.5 rounded-xl hover:bg-white/80 transition-all"
                >
                  Stay in Chill Guy
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-xl mx-auto space-y-6">
        <div className="page-header flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Settings</h1>
            <p className="text-sm text-slate-500 font-bold">Configure your balance goals and monitor workload status</p>
          </div>
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
                    active    ? 'border-sky-400/80 bg-gradient-to-br from-sky-50/90 via-cyan-50/80 to-blue-50/70 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_4px_12px_rgba(14,165,233,0.15)] relative before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-b before:from-white/30 before:to-transparent before:pointer-events-none' :
                    locked    ? 'border-sky-100/40 bg-sky-50/30 opacity-40 cursor-not-allowed' :
                                'border-sky-100/60 bg-white/50 hover:bg-white/75 hover:border-sky-200/80 hover:shadow-md'
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

        {/* ── Data backup ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="skeu-card p-6">
          <h2 className="font-black text-slate-700 mb-1">Data Backup</h2>
          <p className="text-xs text-slate-500 mb-5 font-bold">All data is stored locally in your browser. Export regularly to avoid losing tasks.</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                try {
                  const backup: Record<string, unknown> = { exportedAt: new Date().toISOString() }
                  BACKUP_KEYS.forEach(k => {
                    const v = localStorage.getItem(k)
                    if (v) backup[k] = JSON.parse(v)
                  })
                  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `loadlight-backup-${new Date().toISOString().slice(0, 10)}.json`
                  a.click()
                  URL.revokeObjectURL(url)
                } catch { /* ignore */ }
              }}
              className="glow-button flex items-center gap-2 font-bold px-4 py-3 text-sm"
            >
              <Download className="w-4 h-4" /> Export all data (.json)
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 bg-white/60 hover:bg-white/80 border-2 border-sky-100/60 hover:border-sky-200/80 text-slate-700 font-bold px-4 py-3 rounded-2xl text-sm transition-all hover:shadow-md"
            >
              <Upload className="w-4 h-4" /> Import backup (.json)
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = ev => {
                  try {
                    const data = JSON.parse(ev.target?.result as string) as Record<string, unknown>
                    let count = 0
                    BACKUP_KEYS.forEach(k => {
                      if (data[k] !== undefined) {
                        localStorage.setItem(k, JSON.stringify(data[k]))
                        count++
                      }
                    })
                    setImportMsg(`✓ Restored ${count} data keys. Reloading…`)
                    setTimeout(() => window.location.reload(), 1500)
                  } catch {
                    setImportMsg('⚠ Could not parse backup file.')
                  }
                }
                reader.readAsText(file)
                e.target.value = ''
              }}
            />
            {importMsg && (
              <p className={`text-xs font-bold ${importMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>{importMsg}</p>
            )}
          </div>
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

            <div className={`rounded-2xl px-5 py-4 mb-6 flex items-center justify-between border-2 shadow-md relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/30 before:to-transparent before:pointer-events-none ${
              state === 'normal'      ? 'bg-gradient-to-br from-emerald-50/95 to-teal-50/80 text-emerald-700 border-emerald-300/60' :
              state === 'elevated'    ? 'bg-gradient-to-br from-amber-50/95 to-yellow-50/80 text-amber-700 border-amber-300/60' :
                                        'bg-gradient-to-br from-red-50/95 to-pink-50/80 text-red-700 border-red-300/60'
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
                  <div className="progress-track h-3 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-1000 ${val > 0.7 ? '!bg-gradient-to-r from-red-400 via-pink-500 to-rose-500' : val > 0.45 ? '!bg-gradient-to-r from-amber-400 via-orange-400 to-orange-500' : 'progress-aero'}`}
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
