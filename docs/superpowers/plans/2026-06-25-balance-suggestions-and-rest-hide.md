# Balance Suggestions + Rest-Mode Auto-Hide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI "too much / too little" balance popup on the dashboard (one-click hide/delete/add), and fix Rest Mode so it actually hides non-essential tasks when the user enters it.

**Architecture:** A new `balance-check` mode in the existing `app/api/chat/route.ts` returns a structured verdict; a new `components/balance-popup.tsx` renders it as a classic Vista modal that the dashboard shows on load when an imbalance exists. Two pure helpers (`lib/utils/balance.ts`, `lib/utils/restHide.ts`) hold all the testable logic. Rest-mode hiding is triggered in `components/app-layout.tsx` when state becomes `overwhelmed`, snoozing AI/heuristic-selected tasks via the existing `snoozedUntil` mechanism.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Vitest, Zustand, Google Gemini via direct fetch.

## Global Constraints

- **Ethics (RQ6):** All AI copy obeys the existing `ETHICAL_SYSTEM_PROMPT` in `app/api/chat/route.ts`. Tone: "you might consider", "one option is" — never "you should"/"you must". No clinical/emotional language.
- **2008 aesthetic:** No emoji in new UI. Use `ClassicIcon` from `lib/classic-icons.tsx` and existing Vista classes (`vista-dialog`, `vista-titlebar`, `skeu-card`, `vista-btn-secondary`, `glow-button`, `anim-scale-in`, `anim-overlay-in`). Tahoma is inherited globally.
- **No new dependencies.** Only libraries already in `package.json`.
- **Never suggest removing or hiding health/medication tasks.** Reuse the regex `/pill|medication|medicine|vitamin|supplement|therapy|doctor|medical|lamictal|lithium/i`.
- **Suppress all "do more" prompting when `state === 'overwhelmed'`.**
- Test runner: `npm run test` (vitest run). Lint: `npm run lint`. Build: `npm run build`.

---

## Part A — Balance Suggestions Popup

### Task 1: Pure balance helpers

**Files:**
- Create: `lib/utils/balance.ts`
- Test: `lib/utils/balance.test.ts`

**Interfaces:**
- Produces:
  - `shouldRequestBalanceCheck(state: string, activeTaskCount: number): boolean`
  - `addSuggestionToTask(item: { name: string; category: string }): TaskInsert` where `TaskInsert = Omit<import('@/lib/data/tasks').Task, 'id' | 'createdAt'>`
  - types `BalanceVerdict = 'too_much' | 'ok' | 'too_little'`, `RemoveItem = { id: string; name: string; reason: string }`, `AddItem = { name: string; category: string; reason: string }`, `BalanceResult = { verdict: BalanceVerdict; headline: string; reason: string; remove: RemoveItem[]; add: AddItem[] }`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/utils/balance.test.ts
import { describe, it, expect } from 'vitest'
import { shouldRequestBalanceCheck, addSuggestionToTask } from './balance'

describe('shouldRequestBalanceCheck', () => {
  it('is false when overwhelmed', () => {
    expect(shouldRequestBalanceCheck('overwhelmed', 5)).toBe(false)
  })
  it('is false when there are no active tasks', () => {
    expect(shouldRequestBalanceCheck('normal', 0)).toBe(false)
  })
  it('is true for normal state with active tasks', () => {
    expect(shouldRequestBalanceCheck('normal', 3)).toBe(true)
  })
  it('is true for elevated state with active tasks', () => {
    expect(shouldRequestBalanceCheck('elevated', 2)).toBe(true)
  })
})

describe('addSuggestionToTask', () => {
  it('maps a suggestion to a sane default task insert', () => {
    const t = addSuggestionToTask({ name: 'Read a book', category: 'Personal' })
    expect(t).toMatchObject({
      name: 'Read a book',
      category: 'Personal',
      lifeDomain: 'personal',
      demandType: 'routine',
      difficulty: 2,
      priority: 3,
      deadline: null,
      startDate: null,
      estimatedMinutes: 30,
      notes: '',
      status: 'active',
      recurring: 'none',
      recurringHours: null,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- balance`
Expected: FAIL — `Failed to resolve import "./balance"`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/utils/balance.ts
import type { Task } from '@/lib/data/tasks'

export type BalanceVerdict = 'too_much' | 'ok' | 'too_little'
export interface RemoveItem { id: string; name: string; reason: string }
export interface AddItem { name: string; category: string; reason: string }
export interface BalanceResult {
  verdict: BalanceVerdict
  headline: string
  reason: string
  remove: RemoveItem[]
  add: AddItem[]
}

export type TaskInsert = Omit<Task, 'id' | 'createdAt'>

/** Whether the dashboard should ask the AI for a balance check at all. */
export function shouldRequestBalanceCheck(state: string, activeTaskCount: number): boolean {
  if (state === 'overwhelmed') return false
  if (activeTaskCount <= 0) return false
  return true
}

/** Map an AI "add" suggestion into a real task insert with safe defaults. */
export function addSuggestionToTask(item: { name: string; category: string }): TaskInsert {
  return {
    name: item.name,
    category: item.category || 'Personal',
    lifeDomain: 'personal',
    demandType: 'routine',
    difficulty: 2,
    priority: 3,
    deadline: null,
    startDate: null,
    estimatedMinutes: 30,
    notes: '',
    status: 'active',
    recurring: 'none',
    recurringHours: null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- balance`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/utils/balance.ts lib/utils/balance.test.ts
git commit -m "feat(balance): pure helpers for balance-check gating and add-suggestion mapping"
```

---

### Task 2: `balance-check` mode in the chat route

**Files:**
- Modify: `app/api/chat/route.ts` (add `state?: string` to body type; add mock fallback branch; add handler branch)

**Interfaces:**
- Consumes: client POST `{ mode: 'balance-check', tasks, state, balanceMode, categories }`
- Produces: JSON `BalanceResult` (see Task 1). On suppression/offline returns `{ verdict: 'ok', headline: '', reason: '', remove: [], add: [] }`.

- [ ] **Step 1: Add `state` to the request body type**

In `app/api/chat/route.ts`, in the `POST` body type object (the `const body = await req.json() as { ... }` block), add this line after `balanceMode?: string`:

```typescript
    state?: string       // overwhelmed-state suppression for balance-check
```

- [ ] **Step 2: Add the mock fallback branch**

In `generateWithGemini`, immediately **before** the final `return { object: { verdict: 'balanced', ... } } as any` block, add:

```typescript
  if (options.mode === 'balance-check') {
    return { object: { verdict: 'ok', headline: '', reason: '', remove: [], add: [] } } as any
  }
```

- [ ] **Step 3: Add the route handler branch**

In `POST`, immediately **before** the final `return Response.json({ error: 'Unknown mode' }, { status: 400 })`, add:

```typescript
  if (mode === 'balance-check') {
    const activeTasks = (tasks ?? []).filter(t => !t.done)

    // Suppress entirely when overwhelmed or nothing to analyse
    if (body.state === 'overwhelmed' || activeTasks.length === 0) {
      return Response.json({ verdict: 'ok', headline: '', reason: '', remove: [], add: [] })
    }

    // Deduplicate recurring tasks by name+category so "three sports" counts once
    const seen = new Set<string>()
    const deduped = activeTasks.filter(t => {
      const key = `${(t.name ?? '').trim().toLowerCase()}||${(t.category ?? '').toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const taskSummary = deduped.map(t =>
      `- id:"${t.id ?? ''}" name:"${t.name}" [cat:${t.category ?? 'Personal'}, type:${t.demand_type ?? 'routine'}, ~${t.estimated_minutes ?? 30}min]`
    ).join('\n')

    return Response.json((await generateWithGemini({
      mode: 'balance-check',
      jsonSchemaText: `{ "verdict": "too_much" | "ok" | "too_little", "headline": "string", "reason": "string", "remove": [{ "id": "string", "name": "string", "reason": "string" }], "add": [{ "name": "string", "category": "string", "reason": "string" }] }`,
      system: ETHICAL_SYSTEM_PROMPT,
      prompt: `Analyse the BALANCE of the user's activity mix — based on how many activities there are AND what they are (the task names/types), not just raw volume.

Decide ONE verdict:
- "too_much": the user is over-concentrated in one kind of activity (e.g. three or more similar high-effort commitments such as multiple sports, or many demanding cognitive tasks). Populate "remove" with up to 3 candidate tasks they might drop. NEVER include health or medication tasks (pills, vitamins, therapy, doctor, medical, lamictal, lithium).
- "too_little": the activity list is genuinely sparse or very narrow AND would benefit from variety. Populate "add" with 2-3 realistic suggested activities, each mapped to one of these categories: ${categories.join(', ')}. A small but calm and fine list (e.g. only reading and drawing) is NOT "too_little" — return "ok" for that.
- "ok": the mix is reasonable. Leave "remove" and "add" empty.

headline: <=8 words. reason: one observational sentence. Each item "reason": <=8 words.
Tone: "you might consider", "one option is". Never "you should". No emotional language.

Active tasks:
${taskSummary}`,
    })).object)
  }
```

- [ ] **Step 4: Verify lint + build**

Run: `npm run lint`
Expected: no new errors in `app/api/chat/route.ts`.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manually verify the offline shape**

Start the dev server (`npm run dev`) and in another shell run:

```bash
curl -s -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d '{"mode":"balance-check","state":"overwhelmed","tasks":[{"id":"1","name":"x","done":false}]}'
```

Expected output: `{"verdict":"ok","headline":"","reason":"","remove":[],"add":[]}` (suppressed because overwhelmed). Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(balance): add balance-check mode to chat route with overwhelmed suppression"
```

---

### Task 3: The Vista balance popup component

**Files:**
- Create: `components/balance-popup.tsx`

**Interfaces:**
- Consumes: `BalanceResult`, `AddItem` from `@/lib/utils/balance`
- Produces: `export function BalancePopup(props: BalancePopupProps)` where

```typescript
interface BalancePopupProps {
  result: BalanceResult
  onHide: (id: string) => void
  onDelete: (id: string) => void
  onAdd: (item: AddItem) => void
  onClose: () => void
}
```

- [ ] **Step 1: Create the component**

```tsx
// components/balance-popup.tsx
"use client"

import { useState } from "react"
import { X, EyeOff, Trash2, Plus, CheckCircle } from "@/lib/icons"
import { ClassicIcon } from "@/lib/classic-icons"
import type { BalanceResult, AddItem } from "@/lib/utils/balance"

interface BalancePopupProps {
  result: BalanceResult
  onHide: (id: string) => void
  onDelete: (id: string) => void
  onAdd: (item: AddItem) => void
  onClose: () => void
}

export function BalancePopup({ result, onHide, onDelete, onAdd, onClose }: BalancePopupProps) {
  const [acted, setActed] = useState<Set<string>>(new Set())
  const mark = (key: string) => setActed(prev => new Set([...prev, key]))

  const tooMuch = result.verdict === 'too_much'
  const icon = tooMuch ? 'warning' : 'chart'

  return (
    <div className="anim-overlay-in" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.45)' }}>
      <div className="vista-dialog anim-scale-in" style={{ maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Title bar */}
        <div className="vista-titlebar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 6px 12px' }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>Balance Check</span>
          <button onClick={onClose} className="vista-close-btn" aria-label="Close" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X style={{ width: 11, height: 11, color: '#fff' }} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          <div className="flex items-center gap-2 mb-2">
            <ClassicIcon name={icon} size={22} />
            <h2 className="font-black" style={{ color: '#1a1a1a', fontSize: 17 }}>{result.headline}</h2>
          </div>
          <p style={{ color: '#3a5a7a', fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>{result.reason}</p>

          {/* Too much → hide / delete */}
          {tooMuch && result.remove.length > 0 && (
            <div className="space-y-2 mb-2">
              {result.remove.map(item => {
                const done = acted.has(item.id)
                return (
                  <div key={item.id} className="skeu-inset" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 4 }}>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate" style={{ color: '#1a1a1a' }}>{item.name}</p>
                      <p className="text-[11px] font-bold opacity-70" style={{ color: '#5a7a9a' }}>{item.reason}</p>
                    </div>
                    {done ? (
                      <span className="flex items-center gap-1 text-xs font-black" style={{ color: '#1a7a50' }}>
                        <CheckCircle className="w-4 h-4" /> Hidden
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => { onHide(item.id); mark(item.id) }}
                          className="vista-btn-secondary text-xs font-black px-3 py-1.5 flex items-center gap-1"
                        >
                          <EyeOff className="w-3.5 h-3.5" /> Hide for the week
                        </button>
                        <button
                          onClick={() => { onDelete(item.id); mark(item.id) }}
                          className="text-[11px] font-bold flex items-center gap-1 transition-colors"
                          style={{ color: '#a83232' }}
                          title="Delete permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Too little → add */}
          {!tooMuch && result.add.length > 0 && (
            <div className="space-y-2 mb-2">
              {result.add.map((item, i) => {
                const key = `add-${i}-${item.name}`
                const done = acted.has(key)
                return (
                  <div key={key} className="skeu-inset" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 4 }}>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate" style={{ color: '#1a1a1a' }}>{item.name}</p>
                      <p className="text-[11px] font-bold opacity-70" style={{ color: '#5a7a9a' }}>{item.category} · {item.reason}</p>
                    </div>
                    {done ? (
                      <span className="flex items-center gap-1 text-xs font-black shrink-0" style={{ color: '#1a7a50' }}>
                        <CheckCircle className="w-4 h-4" /> Added
                      </span>
                    ) : (
                      <button
                        onClick={() => { onAdd(item); mark(key) }}
                        className="glow-button text-xs font-black px-3 py-1.5 flex items-center gap-1 shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <p className="text-[11px] font-bold mt-3 italic" style={{ color: '#7a9ab8' }}>
            AI suggestions · task data only · you stay in control
          </p>

          <button onClick={onClose} className="vista-btn-secondary" style={{ width: '100%', padding: '8px', fontSize: 13, marginTop: 10 }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify icons exist**

Run: `npm run build`
Expected: build succeeds. If any of `X`, `EyeOff`, `Trash2`, `Plus`, `CheckCircle` is missing from `@/lib/icons`, the build fails with a named-export error — open `lib/icons.tsx` and confirm each is exported (they are all used elsewhere: `EyeOff` in `chill-suggestions.tsx`, `Trash2`/`Plus` in `tasks/page.tsx`).

- [ ] **Step 3: Commit**

```bash
git add components/balance-popup.tsx
git commit -m "feat(balance): Vista balance popup component (hide/delete/add)"
```

---

### Task 4: Wire the popup into the dashboard

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `BalancePopup` (Task 3), `shouldRequestBalanceCheck`, `BalanceResult`, `AddItem`, `addSuggestionToTask` (Tasks 1), `addTask`, `deleteTask` (from `@/lib/data/tasks`).

- [ ] **Step 1: Add imports**

In `app/dashboard/page.tsx`, update the data import and add the new imports:

```typescript
import { getTasks, updateTask, addTask, deleteTask, IS_DEMO } from "@/lib/data/tasks"
import { BalancePopup } from "@/components/balance-popup"
import { shouldRequestBalanceCheck, addSuggestionToTask, type BalanceResult, type AddItem } from "@/lib/utils/balance"
```

- [ ] **Step 2: Extract a reusable `loadTasks` and add balance state**

Replace the mount `useEffect` that calls `getTasks()` (the block starting `// Load tasks + balance mode`) so task-loading lives in a reusable callback. Add the new state declarations near the other `useState` calls:

```typescript
  const [balanceResult, setBalanceResult] = useState<BalanceResult | null>(null)
  const [showBalance, setShowBalance] = useState(false)
  const balanceFetched = useRef(false)

  const loadTasks = useCallback(() => {
    return getTasks()
      .then(data => setTasks(data.map(t => ({ ...t, category: t.category || t.lifeDomain || 'Personal' })) as unknown as Task[]))
      .catch(() => {
        try {
          const t = localStorage.getItem('loadlight-tasks')
          if (t) setTasks((JSON.parse(t) as any[]).map(tsk => ({ ...tsk, category: tsk.category || tsk.life_domain || 'Personal' })) as Task[])
        } catch { /* ignore */ }
      })
  }, [])
```

Then change the mount effect body to call `loadTasks()` instead of the inline `getTasks().then(...).catch(...)` (keep the `loadlight-user` / chill-lock reading that follows it unchanged), and add `loadTasks` to that effect's dependency array.

- [ ] **Step 3: Add the balance-check fetch effect**

Add this effect after the existing "Auto-fetch AI advisory" effect:

```typescript
  // Balance check — runs once per dashboard load when not overwhelmed
  useEffect(() => {
    if (balanceFetched.current || !tasks.length) return
    const active = tasks.filter(t => !t.done)
    if (!shouldRequestBalanceCheck(state, active.length)) return
    balanceFetched.current = true

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'balance-check',
        tasks: active,
        state,
        balanceMode,
        categories: categories.map(c => c.name),
      }),
    })
      .then(r => r.json())
      .then((data: BalanceResult) => {
        if (data && data.verdict && data.verdict !== 'ok') {
          setBalanceResult(data)
          setShowBalance(true)
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, state])
```

- [ ] **Step 4: Generalise `handleSnooze` to accept a duration and add balance handlers**

Change the existing `handleSnooze` signature to accept an optional day count, then add the balance action handlers below it:

```typescript
  function handleSnooze(ids: string[], days = 1) {
    const snoozedUntil = Date.now() + days * 24 * 60 * 60 * 1000
    setTasks(prev => {
      const updated = prev.map(t => ids.includes(t.id) ? { ...t, snoozedUntil } : t)
      if (IS_DEMO) { try { localStorage.setItem('loadlight-tasks', JSON.stringify(updated)) } catch { /* ignore */ } }
      return updated
    })
    ids.forEach(id => updateTask(id, { snoozedUntil }).catch(() => {}))
  }

  function handleBalanceHide(id: string) {
    handleSnooze([id], 7)
  }

  function handleBalanceDelete(id: string) {
    setTasks(prev => {
      const updated = prev.filter(t => t.id !== id)
      if (IS_DEMO) { try { localStorage.setItem('loadlight-tasks', JSON.stringify(updated)) } catch { /* ignore */ } }
      return updated
    })
    deleteTask(id).catch(() => {})
  }

  function handleBalanceAdd(item: AddItem) {
    addTask(addSuggestionToTask({ name: item.name, category: item.category }))
      .then(() => loadTasks())
      .catch(() => {})
  }
```

(The existing `ChillSuggestions` call uses `onSnooze={handleSnooze}` — the new default `days = 1` keeps its behaviour identical.)

- [ ] **Step 5: Render the popup**

Inside the returned `<AppLayout>`, right after the opening `<AppLayout>` tag (next to the `showChillLockModal` block), add:

```tsx
      {showBalance && balanceResult && (
        <BalancePopup
          result={balanceResult}
          onHide={handleBalanceHide}
          onDelete={handleBalanceDelete}
          onAdd={handleBalanceAdd}
          onClose={() => setShowBalance(false)}
        />
      )}
```

- [ ] **Step 6: Verify lint + build**

Run: `npm run lint`
Expected: no new errors in `app/dashboard/page.tsx`.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Manual smoke test**

Run `npm run dev`. In the browser, with the app in demo mode (no Supabase env), add 3+ similar tasks (e.g. "Football", "Tennis", "Basketball") via Add Task, then open the dashboard. With a `GOOGLE_API_KEY` set the popup should appear with a "too much" verdict; without a key the route returns `ok` and no popup shows (expected graceful degradation). Confirm the "Hide for the week" button hides a task (it disappears from Up next / Tasks active list) and "Add" on a "too little" list inserts a task. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "feat(balance): show balance popup on dashboard with hide/delete/add actions"
```

---

## Part B — Rest-Mode Auto-Hide

### Task 5: Pure rest-hide helpers

**Files:**
- Create: `lib/utils/restHide.ts`
- Test: `lib/utils/restHide.test.ts`

**Interfaces:**
- Produces:
  - `endOfTodayMs(now: number): number` — timestamp of the next local midnight after `now`.
  - `selectRestHideIds(tasks: RestHideTask[], now: number): string[]` where `RestHideTask = { id: string; name: string; priority?: number; deadline?: string | null; done?: boolean; snoozedUntil?: number | null }`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/utils/restHide.test.ts
import { describe, it, expect } from 'vitest'
import { endOfTodayMs, selectRestHideIds } from './restHide'

describe('endOfTodayMs', () => {
  it('returns the next local midnight, strictly after now', () => {
    const now = new Date(2026, 5, 25, 14, 30).getTime() // 25 Jun 2026 14:30 local
    const end = endOfTodayMs(now)
    expect(end).toBeGreaterThan(now)
    const d = new Date(end)
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
    expect(d.getDate()).toBe(26)
  })
})

describe('selectRestHideIds', () => {
  const now = Date.now()
  const far = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
  const soon = new Date(now + 3 * 60 * 60 * 1000).toISOString()

  it('hides a normal no-deadline task', () => {
    expect(selectRestHideIds([{ id: 'a', name: 'Tidy desk', priority: 3 }], now)).toEqual(['a'])
  })
  it('keeps done tasks', () => {
    expect(selectRestHideIds([{ id: 'a', name: 'Tidy desk', priority: 3, done: true }], now)).toEqual([])
  })
  it('keeps priority 1 tasks', () => {
    expect(selectRestHideIds([{ id: 'a', name: 'File taxes', priority: 1 }], now)).toEqual([])
  })
  it('keeps health/medication tasks', () => {
    expect(selectRestHideIds([{ id: 'a', name: 'Take lithium', priority: 3 }], now)).toEqual([])
  })
  it('keeps tasks due within 48h', () => {
    expect(selectRestHideIds([{ id: 'a', name: 'Tidy desk', priority: 3, deadline: soon }], now)).toEqual([])
  })
  it('hides tasks whose deadline is far away', () => {
    expect(selectRestHideIds([{ id: 'a', name: 'Tidy desk', priority: 3, deadline: far }], now)).toEqual(['a'])
  })
  it('keeps already-snoozed tasks', () => {
    expect(selectRestHideIds([{ id: 'a', name: 'Tidy desk', priority: 3, snoozedUntil: now + 1000 }], now)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- restHide`
Expected: FAIL — `Failed to resolve import "./restHide"`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/utils/restHide.ts

export interface RestHideTask {
  id: string
  name: string
  priority?: number
  deadline?: string | null
  done?: boolean
  snoozedUntil?: number | null
}

const HEALTH = /pill|medication|medicine|vitamin|supplement|therapy|doctor|medical|lamictal|lithium/i
const FORTY_EIGHT_H = 48 * 60 * 60 * 1000

/** Timestamp of the next local midnight after `now`. */
export function endOfTodayMs(now: number): number {
  const d = new Date(now)
  d.setHours(24, 0, 0, 0)
  return d.getTime()
}

/**
 * Non-essential active tasks to auto-hide when entering Rest Mode.
 * Mirrors the chill-snooze criteria: skip done, P1, health/medication,
 * already-snoozed, and anything due within 48h.
 */
export function selectRestHideIds(tasks: RestHideTask[], now: number): string[] {
  return tasks
    .filter(t => {
      if (t.done) return false
      if ((t.priority ?? 3) <= 1) return false
      if (HEALTH.test(t.name ?? '')) return false
      if (t.snoozedUntil && t.snoozedUntil > now) return false
      if (t.deadline) {
        const ms = new Date(t.deadline).getTime() - now
        if (!Number.isNaN(ms) && ms <= FORTY_EIGHT_H) return false
      }
      return true
    })
    .map(t => t.id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- restHide`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/utils/restHide.ts lib/utils/restHide.test.ts
git commit -m "feat(rest): pure helpers selecting non-essential tasks to hide in rest mode"
```

---

### Task 6: Auto-hide on entering Rest Mode

**Files:**
- Modify: `components/app-layout.tsx` (trigger auto-hide)
- Modify: `components/rest-mode-overlay.tsx` (one accurate copy line)

**Interfaces:**
- Consumes: `selectRestHideIds`, `endOfTodayMs` (Task 5), `getTasks`, `updateTask` (from `@/lib/data/tasks`).

- [ ] **Step 1: Add imports to app-layout**

In `components/app-layout.tsx`, add:

```typescript
import { getTasks, updateTask } from "@/lib/data/tasks"
import { selectRestHideIds, endOfTodayMs } from "@/lib/utils/restHide"
import { useRef } from "react"
```

(Adjust the existing `import { useState, useEffect } from "react"` line to also include `useRef`, or add the separate import above — either is fine.)

- [ ] **Step 2: Add the auto-hide effect**

In `AppLayout`, after the existing `useEffect` that sets `showCrisis` on `state === "overwhelmed"`, add:

```typescript
  const restHidden = useRef(false)
  useEffect(() => {
    if (state !== "overwhelmed") { restHidden.current = false; return }
    if (restHidden.current) return
    restHidden.current = true

    // Run at most once per calendar day so manual un-snoozes aren't undone on reload
    const dayKey = `loadlight-resthide-${new Date().toISOString().slice(0, 10)}`
    try { if (localStorage.getItem(dayKey)) return } catch { /* ignore */ }

    ;(async () => {
      try {
        const tasks = await getTasks()
        const now = Date.now()
        const ids = selectRestHideIds(tasks as unknown as { id: string; name: string; priority?: number; deadline?: string | null; done?: boolean; snoozedUntil?: number | null }[], now)
        if (ids.length > 0) {
          const until = endOfTodayMs(now)
          await Promise.allSettled(ids.map(id => updateTask(id, { snoozedUntil: until })))
        }
        try { localStorage.setItem(dayKey, "1") } catch { /* ignore */ }
      } catch { /* silent — auto-hide is best-effort */ }
    })()
  }, [state])
```

- [ ] **Step 3: Make the Rest Mode overlay copy accurate**

In `components/rest-mode-overlay.tsx`, the `canSkip` section header currently reads "These can wait today". Change that line (the `<p>` containing the `CheckCircle` near `triage!.canSkip.length > 0`) text to reflect that hiding already happened:

Find:

```tsx
                    <CheckCircle className="w-3.5 h-3.5" /> These can wait today
```

Replace with:

```tsx
                    <CheckCircle className="w-3.5 h-3.5" /> Hidden for today — these can wait
```

- [ ] **Step 4: Verify lint + build**

Run: `npm run lint`
Expected: no new errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual smoke test**

Run `npm run dev`. In demo mode add several low-priority, no-deadline tasks plus one named "Take vitamins" and one priority-1 task. Click **I'm overwhelmed** in the header. Then go to the **Tasks** page: the low-priority/no-deadline tasks should be gone from the Active list and appear under the **Snoozed (n)** toggle; "Take vitamins" and the P1 task should still be visible. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add components/app-layout.tsx components/rest-mode-overlay.tsx
git commit -m "fix(rest): auto-hide non-essential tasks when entering rest mode"
```

---

### Task 7: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: all tests pass, including the new `balance` and `restHide` suites.

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: both succeed with no new errors.

- [ ] **Step 3: Commit any remaining changes**

```bash
git status
# If anything is uncommitted from the verification, commit it:
git commit -am "chore: balance + rest-hide verification fixes" || true
```

---

## Self-Review Notes

- **Spec coverage:** balance-check analysis logic (Task 2), modal UI + one-click hide/delete/add (Tasks 3-4), every-dashboard-load trigger with overwhelmed + empty-list suppression (Tasks 1, 4), offline `ok` fallback (Task 2), recurring dedup (Task 2). Rest-mode auto-hide decision (Tasks 5-6).
- **"Hide for the week"** = 7-day snooze (Task 4 `handleBalanceHide`), reversible via the existing Snoozed toggle on the Tasks page.
- **Rest-mode hiding** uses a deterministic helper (reliable, unit-tested) rather than fuzzy AI name-matching; the overlay's AI triage remains as advisory display.
- **Known limitation:** pages hold task state independently (no global store), so auto-hidden tasks appear after the next load of the Tasks/Dashboard page, not instantly on the page you triggered rest mode from.
