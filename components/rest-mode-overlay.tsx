"use client"

import { useState, useEffect } from "react"
import { X, Coffee, BookOpen, Music, Footprints, Phone, MessageSquare, LogOut, Loader2, CheckCircle, AlertCircle, HelpCircle, Globe } from "@/lib/icons"

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
    color: "aero-card-amber",
    iconColor: "#ffd98a",
  },
  {
    icon: BookOpen,
    title: "Read something light",
    desc: "A short article, a few pages — nothing heavy.",
    color: "aero-card-sky",
    iconColor: "#7bc8ff",
  },
  {
    icon: Music,
    title: "Put on music",
    desc: "Calm or upbeat — whatever lifts your mood.",
    color: "aero-card-violet",
    iconColor: "#d4a8ff",
  },
  {
    icon: Footprints,
    title: "Short walk",
    desc: "Even 5 minutes outside helps reset your brain.",
    color: "aero-card-green",
    iconColor: "#80ffc8",
  },
]

// ── Static crisis lines by timezone/locale — no API calls ──
interface CrisisLine { label: string; number: string; href: string; note?: string }
interface CrisisInfo { country: string; lines: CrisisLine[] }

const CRISIS_BY_TZ: Record<string, CrisisInfo> = {
  'Europe/Sofia':     { country: 'Bulgaria',     lines: [{ label: 'Надежда (Hope Line)', number: '0800 1 84 84', href: 'tel:080018484', note: 'free, 24/7' }, { label: 'EU helpline', number: '116 123', href: 'tel:116123' }] },
  'Europe/Amsterdam': { country: 'Netherlands',   lines: [{ label: '113 Zelfmoordpreventie', number: '0800 0113', href: 'tel:08000113', note: 'free, 24/7' }] },
  'Europe/Berlin':    { country: 'Germany',       lines: [{ label: 'Telefonseelsorge', number: '0800 111 0 111', href: 'tel:08001110111', note: 'free, 24/7' }] },
  'Europe/Paris':     { country: 'France',        lines: [{ label: 'Numéro National Prévention Suicide', number: '3114', href: 'tel:3114', note: 'free, 24/7' }] },
  'Europe/Warsaw':    { country: 'Poland',        lines: [{ label: 'Telefon Zaufania dla Dorosłych', number: '116 123', href: 'tel:116123' }] },
  'Europe/Bucharest': { country: 'Romania',       lines: [{ label: 'Telefonul Speranței', number: '0800 801 200', href: 'tel:0800801200', note: 'free' }] },
  'Europe/Athens':    { country: 'Greece',        lines: [{ label: 'Klimaka', number: '1018', href: 'tel:1018' }] },
  'Europe/Prague':    { country: 'Czechia',       lines: [{ label: 'Linka bezpečí', number: '116 111', href: 'tel:116111' }] },
  'Europe/Vienna':    { country: 'Austria',       lines: [{ label: 'Telefonseelsorge', number: '142', href: 'tel:142', note: 'free, 24/7' }] },
  'Europe/Brussels':  { country: 'Belgium',       lines: [{ label: 'Centrum ter Preventie', number: '0800 32 123', href: 'tel:080032123', note: 'free' }] },
  'Europe/Madrid':    { country: 'Spain',         lines: [{ label: 'Teléfono de la Esperanza', number: '717 003 717', href: 'tel:717003717' }] },
  'Europe/Rome':      { country: 'Italy',         lines: [{ label: 'Telefono Amico', number: '02 2327 2327', href: 'tel:0223272327' }] },
  'Europe/Lisbon':    { country: 'Portugal',      lines: [{ label: 'SOS Voz Amiga', number: '213 544 545', href: 'tel:213544545' }] },
  'Europe/Stockholm': { country: 'Sweden',        lines: [{ label: 'Mind Självmordslinjen', number: '90101', href: 'tel:90101', note: 'free, 24/7' }] },
  'Europe/Helsinki':  { country: 'Finland',       lines: [{ label: 'Kriisipuhelin', number: '09 2525 0111', href: 'tel:0925250111' }] },
  'Europe/Oslo':      { country: 'Norway',        lines: [{ label: 'Mental Helse', number: '116 123', href: 'tel:116123', note: 'free, 24/7' }] },
  'Europe/Copenhagen':{ country: 'Denmark',       lines: [{ label: 'Livslinien', number: '70 201 201', href: 'tel:70201201' }] },
  'Europe/London':    { country: 'UK',            lines: [{ label: 'Samaritans', number: '116 123', href: 'tel:116123', note: 'free, 24/7' }] },
  'Europe/Dublin':    { country: 'Ireland',       lines: [{ label: 'Samaritans', number: '116 123', href: 'tel:116123', note: 'free, 24/7' }] },
  'America/New_York': { country: 'USA',           lines: [{ label: 'Suicide & Crisis Lifeline', number: '988', href: 'tel:988', note: 'call or text' }, { label: 'Crisis Text Line', number: '741741', href: 'sms:741741?body=HOME', note: 'text HOME' }] },
  'America/Chicago':  { country: 'USA',           lines: [{ label: 'Suicide & Crisis Lifeline', number: '988', href: 'tel:988', note: 'call or text' }, { label: 'Crisis Text Line', number: '741741', href: 'sms:741741?body=HOME', note: 'text HOME' }] },
  'America/Los_Angeles': { country: 'USA',        lines: [{ label: 'Suicide & Crisis Lifeline', number: '988', href: 'tel:988', note: 'call or text' }, { label: 'Crisis Text Line', number: '741741', href: 'sms:741741?body=HOME', note: 'text HOME' }] },
  'America/Toronto':  { country: 'Canada',        lines: [{ label: 'Crisis Services Canada', number: '1-833-456-4566', href: 'tel:18334564566', note: '24/7' }] },
  'Australia/Sydney': { country: 'Australia',     lines: [{ label: 'Lifeline', number: '13 11 14', href: 'tel:131114', note: '24/7' }] },
}

const INTERNATIONAL_FALLBACK: CrisisLine[] = [
  { label: 'EU standard helpline', number: '116 123', href: 'tel:116123', note: 'many EU countries' },
  { label: 'Befrienders Worldwide', number: 'befrienders.org', href: 'https://www.befrienders.org', note: 'find local lines' },
]

// Pure client-side — no API calls
function getCrisisInfo(): CrisisInfo {
  if (typeof window === 'undefined') return { country: '', lines: INTERNATIONAL_FALLBACK }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  // Exact match first
  if (CRISIS_BY_TZ[tz]) return CRISIS_BY_TZ[tz]
  // Suffix match: e.g. "America/Denver" → find any "America/..." key with same country
  // (only useful for multi-timezone countries like USA; do NOT fall back continent-wide)
  const [continent, city] = tz.split('/')
  if (city) {
    const same = Object.entries(CRISIS_BY_TZ).find(([k]) => k.startsWith(continent + '/') && CRISIS_BY_TZ[k])
    // Only use if we have a city-level match in the same continent — but only for regions
    // where all entries share a country (America/* → USA/Canada varies, so skip)
    if (continent === 'Australia' || continent === 'Pacific') {
      if (same) return same[1]
    }
  }
  return { country: '', lines: INTERNATIONAL_FALLBACK }
}

function getStoredTasks() {
  try { return JSON.parse(localStorage.getItem('loadlight-tasks') ?? '[]') } catch { return [] }
}

// Sorted list of all available countries for the manual selector
const COUNTRY_OPTIONS: { label: string; info: CrisisInfo }[] = Object.values(
  Object.entries(CRISIS_BY_TZ).reduce<Record<string, { label: string; info: CrisisInfo }>>((acc, [, info]) => {
    if (!acc[info.country]) acc[info.country] = { label: info.country, info }
    return acc
  }, {})
).sort((a, b) => a.label.localeCompare(b.label))

// ── CrisisRedirect — zero API calls ──
export function CrisisRedirect() {
  const detected = getCrisisInfo()
  const [override, setOverride] = useState<CrisisInfo | null>(null)
  const [showSelector, setShowSelector] = useState(false)
  const { country, lines } = override ?? detected

  return (
    <div className="aero-danger rounded-2xl p-4 mb-5">
      <p style={{ fontSize: 11, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        This app tracks tasks, not mental health. If you need support:
      </p>
      <div className="flex items-center gap-2 mb-2">
        {country && (
          <p className="text-[10px] font-bold flex items-center gap-1 opacity-70">
            <Globe className="w-3 h-3" /> Showing lines for {country}
          </p>
        )}
        <button
          onClick={() => setShowSelector(s => !s)}
          className="text-[10px] underline font-bold transition-colors ml-auto opacity-60 hover:opacity-90"
        >
          {showSelector ? 'Cancel' : 'Wrong country?'}
        </button>
      </div>
      {showSelector && (
        <select
          className="input-skeu w-full text-xs rounded-lg px-2 py-1.5 mb-3 focus:outline-none"
          defaultValue=""
          onChange={e => {
            const found = COUNTRY_OPTIONS.find(o => o.label === e.target.value)
            if (found) { setOverride(found.info); setShowSelector(false) }
          }}
        >
          <option value="" disabled>Select your country…</option>
          {COUNTRY_OPTIONS.map(o => (
            <option key={o.label} value={o.label}>{o.label}</option>
          ))}
          <option value="__intl">International / other</option>
        </select>
      )}
      <div className="flex flex-col gap-2">
        {(override?.country === '' ? INTERNATIONAL_FALLBACK : lines).map(line => (
          <a
            key={line.number}
            href={line.href}
            className="flex items-center gap-2 text-sm font-semibold transition-colors hover:opacity-90"
          >
            {line.href.startsWith('sms') ? (
              <MessageSquare className="w-4 h-4 shrink-0" />
            ) : line.href.startsWith('http') ? (
              <Globe className="w-4 h-4 shrink-0" />
            ) : (
              <Phone className="w-4 h-4 shrink-0" />
            )}
            <span>{line.number} — {line.label}{line.note ? ` (${line.note})` : ''}</span>
          </a>
        ))}
      </div>
    </div>
  )
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
    <div className="anim-overlay-in" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: 16 }}>
      <div className="vista-dialog anim-scale-in" style={{ width: '100%', maxWidth: 520, padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-black" style={{ color: '#1a2a4a' }}>Rest Mode Active</h2>
            <p className="text-sm mt-0.5" style={{ color: '#4a6a8a' }}>Take a moment. Your tasks will be here when you&apos;re ready.</p>
          </div>
          <button
            onClick={onDismiss}
            className="vista-close-btn"
            aria-label="Close"
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: 11, fontWeight: 900 }}
          >
            ✕
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
                <div className="aero-success rounded-2xl p-3.5">
                  <p className="text-xs font-black uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> These can wait today
                  </p>
                  <ul className="space-y-1.5">
                    {triage!.canSkip.map((item, i) => (
                      <li key={i} className="flex items-start justify-between gap-3">
                        <span className="text-sm font-semibold leading-snug">{item.name}</span>
                        <span className="text-xs whitespace-nowrap shrink-0 opacity-70">{item.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {triage!.urgent.length > 0 && (
                <div className="aero-warning rounded-2xl p-3.5">
                  <p className="text-xs font-black uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> Worth keeping on the radar
                  </p>
                  <ul className="space-y-1.5">
                    {triage!.urgent.map((item, i) => (
                      <li key={i} className="flex items-start justify-between gap-3">
                        <span className="text-sm font-semibold leading-snug">{item.name}</span>
                        <span className="text-xs whitespace-nowrap shrink-0 opacity-70">{item.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {triage!.question && questionAnswer === null && (
                <div className="aero-info rounded-2xl p-3.5">
                  <p className="text-xs font-black uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5" /> Quick question
                  </p>
                  <p className="text-sm font-medium mb-3 leading-snug">{triage!.question}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setQuestionAnswer('yes')}
                      className="flex-1 vista-chip-active font-bold py-1.5 rounded-xl text-sm transition-colors"
                    >
                      Yes, today
                    </button>
                    <button
                      onClick={() => setQuestionAnswer('no')}
                      className="flex-1 vista-btn-secondary font-bold py-1.5 text-sm transition-colors"
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
              className={`${color} p-3.5`}
            >
              <Icon className="w-5 h-5 mb-2" style={{ color: iconColor }} />
              <p className="font-bold text-sm" style={{ color: '#1a1a1a' }}>{title}</p>
              <p className="text-xs mt-0.5 leading-snug" style={{ color: '#4a6a8a' }}>{desc}</p>
            </div>
          ))}
        </div>

        {/* Crisis lines — static, no API calls, location-based */}
        <CrisisRedirect />

        {/* Actions */}
          {confirmExit ? (
            <div className="flex flex-col gap-2 anim-fade-in-up">
              <p className="text-sm text-center font-medium mb-1" style={{ color: '#3a5a7a' }}>
                Exit rest mode?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { onExitRestMode(); onDismiss() }}
                  className="flex-1 overwhelm-btn py-2 rounded-xl text-sm font-bold"
                >
                  Yes, exit
                </button>
                <button
                  onClick={() => setConfirmExit(false)}
                  className="flex-1 vista-btn-secondary py-2 text-sm"
                >
                  Stay in rest mode
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 anim-fade-in">
              <button
                onClick={() => setConfirmExit(true)}
                className="flex-1 flex items-center justify-center gap-1.5 vista-btn-secondary py-2 text-sm font-bold"
              >
                <LogOut className="w-4 h-4" />
                Exit Rest Mode
              </button>
              <button
                onClick={onDismiss}
                className="flex-1 glow-button py-2 text-sm font-bold"
                style={{
                  background: 'linear-gradient(180deg, #f472b6 0%, #ec4899 38%, #db2777 55%, #9d174d 100%)',
                  borderTopColor: 'rgba(255,200,230,0.75)',
                  borderBottomColor: 'rgba(100,0,60,0.55)',
                }}
              >
                Stay in Rest Mode
              </button>
            </div>
          )}
      </div>
    </div>
  )
}
