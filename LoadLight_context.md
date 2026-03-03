## Problem

Task apps (Todoist, TickTick, Notion) track what needs doing. None detect when users are overwhelmed, adjust behaviour based on mental state, or nudge toward rest. LoadLight fills that gap.

## Core Mechanisms (depth over breadth)

### 1. Overwhelmed Detection & Response

State machine tracking: active task count, overdue tasks, difficulty ratings, completion rate, explicit user input (overwhelmed button). States: normal → elevated → overwhelmed. Thresholds from user research. Rest mode limits new input, shows recovery suggestions. At overwhelmed: redirect to professional resources with message "this app tracks tasks, not mental health."

### 2. AI Advisory Engine

Pipeline: extraction (parse task from natural language) → classification (type, difficulty, duration) → advice (personalised workload recommendations). Each stage has error handling. If AI fails → fallback to structured input with manual classification.

### 3. Balance Tracking & Mode Enforcement

Three modes: Beast Worker (70/30 work/leisure), Average Worker (50/50), Chill Guy (30/70). Dashboard visualises balance vs target. AI advice adjusts per mode. Chill Guy has 30-day time lock preventing impulsive switching.

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion
- **Backend:** Supabase (PostgreSQL, auth, real-time, RLS), Drizzle ORM, Next.js API routes
- **AI:** Vercel AI SDK (OpenAI or alternative per RQ1)
- **State:** Zustand (client), TanStack Query (server)
- **Deploy:** Vercel free tier

## Functional Requirements

### Must-haves

|ID|Requirement|Mechanism|
|---|---|---|
|FR-1|Natural language task input: type sentence, AI extracts details|CM2|
|FR-2|AI shows extracted details for confirmation before save|CM2|
|FR-3|Weekly AI-generated workload summary with trends|CM2, CM3|
|FR-4|Overwhelmed button: triggers rest mode + redirect to resources|CM1|
|FR-5|Dashboard: tasks, deadlines, workload balance visual|CM3|
|FR-6|Three balance goal modes|CM3|
|FR-7|Chill Guy 30-day time lock|CM3|
|FR-8|Deadlines per task|Supporting|
|FR-9|Reminders per task|Supporting|
|FR-10|AI suggests workload reduction when balance exceeds target|CM2, CM3|
|FR-11|Rest mode: limits new input, recovery suggestions|CM1|
|FR-12|Onboarding: name, work type, balance mode selection|Supporting|

### Should-haves (if time permits)

FR-13 pattern detection, FR-14 task classification (work/study/personal/creative/admin), FR-15 AI reorder by priority, FR-16 voice commands, FR-17 time blocking, FR-18 duration estimates, FR-19 category advice, FR-20 mood survey, FR-21 leisure prompts, FR-22 rest activity suggestions, FR-23 weekly verdict, FR-24 energy slider, FR-25 mood selector, FR-26 difficulty tags, FR-27 low-mood task suggestions, FR-28 gradual rest mode exit.

### Could-haves (not planned)

FR-29 export CSV/JSON, FR-30 Pomodoro, FR-31 streaks.

## Non-Functional Requirements

|ID|Requirement|Test|Priority|
|---|---|---|---|
|NFR-1|Free, no ads|No ads visible|Must|
|NFR-2|Frutiger Aero: glossy, translucent, nature gradients|Design review|Must|
|NFR-3|Responsive 375px + 1440px|Both widths render|Must|
|NFR-4|Supabase Auth, encrypted at rest|Auth works, encryption confirmed|Must|
|NFR-5|Page load < 3s|Lighthouse|Should|
|NFR-6|AI response < 5s|Dev tools timing|Should|
|NFR-7|Row Level Security all tables|Cross-user query = empty|Must|
|NFR-8|App works when AI is down|Kill API key, verify|Must|
|NFR-9|AI keys server-side only|Network tab audit|Must|
|NFR-10|Input sanitised before prompts, output before DOM|Injection test|Should|
|NFR-11|AI summaries cached per user per day|Cache hit in logs|Should|
|NFR-12|Automated tests: state machine, balance, overwhelmed, RLS|Tests pass|Should|
|NFR-13|TypeScript strict, ESLint, no `any`|Build strict, lint zero errors|Should|
|NFR-14|Structured AI logging, no personal content|Log reviewed|Could|

## Design System

### Frutiger Aero

Glossy surfaces, translucent panels (backdrop-blur), nature-inspired gradients (aqua, teal, green), skeuomorphic depth, glassmorphism cards. Demonstrated in Spotivote: frosted glass panels, gradient buttons, glowing progress bars.

### Design Rules (from teachers)

1. **Form follows function.** UX pyramid: functionality → usability → aesthetics. Build functional UI first, visual polish last.
2. **Frutiger Aero is a research question, not an assumption.** RQ7 tests whether this style suits mental health context. If not, adapt.
3. **Rapid iteration.** Duplicate and adjust. 20 variations in 90 minutes > 1 polished version in 3 hours. Document iteration trail with screenshots.
4. **Design systems as foundation.** Material Design + Apple HIG for structural rules. Behance for visual references. shadcn/ui for code primitives.
5. **Tailwind CSS directly is valid.** No Figma required if iteration trail documented in logbook.
6. **Creative coding positioning.** Intersection of software skill + design development. Learning design through code.

### Component Approach

- shadcn/ui base components with Frutiger Aero layer on top
- Framer Motion for animations
- Tailwind utilities for glassmorphism: `backdrop-blur-md bg-white/10 border border-white/20`
- Nature gradients: `bg-gradient-to-br from-cyan-400 via-teal-500 to-emerald-600`

## Teacher Remarks

### Software Teacher

- **Depth over breadth.** Level 3 = in-depth reasoning, not broad surface coverage. Fewer features investigated deeply > polished app without validated logic.
- **Research first.** Sequence: research → user stories → build → test. Never reverse.
- **Expert validation.** Coach checks process (attendance, communication, deadlines). Experts validate depth: Kuhn Krumbach (AI), Patrick Aytema / Eric Schriek (software/data), design teacher (UI).
- **Core mechanisms carry the evidence.** Supporting features fill remaining time. If core overruns, features shrink, not quality.

### Design Teacher

- Background: design and creativity.
- Offered to support user interaction / U.2 competence work.
- All 6 design rules above come from this teacher.

### Coach

- 140 hours is tight for 31 requirements.
- Actual complexity depends on what AI API can handle.
- Adjusted intended competence profile: Software L3, User Interaction L2, not Hardware this semester.

## Research Questions

|ID|Question|Method|
|---|---|---|
|RQ1|Which AI API fits best (cost, capability, latency)?|Library research, prototype|
|RQ2|What task categories capture workload diversity?|Literature, interviews|
|RQ3|What signals indicate overwhelm?|Interviews, literature|
|RQ4|Which frontend arch supports real-time AI + state?|Library research|
|RQ5|Frutiger Aero → accessible web components?|Design research, prototyping|
|RQ6|Ethical boundaries for mood-aware AI advice?|Literature, expert consult|
|RQ7|Does nostalgic design improve mental health UX?|Design research, user feedback|

## User Research Plan

3–5 interviews, ~30 min each. Four areas:

1. **Current task management.** Tools used, what works/doesn't.
2. **Overload experience.** Signals, actions taken or not.
3. **Tool intervention.** Would they trust app advice? What would they dismiss?
4. **Balance and recovery.** Active balance thinking, self-imposed limits.

Findings feed into: overwhelmed thresholds (CM1), AI tone (CM2), mode definitions (CM3).

## Existing Solutions

|App|Does|Lacks|
|---|---|---|
|Todoist|Task management, NL input, AI labelling|No workload monitoring, no mental health|
|Sunsama|Daily planning, timeboxing, calendar sync|No AI, no overwhelm detection|
|Headspace|Mindfulness, meditation|No task management|
|Lunatask|Tasks + mood tracking + energy|Manual only, no AI, shallow|

## Ethics

- App is NOT a therapist. Overwhelmed redirect (FR-4) draws boundary explicitly.
- Task/mood data is personal. Supabase encryption + RLS. AI calls server-side.
- AI tone: supportive, not prescriptive. "Consider a break" yes, "Stop working now" no.
- Logging excludes personal content (NFR-14).

## Sprint Plan (140 hours)

|Sprint|Focus|Hours|
|---|---|---|
|1|Research, interviews, prototype|30|
|2|Core architecture + CM1 (overwhelmed state machine)|32|
|3|CM2 (AI pipeline) + CM3 (balance tracking) + key features|30|
|4|Remaining features, Frutiger Aero visual iteration, usability testing|28|
|5|Testing, documentation, delivery|20|

**Scope gate (Sprint 3):** If core mechanisms overrun → features shrink, not quality.

---

## Research Findings Summary (RQ1–RQ7)

All seven research questions are answered. Documents at `/mnt/user-data/outputs/`. Below is the condensed knowledge from each, ready for implementation.

### RQ1: AI API Selection

**Recommendation:** GPT-4o mini (primary), Gemini 2.0 Flash (fallback).

- GPT-4o mini: $0.15/$0.60 per million tokens input/output. Best structured output via Vercel AI SDK `generateObject` with Zod schema validation. Lowest latency for task extraction.
- Gemini 2.0 Flash: free tier (15 RPM, 1M TPM). Comparable structured output quality. Higher latency. Use as fallback when GPT-4o mini quota exceeded or API down.
- Vercel AI SDK provider abstraction means switching requires changing one model parameter, not rewriting code.
- Claude excluded (cost prohibitive for student project). GPT-4o excluded (4x cost of mini, marginal quality gain for task extraction).

### RQ2: Task Categories

**Two-layer classification model:**

1. **Life Domain** (where the task belongs): Work, Study, Personal, Creative, Administrative
2. **Demand Type** (what cognitive resource it requires): Cognitive, Emotional, Creative, Routine

- AI infers both layers from natural language input. User confirms before save (FR-2).
- Demand Type feeds overwhelmed detection (RQ3): concentration of one demand type signals imbalance.
- Categories are not mutually exclusive — a task can be "Study + Cognitive" or "Personal + Emotional".

### RQ3: Overwhelmed Detection

**Three-state model:** Normal → Elevated → Overwhelmed

**Five weighted signals:**

|Signal|Weight|What it measures|
|---|---|---|
|Task accumulation|0.25|Active undone tasks relative to user's rolling average|
|Demand concentration|0.20|How much one demand type dominates (from RQ2)|
|Completion velocity|0.25|Tasks completed per day vs. tasks added per day|
|Temporal pressure|0.15|Proportion of tasks due within 48 hours|
|Explicit self-report|0.15|Overwhelmed button press or mood/energy input|

**Composite score thresholds:**

- < 0.45 → Normal
- 0.45–0.70 → Elevated (warnings, softer AI tone, reduced visual intensity)
- > 0.70 → Overwhelmed (rest mode, redirect to professional resources)

**Implementation:** Zustand store holds current state + signal values. Transition functions compute composite score. Time-averaged over 3-day rolling window to prevent single-task spikes from triggering state changes. Overwhelmed button is an immediate override (bypasses composite calculation).

### RQ4: Frontend Architecture

**Recommended stack:**

- **Framework:** Next.js 14 (App Router) — native Vercel AI SDK integration, React Server Components, serverless API routes
- **Components:** shadcn/ui — Radix UI accessibility + Tailwind CSS zero-runtime styling + full source ownership for Frutiger Aero customisation
- **Client state:** Zustand (~3KB) — overwhelmed state machine, user preferences, UI state
- **Server state:** TanStack Query — task data from Supabase, caching, optimistic updates
- **AI:** Vercel AI SDK — `generateObject` (server), `useObject` (client streaming), Zod validation
- **Deploy:** Vercel free tier — auto-deploy, serverless functions, preview URLs

**Key architectural decisions:**

- Zustand store holds state machine; TanStack Query holds task data. Never mix.
- AI calls go through Next.js API routes (server-side). API keys never reach client (NFR-9).
- shadcn/ui components are copied into project source, not imported from npm. Full modification freedom.
- Framer Motion for animations, conditional on state (reduced in Elevated, removed in Overwhelmed).

### RQ5: Frutiger Aero → Accessible Web Components

**Six adaptation rules:**

1. **Minimum opacity:** 0.25 (light mode), 0.35 (dark mode) for translucent panels. Ensures text contrast meets WCAG AA.
2. **Controlled gradients:** Maximum 3 colour stops per gradient. Direction consistent within component groups.
3. **Glossy highlights:** Implemented via `box-shadow` with white/10-20% overlay, not image-based reflections.
4. **Rounded forms:** `border-radius` of 12-16px for cards, 8px for buttons, full-round for avatars.
5. **Motion:** All animation opt-in via `useReducedMotion` hook. Decorative animations (glow pulse, gradient shift) disabled when `prefers-reduced-motion: reduce`. Essential feedback animations (state transitions) shortened to <200ms.
6. **Selective glassmorphism:** 2-3 glassmorphism elements per viewport maximum. Primary panels only, not every card.

**Implementation:** shadcn/ui components modified at Tailwind class level. Radix UI accessibility layer (WAI-ARIA, keyboard nav, focus management) stays untouched. Only visual classes change.

### RQ6: Ethical Boundaries for Mood-Aware AI

**Five prompt constraints (hardcoded in server-side system prompt):**

1. **Tone:** Supportive, never prescriptive. "Consider," "you might," "one option is" — never "you should," "you must." No clinical language ("anxiety," "depression," "burnout diagnosis").
2. **Scope:** Workload commentary only. Task volume, deadline distribution, demand balance, completion patterns. Never interprets emotions or psychological state.
3. **Authority:** Tool framing, not expert. "Your cognitive tasks are concentrated on Monday" — not "You are overloading yourself."
4. **Escalation:** Redirect, never treat. At Overwhelmed state → static message with 988 Lifeline + Crisis Text Line 741741. No coping strategies, no breathing exercises, no emotional support from AI.
5. **Transparency:** AI disclosure on every advisory. Onboarding explains AI is for task extraction and workload assessment, not mental health support.

**Three architectural safeguards:**

1. **Hardcoded overwhelmed redirect (FR-4):** Application code, not AI-generated. Static crisis resource links. Fires on state machine threshold OR overwhelmed button. AI cannot suppress or modify.
2. **No personal content logging (NFR-14):** Extracted fields (name, deadline, category, demand type) stored. Raw NL input and AI response not persisted. Server logs = metadata only (timestamp, model, tokens, latency).
3. **Immutable system prompt:** Hardcoded in API route. Not user-configurable. Structured extraction (`generateObject` + Zod) limits attack surface vs open-ended conversation.

### RQ7: Nostalgic Design and Mental Health UX

**Answer:** Conditionally yes. Frutiger Aero is appropriate for LoadLight, but visual intensity must adapt to user state.

**Evidence base:**

- **Nostalgia psychology:** Nostalgia increases wellbeing through authenticity, social connectedness, and mood regulation. Frutiger Aero triggers nostalgia for Gen Z (30M+ TikTok views), providing baseline comfort.
- **Colour psychology:** Blue-green-teal palette reduces cortisol, lowers heart rate, promotes parasympathetic activation. Aligned with what mental health apps already use.
- **Skeuomorphic depth:** Provides stronger visual affordances than flat design. Lower cognitive load for stressed/unfamiliar users. But excessive detail = clutter.
- **Mental health app warning:** Bright, cheerful interfaces conflict with low mood. Users prefer subtle, sophisticated palettes. Overly vibrant design causes discomfort in depressed users.

**State-adaptive design strategy:**

|State|Visual intensity|Key changes|
|---|---|---|
|Normal|Full Frutiger Aero|Nature gradients, glassmorphism, glossy highlights, animations. 60-70% of original saturation.|
|Elevated|Reduced|Desaturated gradients, fewer glass elements, simplified animations, less contrast. 40-50% saturation.|
|Overwhelmed|Minimal|Near-monochrome blue-grey, single translucent panel, no animations, max whitespace. 20-30% saturation.|

- Dark mode auto-activates on Elevated/Overwhelmed (user override available).
- Animation scaling via Framer Motion conditional props + Zustand state.
- Sprint 4 rapid iteration: 20 variations documented with logbook screenshots.

---

## Git Workflow

- **Repository:** GitLab
- **Branching:** `main` (stable, auto-deploys to Vercel) + `feature/[short-description]` branches
- **Branch naming examples:** `feature/state-machine`, `feature/ai-pipeline`, `feature/frutiger-theme`
- **Merge:** Feature branch → main via merge request with self-review
- **Commit format:** Conventional commits — `feat:`, `fix:`, `docs:`, `refactor:`
- **Deploys:** Vercel auto-deploys from main. Preview URL per merge request.

## Test Strategy

### What to test

- **State machine (CM1):** Unit tests for all state transitions, signal weight calculations, composite score computation, 3-day rolling window averaging, overwhelmed button immediate override (bypasses composite). Edge cases: single-task spikes should NOT trigger state change, simultaneous signals at boundary thresholds.
- **Balance tracking (CM3):** Mode enforcement (correct work/leisure ratios), Chill Guy 30-day time lock (cannot switch before lock expires, lock starts on selection), mode-specific AI advice routing.
- **RLS policies:** Cross-user query returns empty result set. Each user sees only their own data.
- **AI fallback (NFR-8):** Kill API key → app still functions for task management (manual input works).

### When to test

|NFR|Sprint|How|
|---|---|---|
|NFR-4 (Auth + encryption)|Sprint 2|Auth flow test, Supabase encryption confirmation|
|NFR-7 (RLS)|Sprint 2|Cross-user query test|
|NFR-8 (AI fallback)|Sprint 2|Kill API key, verify manual input|
|NFR-9 (API keys server-side)|Sprint 2|Network tab audit|
|NFR-10 (Input sanitisation)|Sprint 3|Injection test strings|
|NFR-6 (AI response < 5s)|Sprint 3|Dev tools timing|
|NFR-12 (Automated tests)|Sprint 3|All tests pass|
|NFR-13 (TypeScript strict)|Sprint 2+|Build with strict flag, lint zero errors|
|NFR-2 (Frutiger Aero)|Sprint 4|Design review|
|NFR-3 (Responsive)|Sprint 4|375px + 1440px render test|
|NFR-5 (Page load < 3s)|Sprint 5|Lighthouse audit|
|NFR-11 (AI cache)|Sprint 3|Cache hit in logs on repeat request|

### Usability self-testing (Sprint 4)

Walk through the application in all three states (Normal, Elevated, Overwhelmed). Verify:

- State-adaptive design feels appropriate per state
- Overwhelmed redirect fires correctly
- Rest mode limits input as expected
- Visual intensity changes are noticeable but not jarring

## Sprint Implementation Targets

|Sprint|Build|Scope rule|
|---|---|---|
|Sprint 1 (30h)|Research only. All 7 RQs answered. AI extraction prototype.|**COMPLETED**|
|Sprint 2 (32h)|Supabase schema + RLS + auth. Zustand state machine. Functional UI scaffold (no visual polish). Next.js API routes skeleton.|Security NFRs verified immediately.|
|Sprint 3 (30h)|AI pipeline (generateObject + Zod). Balance tracking dashboard. Key must-have features. System prompt with ethical constraints.|**SCOPE GATE:** If core mechanisms not functional → Sprint 4 finishes them instead of adding features.|
|Sprint 4 (28h)|Remaining features (from Should-haves if time). Frutiger Aero visual iteration (20 variations). Usability self-testing.|Features shrink, not quality.|
|Sprint 5 (20h)|NFR verification. Documentation. Competence document. Portfolio.|Delivery sprint, no new features.|

## Database Schema

### profiles

|Column|Type|Constraints|
|---|---|---|
|id|uuid|PK, FK → auth.users(id)|
|display_name|text|NOT NULL|
|work_type|text|NOT NULL|
|balance_mode|enum(beast_worker, average_worker, chill_guy)|NOT NULL, default: average_worker|
|mode_locked_until|timestamptz|nullable. Chill Guy 30-day lock expiry (FR-7). NULL if no lock.|
|onboarding_complete|boolean|NOT NULL, default: false|
|created_at|timestamptz|NOT NULL, default: now()|
|updated_at|timestamptz|NOT NULL, default: now(), trigger-updated|

### tasks

|Column|Type|Constraints|
|---|---|---|
|id|uuid|PK, default: gen_random_uuid()|
|user_id|uuid|FK → auth.users(id), NOT NULL|
|name|text|NOT NULL|
|life_domain|enum(work, study, personal, creative, administrative)|NOT NULL (RQ2 layer 1)|
|demand_type|enum(cognitive, emotional, creative, routine)|NOT NULL (RQ2 layer 2)|
|difficulty|integer|NOT NULL, check: 1–5|
|deadline|timestamptz|nullable (FR-8)|
|reminder_at|timestamptz|nullable (FR-9)|
|estimated_minutes|integer|nullable|
|status|enum(active, completed, archived)|NOT NULL, default: active|
|completed_at|timestamptz|nullable|
|created_at|timestamptz|NOT NULL, default: now()|
|updated_at|timestamptz|NOT NULL, default: now()|

### state_snapshots

|Column|Type|Purpose|
|---|---|---|
|id|uuid PK|Unique snapshot|
|user_id|uuid FK → auth.users(id)|Owner|
|composite_score|float (0.0–1.0)|Weighted sum of all five signals|
|state|enum(normal, elevated, overwhelmed)|State at time of recording|
|task_accumulation|float (0.0–1.0)|Signal 1 (weight 0.25)|
|demand_concentration|float (0.0–1.0)|Signal 2 (weight 0.20)|
|completion_velocity|float (0.0–1.0)|Signal 3 (weight 0.25)|
|temporal_pressure|float (0.0–1.0)|Signal 4 (weight 0.15)|
|self_report|float (0.0–1.0)|Signal 5 (weight 0.15)|
|recorded_at|timestamptz|Used for rolling window|

### overwhelm_events

|Column|Type|
|---|---|
|id|uuid PK|
|user_id|uuid FK → auth.users(id)|
|trigger|enum(composite_threshold, button_press, manual_exit)|
|previous_state|enum(normal, elevated, overwhelmed)|
|new_state|enum(normal, elevated, overwhelmed)|
|created_at|timestamptz|

### ai_logs (metadata only, no personal content — NFR-14)

|Column|Type|
|---|---|
|id|uuid PK|
|user_id|uuid FK → auth.users(id)|
|call_type|enum(extraction, advisory)|
|model|text (gpt-4o-mini or gemini-2.0-flash)|
|tokens_in|integer|
|tokens_out|integer|
|latency_ms|integer|
|created_at|timestamptz|

### RLS Policies

All tables: `user_id = auth.uid()` (or `id = auth.uid()` for profiles). SELECT, INSERT, UPDATE, DELETE all gated. No cross-user access.

## State Machine Transition Rules

|From|To|Condition|
|---|---|---|
|Normal|Elevated|3-day avg composite ≥ 0.45|
|Elevated|Overwhelmed|3-day avg composite ≥ 0.70|
|Normal/Elevated|Overwhelmed|Button override (immediate, bypasses composite)|
|Overwhelmed|Elevated|composite < 0.70 AND user exits rest mode (both required)|
|Overwhelmed|Normal|composite < 0.45 AND user exits rest mode (both required)|
|Elevated|Normal|composite < 0.45 (automatic)|

**Recalculation triggers:** task created, task completed, task deleted, overwhelmed button pressed, page load (hydrates from latest snapshots).

**Critical:** Exiting Overwhelmed requires BOTH score drop AND explicit user action (exit rest mode button with confirmation dialog). System cannot silently leave rest mode.

## AI Extraction Zod Schema

The `generateObject()` call returns exactly these fields:

|Field|Type|Extraction rule|
|---|---|---|
|name|string|Core task action, stripped of temporal/emotional qualifiers|
|life_domain|enum|Inferred: work/study/personal/creative/administrative|
|demand_type|enum|Inferred: cognitive/emotional/creative/routine|
|difficulty|integer 1–5|From language cues ("a lot of thinking" → 4–5)|
|deadline|ISO date or null|"by Friday" → next Friday. Null if no temporal reference.|
|estimated_minutes|integer or null|Duration if inferable, null otherwise|

## AI Advisory Tone Per State

|State|Tone|Example|
|---|---|---|
|Normal|Informational, neutral|"You have three cognitive tasks for tomorrow. Spreading them across the week could balance your workload."|
|Elevated|Gentler, cautious. Suggest reduction.|"Your overdue count has increased. Completing one smaller task first might reduce the backlog."|
|Overwhelmed|Minimal. Acknowledge rest mode only.|"Rest mode is active. Your tasks will be here when you're ready."|

## Routes and Pages

|Route|Page|FR coverage|Key components|
|---|---|---|---|
|/login|Login|—|Supabase Auth UI|
|/onboarding|Onboarding|FR-12|Name input, work type selector, balance mode picker|
|/dashboard|Dashboard|FR-5, FR-10|BalanceVisualization, AIAdvisoryPanel, task summary|
|/tasks/new|Add Task|FR-1, FR-2|NL input, AI extraction display, confirmation form, manual fallback|
|/tasks|Task List|FR-8, FR-9|TaskCard list, filters, deadline badges, reminder indicators|
|/settings|Settings|FR-6, FR-7|Mode selector with time lock display|

## Shared Components

|Component|Where|Behaviour|
|---|---|---|
|AppLayout|Wraps all authenticated pages|Sidebar nav, header with state indicator, state-adaptive theme. Renders OverwhelmButton, conditionally renders RestModeOverlay.|
|OverwhelmButton|Fixed position in AppLayout|Always visible. Single press → immediate Overwhelmed. Visual prominence increases in Elevated.|
|RestModeOverlay|Rendered by AppLayout when state=Overwhelmed|Full-screen overlay. Limits new task input. Recovery suggestions. Exit button with confirmation dialog.|
|CrisisRedirect|Inside RestModeOverlay|Static hardcoded component. 988 Lifeline + Crisis Text Line 741741. NOT AI-generated. Fires on extreme score or repeated button press.|
|AIAdvisoryPanel|Dashboard|Displays advisory text from /api/ai/advise. Tone adjusts per state. Not persisted.|
|BalanceVisualization|Dashboard|Current work/leisure ratio vs target mode visual.|
|TaskCard|Task list + dashboard|Task name, domain badge, demand type, difficulty, deadline. Colour-coded by domain.|

## User Flow: Adding a Task

1. User navigates to /tasks/new. Single text input with placeholder.
2. User types sentence, submits.
3. Input sent to `/api/ai/extract` (server-side). AI returns structured fields via Zod schema.
4. Extracted fields shown in editable confirmation form (FR-2): name, domain, demand type, difficulty, deadline, duration.
5. User confirms or edits, saves.
6. Task inserted into `tasks` table (Supabase).
7. State machine recalculates: new snapshot created, composite score recomputed, transitions evaluated.
8. If state changed → UI updates (theme, animations, overlays).
9. Advisory stage runs async → updates AIAdvisoryPanel on dashboard.

## User Flow: Overwhelmed Button

1. OverwhelmButton visible on every page.
2. User presses button.
3. Zustand store immediately transitions to Overwhelmed. No composite calculation.
4. State snapshot recorded (self_report=1.0, new state).
5. Overwhelm event logged (trigger: button_press).
6. RestModeOverlay renders over main content.
7. If extreme score OR repeated presses → CrisisRedirect shown with resource links.
8. Exit requires confirmation dialog: "Are you sure you want to exit rest mode?"

## Colour Palette

|Role|Normal (hex)|Elevated|Overwhelmed|
|---|---|---|---|
|Gradient start|#22d3ee (cyan-400)|Desaturated −40%|#94a3b8 (blue-grey)|
|Gradient mid|#14b8a6 (teal-500)|Desaturated −40%|#64748b|
|Gradient end|#059669 (emerald-600)|Desaturated −40%|#475569|
|Glass panel bg|white/25|white/20|white/10|
|Text primary|#0f172a (slate-900)|#1e293b (slate-800)|#334155 (slate-700)|
|Text secondary|#475569 (slate-600)|#64748b (slate-500)|#94a3b8 (slate-400)|
|Accent success|#22c55e (green-500)|#86efac (green-300)|Not used|
|Accent warning|#f59e0b (amber-500)|#fbbf24 (amber-400)|Not used|
|Accent danger|#ef4444 (red-500)|#ef4444 (unchanged)|#ef4444 (unchanged)|

**Danger accent never desaturates.** CrisisRedirect and OverwhelmButton keep red across all states.

**Typography:** System font stack for body. Inter (Google Fonts) for headings. Line height 1.6 body, 1.2 headings.

## Implementation Priority for Claude Code

When building LoadLight, follow this sequence derived from research:

1. **Supabase setup:** Schema with RLS, auth, encrypted at rest (NFR-4, NFR-7)
2. **Zustand store:** Overwhelmed state machine (RQ3 signals, weights, thresholds, transitions)
3. **Next.js API routes:** AI pipeline with Vercel AI SDK, `generateObject` + Zod schema for task extraction (RQ1, RQ2)
4. **shadcn/ui components:** Base components with Frutiger Aero Tailwind classes (RQ5 adaptation rules)
5. **State-adaptive theming:** CSS custom properties or Tailwind config driven by Zustand state (RQ7 saturation levels)
6. **System prompt:** Hardcoded ethical constraints (RQ6 five rules)
7. **Crisis redirect:** Static FR-4 component, not AI-generated
8. **TanStack Query:** Task CRUD with Supabase, optimistic updates
9. **Dashboard:** Balance tracking, mode enforcement (CM3)
10. **Visual iteration:** Frutiger Aero polish in Sprint 4