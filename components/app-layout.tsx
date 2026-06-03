"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, CheckSquare, Plus, Settings, Heart, Tags } from "@/lib/icons"
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
    <div className={`aero-bg min-h-screen ${stateClass}`} style={{ position: 'relative' }}>
      <div className="orb-layer" />
      <div className="wave-layer" />
      <div className="wave-layer-2" />

      {showCrisis && (
        <RestModeOverlay onDismiss={() => setShowCrisis(false)} onExitRestMode={exitRestMode} />
      )}

      {/* Rest mode banner */}
      {state === 'overwhelmed' && (
        <div
          className="rest-mode-banner"
          style={{ margin: '10px 10px 0', padding: '8px 16px', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}
        >
          <span style={{ fontWeight: 800, color: '#7a1a1a' }}>Rest mode active — take it easy today</span>
          <button
            onClick={() => setShowCrisis(true)}
            style={{ fontWeight: 800, fontSize: 11, textDecoration: 'underline', color: '#a03030', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Open
          </button>
        </div>
      )}

      {/* Top header — Vista title bar */}
      <header
        className="vista-header"
        style={{
          margin: state === 'overwhelmed' ? '8px 10px 0' : '10px 10px 0',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 10,
          zIndex: 40,
        }}
      >
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', position: 'relative', zIndex: 2 }}>
          <Image
            src="/logo.png"
            alt="LoadLight"
            width={34}
            height={34}
            style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.40))' }}
          />
          <span style={{ fontWeight: 900, fontSize: 18, color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.55)', letterSpacing: -0.3 }}>
            LoadLight
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 2 }}>
          {badge && (
            <span
              style={{
                background: badge.bgColor,
                color: badge.textColor,
                fontWeight: 800,
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 9999,
                border: `1px solid ${state === 'overwhelmed' ? '#d06060' : '#c89820'}`,
              }}
            >
              {badge.label}
            </span>
          )}
          <button
            onClick={() => { triggerOverwhelmedButton(); setShowCrisis(true) }}
            className="overwhelm-btn"
            style={{ padding: '5px 14px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Heart style={{ width: 14, height: 14, flexShrink: 0 }} />
            <span style={{ fontWeight: 800 }}>
              {state === 'overwhelmed' ? 'View Rest Mode' : "I'm overwhelmed"}
            </span>
            {selfReportCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 800, background: 'rgba(255,255,255,0.28)', padding: '1px 6px', borderRadius: 9999 }}>{selfReportCount}</span>
            )}
          </button>
        </div>
      </header>

      {/* Body */}
      <div style={{ display: 'flex', maxWidth: 1100, margin: '0 auto', padding: '14px 10px 80px', gap: 14 }}>

        {/* Desktop sidebar */}
        <nav
          className="vista-sidebar"
          style={{
            display: 'none',
            flexDirection: 'column',
            gap: 3,
            width: 196,
            flexShrink: 0,
            padding: 10,
            alignSelf: 'flex-start',
            position: 'sticky',
            top: 72,
          }}
          id="desktop-sidebar"
        >
          <style>{`@media (min-width: 768px) { #desktop-sidebar { display: flex !important; } }`}</style>
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 6,
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: active ? 700 : 600,
                  color: active ? '#ffffff' : '#2a4a70',
                  position: 'relative',
                  zIndex: 2,
                }}
                className={active ? 'nav-item-active' : 'vista-chip-inactive'}
              >
                <Icon style={{ width: 15, height: 15, flexShrink: 0, color: active ? '#ffffff' : '#4a6a90' }} />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Main content — Vista window content area (light, no gloss pseudo-element) */}
        <main
          style={{
            flex: 1,
            minWidth: 0,
            position: 'relative',
            zIndex: 10,
            padding: '18px 18px 22px',
            borderRadius: 8,
            backgroundColor: '#dce8f4',
            backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.88), rgba(210,230,248,0.82))',
            border: '1px solid #6a9fc8',
            borderTopColor: '#a8cce8',
            borderBottomColor: '#4a7aaa',
            boxShadow: '0 4px 12px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.90)',
          }}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom nav — Vista taskbar */}
      <nav
        className="vista-taskbar"
        style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          zIndex: 40,
          padding: '6px 4px',
          display: 'flex',
          justifyContent: 'space-around',
        }}
        id="mobile-nav"
      >
        <style>{`@media (min-width: 768px) { #mobile-nav { display: none !important; } }`}</style>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '5px 10px',
                borderRadius: 6,
                textDecoration: 'none',
                fontSize: 10,
                fontWeight: active ? 800 : 600,
                color: active ? '#ffffff' : '#90b0d0',
                position: 'relative',
                zIndex: 2,
              }}
              className={active ? 'nav-item-active' : ''}
            >
              <Icon style={{ width: 18, height: 18, color: active ? '#ffffff' : '#7090b8' }} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
