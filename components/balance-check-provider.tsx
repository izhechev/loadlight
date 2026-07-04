"use client"

// Global balance-check: mounted once in the root layout, watches the task
// list on every app page, and shows the BalancePopup when the AI (or the
// local tough-day fallback) finds the workload too heavy or too thin.
// Spec: docs/superpowers/specs/2026-07-04-global-balance-popup-design.md

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { useOverwhelmedStore } from "@/lib/store/overwhelmedStore"
import { useCategoryStore } from "@/lib/store/categoryStore"
import { getTasks, updateTask, deleteTask, addTask, type Task } from "@/lib/data/tasks"
import { BalancePopup } from "@/components/balance-popup"
import { shouldRequestBalanceCheck, addSuggestionToTask, type BalanceResult, type AddItem } from "@/lib/utils/balance"
import { dayLoadMinutes, toughDayThreshold, isToughDay, countRecentToughDays, buildToughDayResult, type LoadTask } from "@/lib/utils/toughDays"
import { taskSignature, shouldSkipCheck, shouldShowResult, missingLifeAreas, buildTooLittleResult, type DismissedRecord } from "@/lib/utils/balanceTrigger"

export const TASKS_CHANGED_EVENT = 'loadlight:tasks-changed'

const APP_PAGES = ['/dashboard', '/tasks', '/categories', '/settings']
const DISMISSED_KEY = 'loadlight-balance-dismissed'
const SPARK_KEY = 'loadlight-sparkline-history'
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

/** Spark history entries carry {date, minutes}; today's entry may be stale. */
function loadHistoryWithToday(todayLoadMin: number): { date: string; minutes: number }[] {
  const today = new Date().toISOString().slice(0, 10)
  let hist: { date: string; minutes: number }[] = []
  try {
    const raw = localStorage.getItem(SPARK_KEY)
    if (raw) hist = (JSON.parse(raw) as { date: string; minutes: number }[]).map(e => ({ date: e.date, minutes: e.minutes }))
  } catch { /* ignore */ }
  return hist.some(h => h.date === today)
    ? hist.map(h => h.date === today ? { date: today, minutes: todayLoadMin } : h)
    : [...hist, { date: today, minutes: todayLoadMin }]
}

export function BalanceCheckProvider() {
  const pathname = usePathname()
  const { state } = useOverwhelmedStore()
  const { categories } = useCategoryStore()
  const [result, setResult] = useState<BalanceResult | null>(null)
  const lastSig = useRef<string | null>(null)
  const running = useRef(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onAppPage = APP_PAGES.some(p => pathname === p || pathname?.startsWith(p + '/'))

  const runCheck = useCallback(async () => {
    if (running.current) return
    running.current = true
    try {
      const all = await getTasks()
      // Data layer returns camelCase; the API and load helpers read snake_case
      const active = all
        .filter(t => !t.done && t.status !== 'archived')
        .map(t => ({
          id: t.id,
          name: t.name,
          category: t.category,
          demand_type: t.demandType,
          estimated_minutes: (t as Task & { estimated_minutes?: number | null }).estimated_minutes ?? t.estimatedMinutes ?? null,
          priority: t.priority,
          done: false,
        }))

      if (!shouldRequestBalanceCheck(state, active.length)) return

      const balanceMode = readBalanceMode()
      const loadMin = dayLoadMinutes(active as LoadTask[])
      const sig = taskSignature(active, loadMin)
      if (shouldSkipCheck(sig, lastSig.current)) return
      lastSig.current = sig

      const threshold = toughDayThreshold(balanceMode)
      const tough = isToughDay(loadMin, balanceMode)
      const recentToughDays = countRecentToughDays(loadHistoryWithToday(loadMin), balanceMode)
      const missing = missingLifeAreas(active)
      const dismissed = readDismissed()

      const present = (r: BalanceResult | null) => {
        if (r && shouldShowResult(r.verdict, sig, dismissed)) setResult(r)
      }
      // Local verdicts when the AI is unavailable or says "ok": heavy day →
      // too_much; light day missing 2+ life areas → too_little suggestions
      const localFallback = () => {
        if (tough) present(buildToughDayResult(active as LoadTask[], balanceMode, recentToughDays))
        else present(buildTooLittleResult(missing))
      }

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'balance-check',
            tasks: active,
            state,
            balanceMode,
            categories: categories.map(c => c.name),
            dayLoadMinutes: loadMin,
            toughDayThreshold: threshold,
            recentToughDays,
            missingAreas: missing,
          }),
        })
        const data = await res.json() as BalanceResult
        if (data && data.verdict && data.verdict !== 'ok') present(data)
        else localFallback()
      } catch {
        localFallback()
      }
    } finally {
      running.current = false
    }
  }, [state, categories])

  // Check on app open (first app page reached) and re-check when tasks change,
  // debounced so bulk edits produce one check after the last change
  useEffect(() => {
    if (!onAppPage) return
    runCheck()
    const onChanged = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(runCheck, DEBOUNCE_MS)
    }
    window.addEventListener(TASKS_CHANGED_EVENT, onChanged)
    return () => {
      window.removeEventListener(TASKS_CHANGED_EVENT, onChanged)
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [onAppPage, runCheck])

  // ── Task reminders: browser notification when a fixed-time task comes due.
  // Deadlines are stored naive-UTC meaning "intended wall-clock time", so we
  // compare against the current wall clock, not real UTC.
  useEffect(() => {
    if (!onAppPage) return
    const notified = new Set<string>()
    const check = async () => {
      try {
        if (localStorage.getItem('loadlight-notify') !== '1') return
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
        const nowWall = Date.now() - new Date().getTimezoneOffset() * 60000
        const all = await getTasks()
        for (const t of all) {
          if (t.done || t.status === 'archived' || !t.deadline?.includes('T')) continue
          const dl = t.deadline.replace(' ', 'T')
          const ms = new Date(dl.endsWith('Z') || dl.includes('+') ? dl : dl + 'Z').getTime()
          const key = `${t.id}|${t.deadline}`
          // Fire within the 2 minutes after the deadline passes, once per task+time
          if (!notified.has(key) && !isNaN(ms) && ms <= nowWall && nowWall - ms < 120_000) {
            notified.add(key)
            new Notification(t.name, { body: 'Due now · LoadLight' })
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

  if (!onAppPage || !result) return null

  return (
    <BalancePopup
      result={result}
      onHide={id => { updateTask(id, { snoozedUntil: Date.now() + 7 * 24 * 60 * 60 * 1000 }).catch(() => {}) }}
      onDelete={id => { deleteTask(id).catch(() => {}) }}
      onAdd={(item: AddItem) => { addTask(addSuggestionToTask(item)).catch(() => {}) }}
      onClose={close}
    />
  )
}
