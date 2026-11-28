/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ClassicIcon, type IconName } from "@/lib/classic-icons"
import { useOverwhelmedStore } from "@/lib/store/overwhelmedStore"
import { RestModeOverlay } from "@/components/rest-mode-overlay"
import { useState, useEffect } from "react"

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Overview",   icon: "navoverview" },
  { href: "/tasks",     label: "Tasks",      icon: "tasks" },
  { href: "/tasks/new", label: "Add Task",   icon: "navadd" },
  { href: "/categories",label: "Categories", icon: "navcategories" },
  { href: "/settings",  label: "Settings",   icon: "navsettings" },
]

const STATE_BADGE: Record<string, { label: string; bgColor: string; textColor: string } | null> = {
  normal:      null,
  elevated:    { label: "Heads up",  bgColor: '#fff0c0', textColor: '#6a4800' },
  overwhelmed: { label: "Rest Mode", bgColor: '#ffd8d4', textColor: '#7a1a1a' },
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
    <div className={`aero-bg workspace-desktop ${stateClass}`}>
      <a href="#workspace-main" className="workspace-skip">Skip to content</a>

      {showCrisis && (
        <RestModeOverlay onDismiss={() => setShowCrisis(false)} onExitRestMode={exitRestMode} />
      )}

      <header className="workspace-header">
        <Link href="/dashboard" className="workspace-brand">
          <Image src="/logo.png" alt="" width={36} height={36} />
          <span>LoadLight</span>
        </Link>

        <div className="workspace-header-actions">
          {badge && (
            <span
              className="workspace-state"
              style={{ backgroundColor: badge.bgColor, color: badge.textColor }}
            >
              {badge.label}
            </span>
          )}
          <button
            type="button"
            onClick={() => { triggerOverwhelmedButton(); setShowCrisis(true) }}
            className="workspace-rest-button"
          >
            <ClassicIcon name="navheart" size={18} />
            <span>{state === 'overwhelmed' ? 'View Rest Mode' : "I'm overwhelmed"}</span>
            {selfReportCount > 0 && <span className="workspace-rest-count">{selfReportCount}</span>}
          </button>
        </div>
      </header>

      {state === 'overwhelmed' && (
        <div className="rest-mode-banner workspace-rest-banner">
          <span>Rest mode active. Take it easy today.</span>
          <button type="button" onClick={() => setShowCrisis(true)}>Open</button>
        </div>
      )}

      <div className="workspace-body">
        <nav className="workspace-nav" aria-label="Workspace">
          {NAV.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className="workspace-nav-link"
              aria-current={pathname === href ? 'page' : undefined}
            >
              <ClassicIcon name={icon} size={22} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <main id="workspace-main" tabIndex={-1} className="workspace-main">
          {children}
        </main>
      </div>
    </div>
  )
}
