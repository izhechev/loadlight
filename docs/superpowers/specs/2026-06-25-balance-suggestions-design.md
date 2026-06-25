# Balance Suggestions — "Too much / too little" popup

**Date:** 2026-06-25
**Status:** Approved (design)

## Problem

LoadLight has a volume-based "Workload Analysis" panel (overloaded/balanced/light)
and Chill-mode snooze suggestions. Neither reads *what kinds* of activities the user
has. The user wants an AI check that analyses **amount + task content** and pops up
when the activity mix is off:

- **Too much** — over-concentration in one kind of activity (e.g. "going to three
  sports"). Suggest specific tasks to drop.
- **Too little** — genuinely few / narrow activities. Suggest specific activities to
  add. (Note: a small calm list like "only reading and drawing" is *fine* — return
  `ok`, do not nag.)

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Form factor | Classic Vista **modal popup** on the dashboard |
| Cadence | **Every dashboard load** while an imbalance exists |
| Actionability | **One-click act** from inside the popup |
| "Remove" semantics | Default action is **Hide for the week** (snooze, reversible); a secondary **Delete** link per task for permanent removal |

## Architecture

Approach A: a new `mode: 'balance-check'` in the existing `app/api/chat/route.ts`
plus a new client component `components/balance-popup.tsx` rendered from
`app/dashboard/page.tsx`. Reuses the existing Gemini wiring, the hard-coded
`ETHICAL_SYSTEM_PROMPT`, and the offline mock-fallback pattern shared by every other
chat mode. No new API route.

### 1. Analysis logic (`balance-check` mode)

**Input:** active (undone, recurring-deduped) tasks — `id`, `name`, `category`,
`demand_type`, `estimated_minutes`. Plus `state` and `balanceMode` for context.

**Output JSON:**

```json
{
  "verdict": "too_much" | "ok" | "too_little",
  "headline": "string (<=8 words)",
  "reason": "string (1 observational sentence)",
  "remove": [{ "id": "string", "name": "string", "reason": "string <=8 words" }],
  "add":    [{ "name": "string", "category": "string", "reason": "string <=8 words" }]
}
```

`remove` is populated only for `too_much`; `add` only for `too_little`.

**Rules** (extend, never weaken, the existing `ETHICAL_SYSTEM_PROMPT` — RQ6):

- Tone: "you might consider", "one option is". Never "you should"/"you must". No
  clinical or emotional language.
- `too_much` = content over-concentration (3+ similar high-effort commitments such
  as sports), **not** raw volume. Never suggest removing health/medication tasks
  (reuse the existing health regex guard from `chill-snooze`).
- `too_little` = genuinely few/narrow activities; suggest 2–3 realistic additions
  mapped to existing categories. A small-but-fine list returns `ok`.
- Suppressed entirely when `state === "overwhelmed"` (route returns `verdict: "ok"`).

### 2. Modal UI (`components/balance-popup.tsx`)

Client component matching the existing Vista dialogs (`skeu-card`, `anim-scale-in`,
`vista-btn-secondary`, Tahoma, `ClassicIcon` — no emoji, per the 2008 aesthetic).

- **Too much:** headline + reason, then each candidate task with a primary
  **Hide for the week** button (calls the dashboard's existing `handleSnooze`) and a
  smaller secondary **Delete** link (calls `deleteTask`).
- **Too little:** headline + reason, then 2–3 suggested activities each with an
  **Add** button (calls `addTask`, mapping `{name, category}` → `Task` with sensible
  defaults: `demand_type: 'routine'`, `difficulty: 2`, `priority: 3`,
  `status: 'active'`). Added rows show a check and disable.
- **Footer:** AI-disclosure line ("AI suggestions · you stay in control") + **Close**.
- Acting updates the open modal in place; the modal does not re-pop the same load.

### 3. Integration (`app/dashboard/page.tsx`)

- After tasks load, fire one `balance-check` call guarded by a `useRef` once-flag
  (same pattern as the existing advisory auto-fetch). Show the modal when
  `verdict !== "ok"`.
- No call when `state === "overwhelmed"` or when there are 0 active tasks.
- Reuse the existing recurring-task dedup so "three sports" counts once.
- Offline / no API key: mock fallback returns `verdict: "ok"` → no popup; the
  dashboard is never blocked.

## Testing

- Unit-test the mock-fallback output shape and the suppression guards (overwhelmed,
  empty list) in the chat-route logic.
- AI judgment itself is not unit-tested (non-deterministic), consistent with the
  other chat modes.

## Addendum (2026-06-25): load-by-time + "tough days"

The balance check also factors **workload weight**, not just activity content:

- **Per quantity + difficulty (time-based):** a day's load = the total estimated
  minutes of that day's active tasks. This combines how *many* tasks there are with
  how *heavy* each is (longer task = harder), using estimated time as the difficulty
  proxy. The `balance-check` prompt weighs this total load alongside content.
- **Tough days:** a "tough day" is one whose load meets/exceeds a threshold that
  scales with balance mode — Chill 120 min, Average 240 min, Beast 360 min. Daily
  load is read from the existing `loadlight-sparkline-history` (per-day `minutes`).
- **Trigger:** advice fires on **every** tough day (including the first), with no
  escalation tier. The popup message notes the streak when it is 2+ days
  (e.g. "2 heavy days in a row").
- **Placement:** the tough-day advice appears in the same dashboard **Balance Check
  popup**. When a tough day is detected, the popup shows (even if the AI's content
  verdict is `ok`) with a "too much" message and up to 3 suggested tasks to drop —
  the heaviest, lowest-priority, non-health tasks. This deterministic path
  (`buildToughDayResult`) also serves as the offline fallback.

## Out of scope

- Personalised activity recommendations from history.
- Changing the existing Workload Analysis or Chill suggestions.
- Server-side persistence of dismissals (cadence is per dashboard load by design).
