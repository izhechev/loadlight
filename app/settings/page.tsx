"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Lock, ChevronRight, Brain, RefreshCw, BarChart3, Info, Download, Upload, CheckCircle, KeyRound } from "@/lib/icons"
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
        {showOverrideModal && (
          <div className="anim-overlay-in" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: 16 }}>
            <div className="skeu-card max-w-sm w-full p-6 anim-scale-in">
              <div className="flex items-center gap-3 mb-4">
                <KeyRound className="w-6 h-6 text-amber-600 shrink-0" />
                <div>
                  <h2 className="font-black" style={{ color: '#1a1a1a' }}>Override Chill Guy Lock</h2>
                  <p className="text-xs font-bold" style={{ color: '#5a7a9a' }}>This lock is here to protect your recovery. Are you sure?</p>
                </div>
              </div>
              <p className="text-sm mb-3" style={{ color: '#2a3a50' }}>
                Type <span className="font-black" style={{ color: '#1a1a1a' }}>{OVERRIDE_PHRASE}</span> to confirm you want to leave Chill Guy mode early.
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
                  className="flex-1 vista-btn-secondary font-bold text-sm py-2.5"
                >
                  Stay in Chill Guy
                </button>
              </div>
            </div>
          </div>
        )}

      <div className="max-w-xl mx-auto space-y-6">
        <div className="page-header flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black" style={{ color: '#1a1a1a' }}>Settings</h1>
            <p className="text-sm font-bold" style={{ color: '#5a7a9a' }}>Configure your balance goals and monitor workload status</p>
          </div>
        </div>

        {/* Balance mode selector */}
        <div className="skeu-card p-6 anim-fade-in-up">
          <h2 className="font-black mb-1" style={{ color: '#1a1a1a' }}>Balance Mode</h2>
          <p className="text-xs mb-5 font-bold" style={{ color: '#5a7a9a' }}>Sets your target work/leisure ratio. AI advice adapts per mode.</p>

          {balanceMode === 'chill' && chillLockUntil && now > 0 && now < chillLockUntil && (
            <div className="mb-4 aero-warning rounded-2xl px-4 py-3 flex items-center gap-3">
              <Lock className="w-4 h-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Chill Guy lock active</p>
                <p className="text-xs font-bold opacity-75">{lockDaysLeft} days remaining · Prevents impulsive switching</p>
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
                  className={`w-full flex items-center gap-4 rounded-2xl p-4 text-left transition-all ${
                    active  ? 'vista-mode-active' :
                    locked  ? 'vista-mode-inactive opacity-40 cursor-not-allowed' :
                              'vista-mode-inactive'
                  }`}
                >
                  <span className="text-3xl">{mode.emoji}</span>
                  <div className="flex-1">
                    <p className="font-black" style={{ color: active ? '#1a3a6a' : '#1a1a1a' }}>{mode.label}</p>
                    <p className="text-xs mt-0.5 font-bold" style={{ color: '#4a6a8a' }}>{mode.ratio} work/leisure · {mode.desc}</p>
                    {locked && (
                      <p className="text-xs mt-1 flex items-center gap-1 font-bold" style={{ color: '#7a5000' }}>
                        <Lock className="w-3 h-3" /> Locked until {new Date(chillLockUntil!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  {active && <ChevronRight className="w-4 h-4 shrink-0" style={{ color: '#1a5a98' }} />}
                </button>
              )
            })}
          </div>
          {saved && <p className="text-xs text-emerald-600 mt-3 font-bold">✓ Settings saved</p>}
        </div>

        {/* ── Data backup ── */}
        <div className="skeu-card p-6 anim-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h2 className="font-black mb-1" style={{ color: '#1a1a1a' }}>Data Backup</h2>
          <p className="text-xs mb-5 font-bold" style={{ color: '#5a7a9a' }}>All data is stored locally in your browser. Export regularly to avoid losing tasks.</p>
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
              className="flex items-center gap-2 vista-btn-secondary font-bold px-4 py-3 rounded-2xl text-sm transition-all"
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
        </div>

        {/* Status Toggle */}
        <div className="flex justify-center pb-2">
          <button
            onClick={() => setShowAnalysis(!showAnalysis)}
            className="text-xs font-bold transition-colors vista-btn-secondary px-4 py-2"
          >
            {showAnalysis ? 'Hide workload analysis' : 'Show workload analysis'}
          </button>
        </div>

        {/* Workload Analysis panel */}
        {showAnalysis && (
          <div className="skeu-card p-6 anim-fade-in">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-sky-600" />
                <h2 className="font-black" style={{ color: '#1a1a1a' }}>Workload Analysis</h2>
              </div>
              <button onClick={reset} style={{ fontSize: 11, color: '#c83030', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <RefreshCw className="w-3.5 h-3.5" /> Reset Data
              </button>
            </div>

            <div className={`rounded-2xl px-5 py-4 mb-6 flex items-center justify-between shadow-md relative overflow-hidden ${
              state === 'normal'   ? 'aero-success' :
              state === 'elevated' ? 'aero-warning' :
                                     'aero-danger'
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
              <p className="text-xs font-black uppercase tracking-widest px-1" style={{ color: '#5a7a9a' }}>Factors affecting your status</p>
              
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
                      <p className="font-black text-sm" style={{ color: '#1a1a1a' }}>{label}</p>
                      <p className="text-[10px] font-bold leading-tight mt-0.5" style={{ color: '#5a7a9a' }}>{desc}</p>
                    </div>
                    <p className="text-xs font-black" style={{ color: '#2a3a50' }}>{Math.round(val * 100)}%</p>
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

            <div className="mt-6 aero-info rounded-2xl p-4 flex items-start gap-3">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-[11px] font-bold leading-relaxed">
                LoadLight monitors these signals to detect potential burnout. If your status reaches &quot;Overwhelmed&quot;, we&apos;ll suggest taking a break and prioritizing rest.
              </p>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
