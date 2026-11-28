"use client"

// Global balance-check: mounted once in the root layout, watches the task
// list on every app page, and shows the BalancePopup when the AI (or the
// local tough-day fallback) finds the workload too heavy or too thin.
// Spec: docs/superpowers/specs/2026-07-04-global-balance-popup-design.md

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { useOverwhelmedStore } from "@/lib/store/overwhelmedStore"
import { getTasks, updateTask, addTask } from "@/lib/data/tasks"
import { BalancePopup } from "@/components/balance-popup"
import { shouldRequestBalanceCheck, addSuggestionToTask, type BalanceResult } from "@/lib/utils/balance"
import { canDeferTask, countRecentToughDays, buildToughDayResult } from "@/lib/utils/toughDays"
import { taskSignature, shouldSkipCheck, shouldShowResult, missingLifeAreas, buildTooLittleResult, type DismissedRecord } from "@/lib/utils/balanceTrigger"
import { dayKey, getDailyWorkload, taskMinutes, workloadDeadline } from "@/lib/utils/workload"

export const TASKS_CHANGED_EVENT = 'loadlight:tasks-changed'

const APP_PAGES = ['/dashboard', '/tasks', '/categories', '/settings']
const DISMISSED_KEY = 'loadlight-balance-dismissed'
const SPARK_KEY = 'loadlight-daily-history'
const REMINDER_KEY = 'loadlight-reminders-fired'
const DEBOUNCE_MS = 20_000

function readDismissed(): DismissedRecord | null {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    return raw ? JSON.parse(raw) as DismissedRecord : null
  } catch { return null }
}

function readBalanceMode(): string {
  try {
    const raw = localStorage.getItem('loadlight-user')
    if (raw) return (JSON.parse(raw).balanceMode as string) ?? 'average'
  } catch { /* ignore */ }
  return 'average'
}

function logDayLoad(date: string, minutes: number) {
  let history: { date: string; minutes: number }[] = []
  try {
    const raw = localStorage.getItem(SPARK_KEY)
    if (raw) history = JSON.parse(raw)
    const highest = Math.max(history.find(day => day.date === date)?.minutes ?? 0, minutes)
    history = [...history.filter(day => day.date !== date), { date, minutes: highest }].slice(-8)
    localStorage.setItem(SPARK_KEY, JSON.stringify(history))
  } catch { /* no storage */ }
  return history
}

function weekFrom(now: Date) {
  const date = new Date(now)
  date.setDate(date.getDate() + 7)
  return date
}

export function BalanceCheckProvider() {
  const pathname = usePathname()
  const { state } = useOverwhelmedStore()
  const [result, setResult] = useState<BalanceResult | null>(null)
  const [showIdeas, setShowIdeas] = useState(false)
  const lastSig = useRef<string | null>(null)
  const running = useRef(false)
  const nextExpiry = useRef(Infinity)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onAppPage = APP_PAGES.some(p => pathname === p || pathname?.startsWith(p + '/'))

  const runCheck = useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      const now = Date.now()
      const balanceMode = readBalanceMode()
      const tasks = await getTasks()
      nextExpiry.current = tasks.reduce((next, task) =>
        task.snoozedUntil && task.snoozedUntil > now ? Math.min(next, task.snoozedUntil) : next, Infinity)
      const day = getDailyWorkload(tasks, balanceMode, now)
      const recent = countRecentToughDays(logDayLoad(day.today, day.minutes), balanceMode)
      const active = day.tasks.map(task => ({
        id: task.id,
        name: task.name,
        category: task.category,
        deadline: task.deadline,
        recurring: task.recurring,
        estimated_minutes: taskMinutes(task),
        priority: task.priority,
      }))

      if (!shouldRequestBalanceCheck(state, active.length)) {
        setResult(null)
        lastSig.current = null
        return
      }

      const sig = `${day.today}|${balanceMode}|${taskSignature(active, day.minutes)}`
      if (shouldSkipCheck(sig, lastSig.current)) return
      lastSig.current = sig
      setShowIdeas(false)

      const dismissed = readDismissed()
      const spareMinutes = day.capacity - day.minutes
      const present = (advice: BalanceResult | null) => {
        const add = advice?.add.filter(item => (item.estimatedMinutes ?? 30) <= spareMinutes) ?? []
        const result = advice?.verdict === 'too_little' && !add.length ? null : advice
        setResult(result && shouldShowResult(result.verdict, sig, dismissed) ? { ...result, add } : null)
      }

      if (day.heavy) {
        present({
          ...buildToughDayResult(active, balanceMode, recent, dayKey(weekFrom(new Date(now)))),
          source: 'rules',
        })
        return
      }

      const ideas = buildTooLittleResult(missingLifeAreas(active))
      present(ideas ? { ...ideas, source: 'rules' } : null)
    } catch {
      setResult(null)
    } finally {
      running.current = false
    }
  }, [state])

  // Check on app open (first app page reached) and re-check when tasks change,
  // debounced so bulk edits produce one check after the last change
  useEffect(() => {
    if (!onAppPage) return
    runCheck()
    const onChanged = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(runCheck, DEBOUNCE_MS)
    }
    let checkedDay = dayKey(new Date())
    const refreshDay = () => {
      const now = new Date()
      const day = dayKey(now)
      if (day === checkedDay && now.getTime() < nextExpiry.current) return
      checkedDay = day
      void runCheck()
    }
    const clock = window.setInterval(refreshDay, 30_000)
    document.addEventListener('visibilitychange', refreshDay)
    window.addEventListener(TASKS_CHANGED_EVENT, onChanged)
    window.addEventListener('loadlight:balance-mode-changed', onChanged)
    return () => {
      window.clearInterval(clock)
      document.removeEventListener('visibilitychange', refreshDay)
      window.removeEventListener(TASKS_CHANGED_EVENT, onChanged)
      window.removeEventListener('loadlight:balance-mode-changed', onChanged)
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [onAppPage, runCheck])

  // ── Task reminders: browser notification when a fixed-time task comes due.
  // Deadlines are stored naive-UTC meaning "intended wall-clock time", so we
  // compare against the current wall clock, not real UTC.
  useEffect(() => {
    if (!onAppPage) return
    let notified: string[] = []
    try { notified = JSON.parse(localStorage.getItem(REMINDER_KEY) ?? '[]') } catch { /* optional storage */ }
    const check = async () => {
      try {
        if (localStorage.getItem('loadlight-notify') !== '1') return
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
        const nowWall = Date.now() - new Date().getTimezoneOffset() * 60000
        const all = await getTasks()
        for (const t of all) {
          if (t.done || t.status === 'completed' || t.status === 'archived' || (t.snoozedUntil ?? 0) > Date.now()) continue
          const deadline = workloadDeadline(t, Date.now())
          if (!deadline || !deadline.slice(11, 16) || deadline.slice(11, 16) === '00:00') continue
          const ms = Date.parse(`${deadline.replace(' ', 'T').slice(0, 16)}:00Z`)
          const key = `${t.id}|${ms}`
          // Fire within the 2 minutes after the deadline passes, once per task+time
          if (!notified.includes(key) && !isNaN(ms) && ms <= nowWall && nowWall - ms < 120_000) {
            new Notification(t.name, { body: 'Due now · LoadLight', tag: key })
            notified = [...notified, key].slice(-100)
            localStorage.setItem(REMINDER_KEY, JSON.stringify(notified))
          }
        }
      } catch { /* ignore */ }
    }
    check()
    const iv = setInterval(check, 60_000)
    return () => clearInterval(iv)
  }, [onAppPage])

  function close() {
    if (result && lastSig.current) {
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify({ sig: lastSig.current, verdict: result.verdict } satisfies DismissedRecord))
      } catch { /* ignore */ }
    }
    setResult(null)
  }

  async function defer(id: string, archive: boolean) {
    const now = new Date()
    const until = weekFrom(now)
    const task = (await getTasks()).find(task => task.id === id)
    if (!task || !canDeferTask(task, dayKey(until))) {
      throw new Error('This task can no longer be moved.')
    }
    await updateTask(id, archive ? { status: 'archived' } : { snoozedUntil: until.getTime() })
  }

  if (!onAppPage || !result || state === 'overwhelmed') return null
  if (result.verdict === 'too_little' && !showIdeas) {
    return (
      <button
        type="button"
        className="vista-btn-secondary fixed bottom-5 right-5 z-30 min-h-10 px-3 text-sm font-bold"
        onClick={() => setShowIdeas(true)}
      >
        Ideas for today
      </button>
    )
  }

  return (
    <BalancePopup
      key={lastSig.current}
      result={result}
      onHide={id => defer(id, false)}
      onArchive={id => defer(id, true)}
      onAdd={async item => { await addTask(addSuggestionToTask(item)) }}
      onClose={close}
    />
  )
}
