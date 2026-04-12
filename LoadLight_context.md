# LoadLight — implementation context

Read this entire file before writing any code.

---

## What LoadLight is
A task management web app that detects when users are taking on too much, gives workload-scoped AI advice, and tracks work-life balance through configurable modes. The app is NOT a therapist, NOT a mental health tool. It tracks tasks and infers workload sustainability from task patterns.

---

## Tech stack
- **Next.js 14** App Router, TypeScript, strict mode, no `any`
- **Tailwind CSS** + **shadcn/ui** (Radix primitives) + **Framer Motion**
- **Supabase** PostgreSQL, Auth, Row Level Security, real-time
- **Drizzle ORM**
- **Vercel AI SDK** `@ai-sdk/openai` (GPT-4o mini primary), `@ai-sdk/google` (Gemini 2.0 Flash fallback)
- **Zustand** for client state (state machine, UI)
- **TanStack Query** for server state (Supabase queries)
- **recharts** for sparklines
- **Vercel** free tier deployment

---

## Database schema

All tables: RLS enabled. Policy on every table: `user_id = auth.uid()` for SELECT, INSERT, UPDATE, DELETE.

```sql
-- User preferences and mode
CREATE TABLE profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users,
  balance_mode        text CHECK (balance_mode IN ('beast','average','chill')) DEFAULT 'average',
  mode_locked_until   timestamptz NULL,
  onboarding_complete boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

-- Core task data, two-layer classification
CREATE TABLE tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES profiles(id) NOT NULL,
  name              text NOT NULL,
  life_domain       text CHECK (life_domain IN ('work','study','personal','creative','administrative')) NOT NULL,
  demand_type       text CHECK (demand_type IN ('cognitive','emotional','creative','routine')) NOT NULL,
  difficulty        integer CHECK (difficulty BETWEEN 1 AND 5) NOT NULL,
  deadline          timestamptz NULL,
  estimated_minutes integer NULL,
  status            text CHECK (status IN ('active','completed','archived')) DEFAULT 'active',
  created_at        timestamptz DEFAULT now(),
  completed_at      timestamptz NULL
);

-- Rolling window for state machine (recalculate on task changes)
CREATE TABLE state_snapshots (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid REFERENCES profiles(id) NOT NULL,
  composite_score      float NOT NULL,
  task_accumulation    float NOT NULL,
  demand_concentration float NOT NULL,
  completion_velocity  float NOT NULL,
  temporal_pressure    float NOT NULL,
  self_report          float NOT NULL,
  state                text CHECK (state IN ('normal','elevated','overwhelmed')) NOT NULL,
  recorded_at          timestamptz DEFAULT now()
);

-- Audit log for state changes
CREATE TABLE overwhelm_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES profiles(id) NOT NULL,
  trigger         text CHECK (trigger IN ('composite','button')) NOT NULL,
  previous_state  text NOT NULL,
  new_state       text NOT NULL,
  created_at      timestamptz DEFAULT now()
);

-- AI call metadata ONLY. Never store user input text or AI response text.
CREATE TABLE ai_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES profiles(id) NOT NULL,
  call_type   text CHECK (call_type IN ('extraction','advisory')) NOT NULL,
  model       text NOT NULL,
  tokens_in   integer NOT NULL,
  tokens_out  integer NOT NULL,
  latency_ms  integer NOT NULL,
  created_at  timestamptz DEFAULT now()
);
```

---

## State machine (three states)

### Five signals, each normalised to 0.0–1.0

| Signal | Weight | How to calculate |
|--------|--------|-----------------|
| Task accumulation | 0.25 | `active_undone_count / rolling_14day_avg_active`. Cap at 1.0. If avg is 0, use count/5. |
| Demand concentration | 0.20 | `max_demand_type_count / total_active_tasks`. If 0 tasks, signal = 0. |
| Completion velocity | 0.25 | `(tasks_added_7d - tasks_completed_7d) / max(tasks_added_7d, 1)`. Negative = good (completing more than adding). Clamp to 0.0–1.0. |
| Temporal pressure | 0.15 | `tasks_due_within_48h / total_active_tasks`. If 0 tasks, signal = 0. |
| Self-report | 0.15 | Button press sets to 1.0. Optional mood/energy input maps to 0.0–0.8. Default 0.0 if no input. |

**Composite score** = weighted sum of all five signals.
**State is based on 3-day rolling average** of composite scores (average of last 3 daily snapshots).

### Transitions

```
Normal → Elevated:      3-day avg >= 0.45
Elevated → Overwhelmed: 3-day avg >= 0.70
Elevated → Normal:      3-day avg < 0.45 (automatic)
Overwhelmed → Elevated: score < 0.70 AND user clicks "exit rest mode" (both conditions required)
Overwhelmed → Normal:   score < 0.45 AND user clicks "exit rest mode" (both conditions required)
Any → Overwhelmed:      overwhelmed button pressed (IMMEDIATE, bypasses all scoring)
```

**Recalculate** the composite score whenever a task is created, completed, or deleted. Store a new snapshot. The 3-day average uses the most recent snapshots from 3 distinct calendar days.

---

## Overwhelmed button
- Fixed position component, always visible in AppLayout regardless of page
- One tap = immediate transition to Overwhelmed state, no confirmation needed to enter
- Logs an overwhelm_event with trigger = 'button'
- Red styling (#ef4444), never changes across states

---

## Rest mode (Overwhelmed state behaviour)

What happens when state = overwhelmed:

1. **Warning banner** at top: "You've flagged feeling overwhelmed. Consider resting before adding more." Dismissible.
2. **Recovery activity cards** in a 2x2 grid: "5-min break" (step away from screen), "Read something light" (10 min, not work), "Put on music" (something you enjoy), "Short walk" (even just around the room).
3. **Task list stays visible and functional** but adding a new task shows a confirmation dialog: "Is this urgent right now?" with "Yes, add it" and "Maybe later" buttons.
4. **Crisis redirect component** (static, hardcoded React component): "This app tracks tasks, not mental health. If you need support:" followed by 988 Suicide & Crisis Lifeline and Crisis Text Line 741741. This component must NEVER call any AI API. Pure static JSX.
5. **Exit button**: "I feel better, exit rest mode" with a confirmation dialog before transitioning out.

---

## AI pipeline

### POST /api/ai/extract

User types a sentence like "Finish the database migration by Friday, it's urgent and probably takes four hours."

Server-side API route calls `generateObject()` from Vercel AI SDK with this Zod schema:

```typescript
import { z } from 'zod';

const taskExtractionSchema = z.object({
  name: z.string().describe('Core action, stripped of temporal qualifiers'),
  life_domain: z.enum(['work', 'study', 'personal', 'creative', 'administrative']),
  demand_type: z.enum(['cognitive', 'emotional', 'creative', 'routine']),
  difficulty: z.number().int().min(1).max(5),
  deadline: z.string().nullable().describe('ISO date string or null'),
  estimated_minutes: z.number().int().nullable(),
});
```

- Primary model: `gpt-4o-mini` via `@ai-sdk/openai`
- If primary fails (catch block): retry with `gemini-2.0-flash` via `@ai-sdk/google`
- If both fail: return `{ fallback: true }` and the frontend shows manual input form with the same fields
- Log to ai_logs: model used, token counts, latency. Do NOT log the user's input text or the AI response.

### GET /api/ai/advise

Reads the user's active tasks, current composite score, current state, and balance mode from Supabase. Calls `generateText()` with a system prompt.

**System prompt** (hardcoded in the API route file, never in database, never user-configurable):

```
You are a workload analysis tool inside a task management app called LoadLight.

Rules you must follow:
1. TONE: Use "consider", "you might", "one option is". Never "you should", "you must", or "you need to". No clinical terms.
2. SCOPE: Comment on workload patterns only: task volume, deadline distribution, demand balance, completion trends. Never comment on emotions, feelings, mood, or psychological state.
3. AUTHORITY: You are a calculator showing patterns, not a counsellor giving advice. Say "Cognitive tasks are concentrated on Monday" not "You are overloading yourself".
4. ESCALATION: Never offer coping strategies, breathing exercises, relaxation techniques, or emotional support. If the user seems distressed, say nothing about it. The app handles escalation separately.
5. TRANSPARENCY: You are an AI analysing task data. Do not pretend to be human or to understand the user's situation beyond what the task data shows.

Current user state: {state}
Balance mode: {mode} ({ratio} work/leisure target)
Active tasks: {taskCount}
Composite score: {score}
Tasks due within 48h: {urgentCount}
Dominant demand type: {dominantType} ({dominantPercent}%)

Provide a 1-2 sentence observation about the user's current workload based on the data above. Adjust tone:
- If state is "normal": informational, neutral
- If state is "elevated": gentler, suggest reduction without pressure
- If state is "overwhelmed": minimal, acknowledge rest. One short sentence only.
```

- Log to ai_logs: metadata only
- Return: `{ text: string, aiDisclosure: true }`
- Frontend shows the text with a small "AI workload analysis" indicator

---

## Balance modes

### How the ratio works
Each task has a life_domain. Work + Study = work side. Personal + Creative + Administrative = leisure side. The ratio is calculated from **active** tasks only (status = 'active'), not completed.

`workRatio = (work_count + study_count) / total_active_count`

### Dashboard BalanceViz component
- Shows current work% vs target work%
- Orange bar for actual work ratio
- Marker/line at the target position
- If work% exceeds target by more than 5 percentage points: show overshoot in red/orange with a text nudge

### Mode behaviour

| Mode | Target work% | AI advisory adjustment | Lock |
|------|-------------|----------------------|------|
| Beast Worker (beast) | 70% | Productivity-focused. Only flag overload at Elevated/Overwhelmed. | None |
| Average Worker (average) | 50% | Flag when work exceeds 55% or drops below 45%. | None |
| Chill Guy (chill) | 30% | Discourage new work tasks. Flag when work exceeds 35%. | 30-day soft lock |

### Chill Guy time lock implementation
When user selects Chill Guy:
1. Set `profiles.mode_locked_until = now() + interval '30 days'`
2. Settings page: show countdown ("18 days remaining") and explanation text
3. Mode selector visually disabled but has an override path
4. Override: tap locked selector → modal with explanation ("Recovery research suggests at least 30 days...") → user must TYPE "I want to switch" (not just tap a button) → confirm → mode changes, lock clears
5. Beast Worker and Average Worker have no lock, switching is instant

### Mode selector UI (persona cards)
Not buttons, not a slider. Three cards with self-identification language:

**Beast mode** — 70% work — "Work is the priority right now"
**Balanced** — 50% work — "Work and life in equal measure. Half work, half everything else. Sustainable, steady."
**Chill Guy** — 30% work — "Recovery and leisure first"

Selected card has a checkmark. Chill Guy card shows the 30-day lock notice BEFORE user selects it.

---

## Page routes

```
app/
  login/page.tsx           → Supabase Auth UI
  onboarding/page.tsx      → Name input, work type, balance mode persona cards
  (app)/                   → AppLayout wrapper (sidebar, header, OverwhelmButton, theme provider)
    dashboard/page.tsx     → StatCards (sparklines), BalanceViz (slider), AIAdvisoryPanel
    tasks/
      new/page.tsx         → NL text input, AI extraction display, confirm/edit form, manual fallback
      page.tsx             → TaskCard list, filters by domain/type/status, deadline sorting
    settings/page.tsx      → Mode selector (persona cards, lock), preferences
```

---

## Component inventory

### StatCard
- Large number (36, 33, 1.5h, 0)
- Label below ("Total tasks", "Completed", "Hours estimated", "Due soon")
- **Sparkline** beneath: 4-week trend line using recharts. Small, inline, no axis labels.
- **Delta label**: "+8 this month" or "-0.6h vs 4wk ago" in small grey text
- Background: `bg-white rounded-xl shadow-sm` (solid, no glass)

### StatusBanner
- Shows state message + composite score badge
- Normal: "You're managing well" + "Score 0.32" in green badge
- Elevated: "Your plate is getting full" + score in orange badge
- Overwhelmed: "Rest mode is active" + score in red badge

### OverwhelmFeedback (on dashboard)
- Coloured dot indicator (green/orange/red) + text label ("Load: Light" / "Load: Moderate" / "Load: Heavy")
- Score bar: horizontal progress bar showing composite score (e.g. 0.61 out of 1.0)
- NO emoji faces. Measured, clinical presentation.

### AIAdvisoryPanel
- Card on dashboard showing the latest advisory text
- Small "AI workload analysis" indicator (grey text, always visible)
- Auto-generates on dashboard load (no "Click Generate" button)
- In Overwhelmed state: shows minimal text, does not generate new advice

### OverwhelmButton
- Fixed position (bottom-right or bottom of sidebar)
- Red (#ef4444), rounded, always visible
- Text: "I'm overwhelmed" or just an icon
- Single tap triggers state transition immediately

### RestModeOverlay
- Renders when state = overwhelmed
- Contains: warning banner, recovery cards grid, crisis redirect, exit button
- Does NOT block the task list, shows it below with confirmation friction on "add task"

### CrisisRedirect
- Static JSX component inside RestModeOverlay
- Text: "This app tracks tasks, not mental health. If you need support:"
- Links: 988 Suicide & Crisis Lifeline, Crisis Text Line 741741
- ZERO AI dependency. No API calls. No dynamic content.

### BalanceViz
- Orange bar showing current work%
- Target marker (vertical line or notch at target position)
- Overshoot region in red/pink if exceeding target
- Progress bar below showing completion%
- **Balance slider**: draggable, 10%–90% range, labeled "More leisure ← → More work"
- Slider changes are debounced and update the profile

### ModeSelector (Settings + Onboarding)
- Three persona cards, vertically stacked
- Each card: icon, mode name, work%, description text
- Selected card: green/teal border + checkmark
- Chill Guy card: shows "30-day commitment" notice before selection
- When locked: countdown display, greyed selector, override button leading to 3-step flow

---

## Design system: Frutiger Aero

### Implementation approach
- shadcn/ui base components (Radix accessibility layer preserved)
- Tailwind classes for Frutiger Aero visual layer on top
- Framer Motion for animations, conditional on state
- Theme provider reads state from Zustand, applies CSS custom properties

### State-adaptive intensity

| Property | Normal | Elevated | Overwhelmed |
|----------|--------|----------|-------------|
| Saturation | 60-70% | 40-50% | 20-30% |
| Glassmorphism | 2-3 elements/viewport | 1-2, reduced blur | Single panel only |
| Gradients | `from-cyan-400 via-teal-500 to-emerald-600` | Same hues, desaturated 40% | `from-slate-400 to-slate-600` |
| Animations | Full Framer Motion | Feedback transitions only, <200ms | None. Static interface. |
| Dark mode | User preference | Auto-activates (overridable) | Auto-activates (overridable) |
| Whitespace | Moderate spacing | Increased gaps | Maximum. Minimal content per viewport. |
| Glass bg | `bg-white/25 backdrop-blur-md` | `bg-white/20 backdrop-blur-sm` | `bg-white/10` (barely visible) |

### Colours

| Role | Normal | Elevated | Overwhelmed |
|------|--------|----------|-------------|
| Gradient start | #22d3ee | ~#6ba8b5 | #94a3b8 |
| Gradient end | #059669 | ~#4d8a6e | #475569 |
| Glass background | white/25 | white/20 | white/10 |
| Text primary | #0f172a | #1e293b | #334155 |
| Danger accent | #ef4444 | #ef4444 | #ef4444 |

**Danger accent NEVER desaturates.** Red stays red in all states.

### Rules
1. Min opacity 0.25 (light) / 0.35 (dark) on translucent panels for WCAG AA 4.5:1 contrast
2. Max 3 gradient stops, consistent direction within component groups
3. Glossy highlights via CSS box-shadow (`inset 0 1px 0 0 rgba(255,255,255,0.1)`), not images
4. Border radius: 12-16px cards, 8px buttons, full-round avatars
5. All animation behind `useReducedMotion()` hook. Respect `prefers-reduced-motion`. Feedback < 200ms.
6. Max 2-3 glassmorphism elements per viewport. Data panels get `bg-white`, NOT glass.

### Tailwind classes reference
```css
/* Glass panel (sidebar, header, non-data areas) */
.glass { @apply backdrop-blur-md bg-white/25 border border-white/20 rounded-xl; }

/* Data panel (stat cards, balance viz, advisory) */
.data-panel { @apply bg-white rounded-xl shadow-sm p-4; }

/* Nature gradient (background, sidebar accent) */
.gradient-bg { @apply bg-gradient-to-br from-cyan-400 via-teal-500 to-emerald-600; }

/* Danger (overwhelm button, crisis redirect) */
.danger { @apply bg-red-500 text-white; }
```

---

## Zustand store shape

```typescript
interface LoadLightStore {
  // State machine
  currentState: 'normal' | 'elevated' | 'overwhelmed';
  compositeScore: number;
  signals: {
    taskAccumulation: number;
    demandConcentration: number;
    completionVelocity: number;
    temporalPressure: number;
    selfReport: number;
  };

  // Balance
  balanceMode: 'beast' | 'average' | 'chill';
  modeLocked: boolean;
  modeLockedUntil: Date | null;
  currentWorkRatio: number;

  // Actions
  recalculateState: () => void;      // recompute signals from task data
  triggerOverwhelm: () => void;       // button press, immediate
  exitRestMode: () => void;          // user confirms exit
  setBalanceMode: (mode: string) => void;
  setSelfReport: (value: number) => void;
}
```

---

## Safety rules (non-negotiable, never skip these)

1. CrisisRedirect is pure static JSX. Zero API calls. Zero dynamic content.
2. System prompt is a string constant in the API route file. Not in Supabase. Not user-editable. Not injectable via user input.
3. Raw user input text is NEVER saved to any database table. Only the extracted structured fields (name, domain, type, difficulty, deadline, minutes) persist.
4. API keys are NEVER in client-side code. All AI calls go through `/api/ai/*` server-side routes.
5. Overwhelmed button always works. No conditions, no "are you sure", no cooldown.
6. Exiting Overwhelmed requires explicit user action (confirmation dialog).
7. `#ef4444` danger colour never desaturates across any state.
8. No clinical language anywhere in the app: no "anxiety", "depression", "stress disorder", "therapy", "diagnosis".
9. AI never comments on emotions or feelings. Workload data observations only.
10. The app must work when AI is down (NFR-8). Manual input form is the fallback for extraction. Advisory panel shows "Unable to generate advice" instead of crashing.

---

## Text rules for any UI copy or AI output

- No em-dashes. Use comma or period.
- Banned words in UI text: leverage, robust, seamless, comprehensive, automatically, feasibility, fundamentally, effective, essential, crucial, innovative, enhance, facilitate, optimize, streamline, standardize
- AI advisory framing: "consider", "you might", "one option is". Never "you should".
- Status messages describe the system, not the user. "Rest mode is active" not "You are overwhelmed". "Your tasks will be here when you're ready" not "Take care of yourself".
- Confirmation dialogs are direct questions: "Is this urgent right now?" not "Are you sure you want to add a task during rest mode?"
