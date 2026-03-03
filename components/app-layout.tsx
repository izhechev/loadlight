"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence } from "framer-motion"
import { LayoutDashboard, CheckSquare, Plus, Settings, Heart, Tags } from "lucide-react"
import { useOverwhelmedStore } from "@/lib/store/overwhelmedStore"
import { CrisisRedirect } from "@/components/crisis-redirect"
import { useState, useEffect } from "react"

const NAV = [
  { href: "/dashboard", label: "Overview",  icon: LayoutDashboard },
  { href: "/tasks",     label: "Tasks",     icon: CheckSquare },
  { href: "/tasks/new", label: "Add Task",  icon: Plus },
  { href: "/categories",label: "Categories",icon: Tags },
  { href: "/settings",  label: "Settings",  icon: Settings },
]

const STATE_BADGE: Record<string, { label: string; cls: string } | null> = {
  normal:      null,
  elevated:    { label: "⚠ Heads up",   cls: "bg-amber-100 text-amber-700 border border-amber-200" },
  overwhelmed: { label: "🌿 Rest Mode",  cls: "bg-pink-100 text-pink-700 border border-pink-200" },
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { state, triggerOverwhelmedButton, exitRestMode, selfReportCount } = useOverwhelmedStore()
  const [showCrisis, setShowCrisis] = useState(false)

  // Request notification permission and poll for due tasks
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission()
      }

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
            
            // Notify if due within the next 2 hours, or already overdue
            if (timeUntilDue <= 2 * 60 * 60 * 1000) {
              new Notification('Task Reminder: ' + t.name, {
                body: `This task is due ${timeUntilDue < 0 ? 'now/overdue' : 'soon'}.`,
                icon: '/logo.png'
              })
              notifiedTasks.push(t.id)
            }
          })
          
          localStorage.setItem('loadlight-notified', JSON.stringify(notifiedTasks))
        } catch (err) {
          console.error(err)
        }
      }

      // Check immediately, then every 5 minutes
      checkReminders()
      const interval = setInterval(checkReminders, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (state === "overwhelmed") {
      requestAnimationFrame(() => {
        setShowCrisis(prev => prev ? prev : true)
      })
    }
  }, [state])

  const stateClass =
    state === "overwhelmed" ? "aero-state-overwhelmed" :
    state === "elevated"    ? "aero-state-elevated" : ""

  const badge = STATE_BADGE[state]

  return (
    <div className={`aero-bg min-h-screen ${stateClass}`}>
      <div className="orb-layer">
        <div className="orb w-32 h-32 top-[10%] left-[5%]" style={{ animation: 'float-slow 8s infinite alternate' }}></div>
        <div className="orb w-48 h-48 top-[60%] left-[85%]" style={{ animation: 'float-med 12s infinite alternate' }}></div>
        <div className="orb w-24 h-24 top-[40%] left-[40%]" style={{ animation: 'float-slow 6s infinite alternate' }}></div>
      </div>
      
      <AnimatePresence>
        {showCrisis && (
          <CrisisRedirect onDismiss={() => { setShowCrisis(false); exitRestMode() }} />
        )}
      </AnimatePresence>

      {/* ── Top header ── */}
      <header className="glass-panel-strong mx-3 mt-3 px-4 py-3 flex items-center justify-between sticky top-3 z-40">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="LoadLight" width={36} height={36} className="logo-glow-sm" />
          <span className="font-black text-lg gradient-text tracking-tight hidden sm:block">LoadLight</span>
        </Link>

        <div className="flex items-center gap-2">
          {badge && (
            <span className={`text-xs px-3 py-1.5 rounded-full font-bold ${badge.cls}`}>
              {badge.label}
            </span>
          )}
          <button
            onClick={() => { 
              triggerOverwhelmedButton()
              setShowCrisis(true)
            }}
            className="bg-gradient-to-r from-rose-400 to-pink-500 text-white font-bold px-3 sm:px-4 py-2 rounded-xl text-sm flex items-center gap-1.5 hover:brightness-110 active:brightness-90 transition-all shadow-md hover:shadow-lg border border-rose-300"
          >
            <Heart className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">{state === 'overwhelmed' ? 'View Rest Mode' : "I'm overwhelmed"}</span>
            <span className="sm:hidden">{state === 'overwhelmed' ? 'Rest' : 'Help'}</span>
            {selfReportCount > 0 && (
              <span className="text-xs opacity-80 bg-white/20 px-1.5 py-0.5 rounded-full">{selfReportCount}</span>
            )}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex max-w-6xl mx-auto w-full px-3 py-4 gap-4 pb-24 md:pb-6">

        {/* ── Desktop sidebar (md+) ── */}
        <nav className="hidden md:flex glass-panel p-3 flex-col gap-1 w-52 shrink-0 h-fit sticky top-20 self-start border border-white/10 shadow-2xl">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-150 ${
                  active
                    ? "bg-white/20 text-white shadow-inner-sm border border-white/30"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass-panel-strong rounded-none rounded-t-3xl px-2 py-2 flex justify-around border-t border-white/20">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all text-xs font-semibold ${
                active
                  ? "text-white bg-white/20 shadow-inner"
                  : "text-slate-400"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
