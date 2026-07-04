# LoadLight — Complete Functionality Reference

Last updated: 2026-07-04. This lists every user-facing and system feature that
exists in the codebase, where it lives, and how it behaves.

---

## 1. Pages

| Route | What it does |
|---|---|
| `/` | Frutiger Aero landing page: feature cards, mode explanation, call to action |
| `/login` | Supabase email auth. Skipped entirely in demo mode (no Supabase env → localStorage) |
| `/onboarding` | Name, work type, balance-mode persona cards (Beast / Average / Chill) |
| `/dashboard` | Stats, balance slider, workload verdict, AI weekly analysis, advisory, balance-check popup |
| `/tasks` | Task list (list / grid / calendar views), filters, edit, AI chat commands |
| `/tasks/new` | Natural-language input → AI extraction → preview/edit → confirm and save |
| `/categories` | Custom categories: create, rename, recolor, reorder (drag), delete with task reassignment |
| `/settings` | Balance mode cards with Chill 30-day lock, data reset, preferences |
| `/admin`, `/admin/incidents` | Ops dashboards: health, AI call logs, incidents |

## 2. Task capture (AI extraction)

- **Natural language → structured tasks** (`/api/ai/extract`, Gemini 2.5 Flash
  with flash-lite retry and a regex-based offline fallback).
- Extracted per task: name, category, life domain, demand type
  (cognitive / emotional / creative / routine / physical), difficulty 1–5,
  priority 1–4, deadline, start date, estimated minutes, notes, recurrence.
- **Splitting**: "laundry and math report" → two tasks; "lamictal 10:30 and
  22:30" → two tasks, one per time.
- **Recurrence vocabulary**: daily, weekly, "every X hours" (recurring_hours),
  "N times per day" (task copies), and "every N days" / "every other day"
  (recurring_days) — e.g. "throw trash every two days".
- **Time anchoring**: times found in the raw input override AI-guessed times
  for recurring tasks (ground truth patching).
- **Clarifying question**: ambiguous habits (gym, run) trigger a one-tap
  question — daily / few times a week / just once.
- **Medication awareness**: pills, supplements, lamictal, lithium always
  extracted as daily; never suggested for removal by any AI feature.
- **Preview and confirm**: nothing saves until the user confirms; every field
  editable in the preview; manual form fallback when AI is down.
- **Safety filter**: harmful input categories return a block response instead
  of tasks; raw user text is never persisted (only structured fields).

## 3. Recurrence engine (`lib/utils/recurrence.ts`)

- Cadences: daily (+1), weekly (+7), every N days (+N), every N hours (chip),
  N times per day (numbered copies).
- **Deadline backfill**: any recurring task saved or loaded without a deadline
  gets today (date-only, no invented clock time) — at insert and at load, so
  legacy dateless tasks self-repair.
- **Roll-forward**: completing a recurring task creates the next instance on
  the correct day grid, preserving the anchor time (22:30 stays 22:30).
- **Display advance** (`effectiveDeadline`): past recurring deadlines render
  as the next future occurrence on the task's grid; weekday preserved for
  weekly tasks.
- Recurring instances are deduplicated (name+category) in all metrics, AI
  payloads, and the active list (only the earliest undone instance shows).

## 4. Task management (`/tasks`)

- Views: list (grouped by date), grid, calendar; filters by status and category.
- Toggle done (with recurrence roll-forward), delete, full edit modal
  (name, category, dates, priority, difficulty, minutes, notes, recurrence,
  snooze).
- **AI breakdown**: one tap splits a big task into subtasks (`mode: breakdown`).
- **Day scheduler** (`mode: schedule` + local packing): plans the day around
  fixed-time ("pinned") tasks, assigns start/end slots, moves overflow to
  tomorrow 09:00, preview then apply. Recurring tasks with fixed anchor times
  keep their deadlines (only the start slot is recorded).
- **Past-deadline modal**: overdue task on save/complete → AI proposes a new
  time (tomorrow/next week for recurring), user can ask follow-ups or set a
  custom time; local fallback works offline.
- **Chat commands** on the tasks page: extract, analyze, triage, schedule,
  chill-snooze (AI picks tasks safe to snooze in chill mode).
- Badges: demand type, difficulty dots, recurrence chip ("daily", "weekly",
  "Every 2 days", "Every 8h"), snoozed, priority, due-soon, start marker
  (stale past-day start markers are hidden).

## 5. Workload state machine (`lib/utils/stateMachine.ts`, overwhelmedStore)

Five signals, each 0–1, weighted composite:
task accumulation (0.25), demand concentration (0.20), completion velocity
(0.25), temporal pressure (0.15), self-report (0.15).
States: **normal → elevated (≥0.45) → overwhelmed (≥0.70)** on a 3-day rolling
average; recalculated on every task create/complete/delete; snapshots stored.

- **Overwhelmed button**: always visible, one tap → immediate overwhelmed
  state, no confirmation, logged as an event. Red never desaturates.
- **Rest mode overlay**: warning banner, recovery activity cards (break, read,
  music, walk), non-compulsory tasks hidden, worth-keeping list, exit requires
  explicit confirmation plus score below threshold.
- **Crisis redirect**: static component (988 Suicide & Crisis Lifeline, Crisis
  Text Line 741741). Zero AI, zero API calls.
- **Repeated-press escalation**: 8+ overwhelmed presses shows a professional
  help suggestion message.

## 6. Balance modes

- **Beast (70/30), Average (50/50), Chill Guy (30/70)** — persona cards at
  onboarding and settings, plus a dashboard slider that snaps to 30/50/70.
- **Chill lock**: selecting Chill sets a 30-day lock; countdown shown;
  override requires typing "I want to switch".
- All AI advice adapts to the active mode (tough-day thresholds, tone,
  work/leisure targets).

## 7. Balance check & advice (the "too much / too little" system)

- **`mode: balance-check`** (`/api/chat`): weighs (1) activity content —
  over-concentration such as three similar sports, (2) time load vs a
  per-mode heavy-day threshold, (3) heavy-day streaks.
  - Verdict `too_much` → popup lists up to 3 tasks to drop (heaviest,
    lowest-priority; never health/medication) with Hide-for-week / Delete.
  - Verdict `too_little` → popup suggests 2–3 activities to add (one-tap add).
    A small but calm list is deliberately judged "ok", not "too little".
  - Suppressed in rest mode / overwhelmed state and with an empty list.
- **Local fallback** (`lib/utils/toughDays.ts`): heavy-day detection and
  popup even when AI is down.
- **Weekly analysis** (`mode: weekly`): verdict overloaded/balanced/light,
  trend, advice, actionable suggestion; shown on the dashboard with progress
  bars.
- **Real-time advisory** (`/api/ai/advise`): 1–2 sentence workload
  observation, tone adapted to state, hard ethical prompt (no clinical
  language, no emotion commentary, "consider/you might" phrasing, AI
  disclosure flag).
- **Global popup** (`components/balance-check-provider.tsx`): mounted in the
  root layout, so alerts appear on any app page (dashboard, tasks, categories,
  settings) — on app open and ~20s after the last task add/edit/delete.
  Anti-nag: a dismissed alert never re-shows for the same verdict and task
  situation; unchanged situations skip the AI call entirely.
- **Missing life-area detection** (`lib/utils/balanceTrigger.ts`): checks
  coverage of physical activity, work/study, social time, and leisure. With
  2+ areas missing and a light day, the popup names what is missing and
  suggests one activity per gap — with a deterministic local fallback when
  the AI is down.

## 8. Dashboard

- Stat cards with 4-week sparkline history (custom SVG, localStorage-backed)
  and delta labels.
- Balance card: work% vs target, overshoot warning, slider.
- Workload verdict banner + composite score.
- Weekly AI analysis + advisory panel with "AI workload analysis · task data
  only · not medical advice" disclosure.
- Balance-check popup on load (once per session).
- Due-soon list (48h window), pending task list, completion progress.

## 9. Data layer (`lib/data/tasks.ts`)

- **Dual mode**: no Supabase env → full demo on localStorage; with Supabase →
  PostgreSQL with RLS (`user_id = auth.uid()` on every table), auth, profile
  upsert.
- Tables: profiles, tasks, state_snapshots, overwhelm_events, ai_logs
  (metadata only — model, tokens, latency; never prompt/response text).
- Naive-UTC datetime convention throughout; camelCase/snake_case field
  aliasing normalized at page load.
- Existing Supabase databases need: `alter table tasks add column recurring_days integer;`

## 10. Design system (Frutiger Aero / Vista)

- Glass panels, glow buttons, gradient text, aero backgrounds, Vista-style
  dialogs and title bars, classic icons, per-category border colors,
  category color theming, animations (fade/scale), skeuomorphic insets.
- Danger red (#ef4444) constant across all states.

## 11. Quality & safety

- 133 unit tests (vitest): recurrence, effectiveDeadline, balance helpers,
  tough days, state machine, task utils.
- `npm run build` clean, TypeScript strict.
- Safety rules enforced: static crisis component, server-side AI keys only,
  hardcoded system prompts, no raw input persistence, overwhelmed button
  unconditional, no clinical language in UI or AI output.
