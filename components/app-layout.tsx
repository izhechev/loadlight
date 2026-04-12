"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { LayoutDashboard, CheckSquare, Plus, Settings, Heart, Tags } from "lucide-react"
import { useOverwhelmedStore } from "@/lib/store/overwhelmedStore"
import { RestModeOverlay } from "@/components/rest-mode-overlay"
import { useState, useEffect } from "react"

const NAV = [
  { href: "/dashboard", label: "Overview",   icon: LayoutDashboard },
  { href: "/tasks",     label: "Tasks",      icon: CheckSquare },
  { href: "/tasks/new", label: "Add Task",   icon: Plus },
  { href: "/categories",label: "Categories", icon: Tags },
  { href: "/settings",  label: "Settings",   icon: Settings },
]

const STATE_BADGE: Record<string, { label: string; cls: string } | null> = {
  normal:      null,
  elevated:    { label: "⚠ Heads up",  cls: "bg-amber-50 text-amber-700 border-2 border-amber-300 shadow-sm font-black" },
  overwhelmed: { label: "🌿 Rest Mode", cls: "bg-pink-50 text-pink-700 border-2 border-pink-300 shadow-sm font-black" },
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { state, triggerOverwhelmedButton, exitRestMode, selfReportCount } = useOverwhelmedStore()
  const [showCrisis, setShowCrisis] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') Notification.requestPermission()

      const checkReminders = () => {
        if (Notification.permission !== 'granted') return
        try {
          const stored = localStorage.getItem('loadlight-tasks')
          if (!stored) return
          const tasks = JSON.parse(stored) as any[]
          const now = Date.now()
          const notifiedTasks = JSON.parse(localStorage.getItem('loadlight-notified') || '[]') as string[]
          tasks.filter(t => !t.done && t.deadline).forEach(t => {
            if (notifiedTasks.includes(t.id)) return
            const dueTime = new Date(t.deadline).getTime()
            const timeUntilDue = dueTime - now
            if (timeUntilDue <= 2 * 60 * 60 * 1000) {
              new Notification('Task Reminder: ' + t.name, {
                body: `This task is due ${timeUntilDue < 0 ? 'now/overdue' : 'soon'}.`,
                icon: '/logo.png'
              })
              notifiedTasks.push(t.id)
            }
          })
          localStorage.setItem('loadlight-notified', JSON.stringify(notifiedTasks))
        } catch (err) { console.error(err) }
      }

      checkReminders()
      const interval = setInterval(checkReminders, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (state === "overwhelmed") {
      requestAnimationFrame(() => setShowCrisis(prev => prev ? prev : true))
    }
  }, [state])

  const stateClass =
    state === "overwhelmed" ? "aero-state-overwhelmed" :
    state === "elevated"    ? "aero-state-elevated" : ""

  const badge = STATE_BADGE[state]

  return (
    <div className={`aero-bg min-h-screen ${stateClass}`}>
      {/* Shockwave orbs */}
      <div className="orb-layer">
        <div className="shockwave w-[520px] h-[520px] top-[15%] left-[5%]"  style={{ animationDelay: '0s',  animationDuration: '12s' }} />
        <div className="shockwave w-[720px] h-[720px] top-[45%] left-[55%]" style={{ animationDelay: '2s',  animationDuration: '16s' }} />
        <div className="shockwave w-[420px] h-[420px] top-[65%] left-[15%]" style={{ animationDelay: '4s',  animationDuration: '10s' }} />
        <div className="shockwave w-[620px] h-[620px] top-[10%] left-[70%]" style={{ animationDelay: '6s',  animationDuration: '14s' }} />
      </div>
      <div className="wave-layer" />
      <div className="wave-layer-2" />

      <AnimatePresence>
        {showCrisis && (
          <RestModeOverlay onDismiss={() => setShowCrisis(false)} onExitRestMode={exitRestMode} />
        )}
      </AnimatePresence>

      {/* ── Rest mode banner ── */}
      {state === 'overwhelmed' && (
        <div className="mx-3 mt-3 px-5 py-2.5 rest-mode-banner rounded-2xl flex items-center justify-between text-sm">
          <span className="font-black text-pink-700 tracking-tight">🌿 Rest mode active — take it easy today</span>
          <button
            onClick={() => setShowCrisis(true)}
            className="text-pink-600 hover:text-pink-900 font-black text-xs underline underline-offset-2 transition-colors"
          >
            Open
          </button>
        </div>
      )}

      {/* ── Top header ── */}
      <header className={`vista-header mx-3 px-5 py-3.5 flex items-center justify-between sticky z-40 ${state === 'overwhelmed' ? 'top-3 mt-2' : 'mt-3 top-3'}`}>
        <Link href="/dashboard" className="flex items-center gap-3 relative z-10">
          <Image
            src="/logo.png"
            alt="LoadLight"
            width={38}
            height={38}
            className="drop-shadow-[0_2px_6px_rgba(0,100,200,0.35)]"
          />
          <span className="font-black text-xl gradient-text tracking-tight hidden sm:block">LoadLight</span>
        </Link>

        <div className="flex items-center gap-2.5 relative z-10">
          {badge && (
            <span className={`text-xs px-3 py-1.5 rounded-full ${badge.cls}`}>
              {badge.label}
            </span>
          )}
          <button
            onClick={() => { triggerOverwhelmedButton(); setShowCrisis(true) }}
            className="overwhelm-btn px-4 sm:px-5 py-2 text-sm flex items-center gap-2"
          >
            <Heart className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline font-black">
              {state === 'overwhelmed' ? 'View Rest Mode' : "I'm overwhelmed"}
            </span>
            <span className="sm:hidden font-black">{state === 'overwhelmed' ? 'Rest' : 'Help'}</span>
            {selfReportCount > 0 && (
              <span className="text-[11px] font-black bg-white/25 px-1.5 py-0.5 rounded-full">{selfReportCount}</span>
            )}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex max-w-6xl mx-auto w-full px-3 py-4 gap-4 pb-24 md:pb-6">

        {/* ── Desktop sidebar ── */}
        <nav className="hidden md:flex vista-sidebar p-3 flex-col gap-1 w-56 shrink-0 self-stretch sticky top-20 shadow-lg">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-all duration-150 z-10 ${
                  active
                    ? "nav-item-active"
                    : "text-slate-600 font-semibold hover:bg-white/70 hover:text-slate-900 hover:shadow-sm"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-sky-700' : ''}`} />
                {label}
              </Link>
            )
          })}

          {/* Sidebar bottom decoration — aqua orb */}
          <div className="mt-auto pt-3 flex justify-center opacity-30 pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-gradient-radial from-sky-300 via-cyan-200 to-transparent blur-lg" />
          </div>
        </nav>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0 relative z-10">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav — Vista taskbar ── */}
      <nav className="md:hidden vista-taskbar fixed bottom-0 left-0 right-0 z-40 rounded-t-3xl px-2 py-2 flex justify-around">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-all text-xs z-10 ${
                active
                  ? "nav-item-active font-black"
                  : "text-slate-500 font-semibold hover:text-slate-700"
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-sky-700' : ''}`} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
