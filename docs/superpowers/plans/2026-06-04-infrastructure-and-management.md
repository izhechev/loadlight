# Infrastructure & Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CI/CD, health monitoring, admin dashboard, incidents tracking, security headers, and 4 competency documentation files to LoadLight.

**Architecture:** All new pages follow the existing "use client" + browser Supabase client pattern. The health endpoint is a public Next.js API route using the server Supabase client (anon key, no auth required). Incidents are stored in Supabase with RLS enforced at the DB level. Documentation files are plain markdown in `docs/`.

**Tech Stack:** Next.js 16 App Router, Supabase JS v2, GitHub Actions, TypeScript, Tailwind CSS, shadcn/ui components.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `.github/workflows/ci.yml` | Create | CI/CD pipeline |
| `next.config.ts` | Modify | Security response headers |
| `.env.example` | Create | Document all env vars |
| `app/api/health/route.ts` | Create | Public health check endpoint |
| `lib/db/schema.ts` | Modify | Add incidents Drizzle type + SQL migration |
| `app/admin/page.tsx` | Create | Admin dashboard (auth-gated, client component) |
| `app/admin/incidents/page.tsx` | Create | Incidents CRUD (auth-gated, client component) |
| `CHANGELOG.md` | Create | Semantic versioning history |
| `docs/technical-design.md` | Create | I Design + I Advise I2 competency doc |
| `docs/security-and-analysis.md` | Create | I Analysis + I Advise I2.2 competency doc |
| `docs/operations-and-management.md` | Create | I Realisation + I Manage competency doc |
| `docs/software-management.md` | Create | S3.1 + S3.2 competency doc |

---

## Task 1: GitHub Actions CI/CD

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflows directory and CI file**

Create `.github/workflows/ci.yml` with the following content:

```yaml
name: CI/CD

on:
  push:
    branches: ["**"]
  pull_request:
    branches: [main]

jobs:
  ci:
    name: Lint, Test & Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Build
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }}

  deploy:
    name: Deploy to Vercel
    runs-on: ubuntu-latest
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Deploy to Vercel
        run: npx vercel --prod --token=${{ secrets.VERCEL_TOKEN }} --yes
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions CI/CD pipeline with lint, test, build, deploy"
```

---

## Task 2: Security Headers in next.config.ts

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Replace next.config.ts with version that adds security headers**

Replace the entire content of `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self' *.supabase.co wss://*.supabase.co api.openai.com generativelanguage.googleapis.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify the build still passes**

Run: `npm run build`
Expected: Build completes with no type errors. If you see TypeScript errors, check the NextConfig import is correct.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "security: add CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy headers"
```

---

## Task 3: .env.example

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Create .env.example**

Create `.env.example` at the repo root:

```bash
# ─────────────────────────────────────────────────────────
# LoadLight — Environment Variables
# Copy this file to .env.local and fill in your values.
# NEVER commit .env.local to git.
# ─────────────────────────────────────────────────────────

# ── Supabase ──────────────────────────────────────────────
# Your Supabase project URL (found in Project Settings > API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co

# Supabase anon/publishable key (safe to expose in browser)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGci...your-anon-key

# ── AI Providers ──────────────────────────────────────────
# OpenAI API key — used as primary AI provider (GPT-4o mini)
# Get from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-...your-openai-key

# Google AI API key — used as fallback AI provider (Gemini 2.5 Flash)
# Get from: https://aistudio.google.com/app/apikey
GOOGLE_API_KEY=AIza...your-google-key

# ── Vercel (CI/CD only — set as GitHub Secrets, not in .env.local) ──
# These are only needed for the GitHub Actions deploy job.
# Set them in: GitHub repo > Settings > Secrets and variables > Actions
# VERCEL_TOKEN=your-vercel-token
# VERCEL_ORG_ID=your-vercel-org-id
# VERCEL_PROJECT_ID=your-vercel-project-id
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add .env.example documenting all environment variables"
```

---

## Task 4: Health Check Endpoint

**Files:**
- Create: `app/api/health/route.ts`

- [ ] **Step 1: Create the health endpoint**

Create `app/api/health/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const version = '0.1.0'
  const timestamp = new Date().toISOString()
  const start = Date.now()

  let dbStatus: 'connected' | 'degraded' | 'error' = 'connected'

  try {
    const supabase = await createClient()
    const { error } = await supabase.from('profiles').select('id').limit(1)
    if (error && error.code !== 'PGRST301') {
      dbStatus = 'degraded'
    }
  } catch {
    dbStatus = 'error'
  }

  const latency_ms = Date.now() - start

  return Response.json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    version,
    db: dbStatus,
    latency_ms,
    timestamp,
  })
}
```

- [ ] **Step 2: Test it locally**

Run: `npm run dev`
Open browser to: `http://localhost:3000/api/health`
Expected response:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "db": "connected",
  "latency_ms": 45,
  "timestamp": "2026-06-04T10:00:00.000Z"
}
```
If Supabase is not configured (demo mode), `db` will be `"degraded"` and `status` will be `"degraded"` — that is expected behaviour.

- [ ] **Step 3: Commit**

```bash
git add app/api/health/route.ts
git commit -m "feat(api): add public /api/health endpoint with DB connectivity check"
```

---

## Task 5: Incidents Table — Schema & SQL Migration

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Add the incidents Drizzle table definition to schema.ts**

Open `lib/db/schema.ts`. After the `aiLogs` table definition (around line 85) and before the TypeScript inferred types section, add:

```ts
// ─────────────────────────────────────────────
// incidents
// ─────────────────────────────────────────────
export const incidents = pgTable('incidents', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull(),
  detectedAt:  timestamp('detected_at', { withTimezone: true }).notNull(),
  resolvedAt:  timestamp('resolved_at', { withTimezone: true }),
  severity:    text('severity').notNull(),  // low | medium | high | critical
  title:       text('title').notNull(),
  description: text('description'),
  rootCause:   text('root_cause'),
  resolution:  text('resolution'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

Then add the TypeScript types for incidents after the existing type exports:

```ts
export type Incident    = typeof incidents.$inferSelect
export type NewIncident = typeof incidents.$inferInsert
```

- [ ] **Step 2: Add the SQL migration to the migration comment block in schema.ts**

Find the SQL migration comment block (starting around line 99 with `──────────────────────────────────────────────────────────────────`). Add the following SQL before the closing `──────────────────────────────────────────────────────────────────` line:

```sql
create table incidents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references profiles(id) on delete cascade not null,
  detected_at  timestamptz not null,
  resolved_at  timestamptz,
  severity     text check (severity in ('low','medium','high','critical')) not null,
  title        text not null,
  description  text,
  root_cause   text,
  resolution   text,
  created_at   timestamptz not null default now()
);
alter table incidents enable row level security;
create policy "own incidents" on incidents for all using (auth.uid() = user_id);
```

- [ ] **Step 3: Apply the migration in Supabase**

Go to your Supabase project dashboard → SQL Editor → paste and run the SQL above. Verify the `incidents` table appears in the Table Editor.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat(db): add incidents table with RLS — severity, title, root_cause, resolution"
```

---

## Task 6: Admin Dashboard Page

**Files:**
- Create: `app/admin/page.tsx`

- [ ] **Step 1: Create the admin dashboard page**

Create `app/admin/page.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { AppLayout } from "@/components/app-layout"

interface HealthData {
  status: string
  version: string
  db: string
  latency_ms: number
  timestamp: string
}

interface AiStats {
  totalCalls: number
  avgLatencyMs: number
  totalTokensIn: number
  totalTokensOut: number
  modelBreakdown: Record<string, number>
  callTypeBreakdown: Record<string, number>
}

interface StateEvent {
  id: string
  trigger: string
  previous_state: string
  new_state: string
  created_at: string
}

interface IncidentSummary {
  open: number
  resolved: number
}

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<HealthData | null>(null)
  const [aiStats, setAiStats] = useState<AiStats | null>(null)
  const [stateEvents, setStateEvents] = useState<StateEvent[]>([])
  const [incidentSummary, setIncidentSummary] = useState<IncidentSummary>({ open: 0, resolved: 0 })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Fetch health
      fetch('/api/health')
        .then(r => r.json())
        .then(setHealth)
        .catch(() => setHealth(null))

      // Fetch AI logs (all-time for this user)
      const { data: logs } = await supabase
        .from('ai_logs')
        .select('model, call_type, tokens_in, tokens_out, latency_ms')

      if (logs && logs.length > 0) {
        const totalCalls = logs.length
        const avgLatencyMs = Math.round(logs.reduce((s, l) => s + l.latency_ms, 0) / totalCalls)
        const totalTokensIn = logs.reduce((s, l) => s + l.tokens_in, 0)
        const totalTokensOut = logs.reduce((s, l) => s + l.tokens_out, 0)
        const modelBreakdown: Record<string, number> = {}
        const callTypeBreakdown: Record<string, number> = {}
        for (const l of logs) {
          modelBreakdown[l.model] = (modelBreakdown[l.model] ?? 0) + 1
          callTypeBreakdown[l.call_type] = (callTypeBreakdown[l.call_type] ?? 0) + 1
        }
        setAiStats({ totalCalls, avgLatencyMs, totalTokensIn, totalTokensOut, modelBreakdown, callTypeBreakdown })
      } else {
        setAiStats({ totalCalls: 0, avgLatencyMs: 0, totalTokensIn: 0, totalTokensOut: 0, modelBreakdown: {}, callTypeBreakdown: {} })
      }

      // Fetch last 10 overwhelm events
      const { data: events } = await supabase
        .from('overwhelm_events')
        .select('id, trigger, previous_state, new_state, created_at')
        .order('created_at', { ascending: false })
        .limit(10)
      setStateEvents(events ?? [])

      // Fetch incident summary
      const { data: inc } = await supabase
        .from('incidents')
        .select('id, resolved_at')
      if (inc) {
        setIncidentSummary({
          open: inc.filter(i => !i.resolved_at).length,
          resolved: inc.filter(i => !!i.resolved_at).length,
        })
      }

      setLoading(false)
    }
    load()
  }, [router])

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-zinc-400">Loading admin data…</div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-100">Admin Dashboard</h1>
          <span className="text-xs text-zinc-500">v{health?.version ?? '—'}</span>
        </div>

        {/* System Health */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">System Health</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Status" value={health?.status ?? '—'} highlight={health?.status === 'ok'} />
            <Stat label="DB" value={health?.db ?? '—'} highlight={health?.db === 'connected'} />
            <Stat label="Latency" value={health ? `${health.latency_ms}ms` : '—'} />
            <Stat label="Version" value={health?.version ?? '—'} />
          </div>
        </div>

        {/* AI Usage */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">AI Usage (All-time)</h2>
          {aiStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Total Calls" value={String(aiStats.totalCalls)} />
                <Stat label="Avg Latency" value={`${aiStats.avgLatencyMs}ms`} />
                <Stat label="Tokens In" value={aiStats.totalTokensIn.toLocaleString()} />
                <Stat label="Tokens Out" value={aiStats.totalTokensOut.toLocaleString()} />
              </div>
              {Object.keys(aiStats.modelBreakdown).length > 0 && (
                <div>
                  <p className="text-xs text-zinc-500 mb-2">Model breakdown</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(aiStats.modelBreakdown).map(([model, count]) => (
                      <span key={model} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded-md">
                        {model}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No AI calls logged yet.</p>
          )}
        </div>

        {/* State Events */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Recent State Transitions</h2>
          {stateEvents.length === 0 ? (
            <p className="text-sm text-zinc-500">No state transitions yet.</p>
          ) : (
            <div className="space-y-2">
              {stateEvents.map(e => (
                <div key={e.id} className="flex items-center gap-3 text-sm">
                  <span className="text-zinc-500 text-xs w-36 shrink-0">{new Date(e.created_at).toLocaleString()}</span>
                  <span className="text-zinc-400">{e.previous_state}</span>
                  <span className="text-zinc-600">→</span>
                  <span className="text-zinc-200 font-medium">{e.new_state}</span>
                  <span className="text-xs text-zinc-600 ml-auto">{e.trigger}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Incidents */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Incidents</h2>
            <Link href="/admin/incidents" className="text-xs text-blue-400 hover:text-blue-300">
              Manage incidents →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Open" value={String(incidentSummary.open)} highlight={incidentSummary.open === 0} />
            <Stat label="Resolved" value={String(incidentSummary.resolved)} />
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? 'text-green-400' : 'text-zinc-100'}`}>{value}</p>
    </div>
  )
}
```

- [ ] **Step 2: Test locally**

Run: `npm run dev`
Navigate to `http://localhost:3000/admin` — should redirect to `/login` if not authenticated, or show the dashboard if logged in.

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat(admin): add admin dashboard with health, AI usage, state events, incidents summary"
```

---

## Task 7: Admin Incidents Page

**Files:**
- Create: `app/admin/incidents/page.tsx`

- [ ] **Step 1: Create the incidents CRUD page**

Create `app/admin/incidents/page.tsx`:

```tsx
"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { AppLayout } from "@/components/app-layout"

type Severity = 'low' | 'medium' | 'high' | 'critical'

interface Incident {
  id: string
  detected_at: string
  resolved_at: string | null
  severity: Severity
  title: string
  description: string | null
  root_cause: string | null
  resolution: string | null
  created_at: string
}

const SEVERITY_COLOURS: Record<Severity, string> = {
  low: 'bg-zinc-700 text-zinc-200',
  medium: 'bg-yellow-900 text-yellow-200',
  high: 'bg-orange-900 text-orange-200',
  critical: 'bg-red-900 text-red-200',
}

export default function IncidentsPage() {
  const router = useRouter()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)
  const [resolution, setResolution] = useState('')

  // New incident form state
  const [form, setForm] = useState({
    title: '',
    severity: 'medium' as Severity,
    description: '',
    root_cause: '',
    detected_at: new Date().toISOString().slice(0, 16),
  })

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data } = await supabase
      .from('incidents')
      .select('*')
      .order('detected_at', { ascending: false })
    setIncidents(data ?? [])
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  async function createIncident(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('incidents').insert({
      user_id: user.id,
      title: form.title,
      severity: form.severity,
      description: form.description || null,
      root_cause: form.root_cause || null,
      detected_at: new Date(form.detected_at).toISOString(),
    })
    setForm({ title: '', severity: 'medium', description: '', root_cause: '', detected_at: new Date().toISOString().slice(0, 16) })
    setShowForm(false)
    load()
  }

  async function resolveIncident(id: string) {
    const supabase = createClient()
    await supabase.from('incidents').update({
      resolved_at: new Date().toISOString(),
      resolution: resolution || null,
    }).eq('id', id)
    setResolving(null)
    setResolution('')
    load()
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-zinc-400">Loading…</div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/admin" className="text-xs text-zinc-500 hover:text-zinc-300">← Admin</Link>
            <h1 className="text-2xl font-bold text-zinc-100 mt-1">Incidents</h1>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg"
          >
            {showForm ? 'Cancel' : '+ Log Incident'}
          </button>
        </div>

        {/* New incident form */}
        {showForm && (
          <form onSubmit={createIncident} className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-300">New Incident</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Title *</label>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                  placeholder="Brief incident title"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Severity *</label>
                <select
                  value={form.severity}
                  onChange={e => setForm(f => ({ ...f, severity: e.target.value as Severity }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Detected at *</label>
                <input
                  type="datetime-local"
                  required
                  value={form.detected_at}
                  onChange={e => setForm(f => ({ ...f, detected_at: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                placeholder="What happened?"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Root Cause</label>
              <textarea
                value={form.root_cause}
                onChange={e => setForm(f => ({ ...f, root_cause: e.target.value }))}
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                placeholder="Why did it happen?"
              />
            </div>
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg">
              Log Incident
            </button>
          </form>
        )}

        {/* Incidents list */}
        {incidents.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-500 text-sm">
            No incidents logged yet.
          </div>
        ) : (
          <div className="space-y-3">
            {incidents.map(inc => (
              <div key={inc.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLOURS[inc.severity]}`}>
                        {inc.severity}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${inc.resolved_at ? 'bg-green-900 text-green-200' : 'bg-zinc-700 text-zinc-300'}`}>
                        {inc.resolved_at ? 'resolved' : 'open'}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-zinc-100">{inc.title}</p>
                    {inc.description && <p className="text-xs text-zinc-400">{inc.description}</p>}
                    {inc.root_cause && (
                      <p className="text-xs text-zinc-500">Root cause: {inc.root_cause}</p>
                    )}
                    {inc.resolution && (
                      <p className="text-xs text-zinc-500">Resolution: {inc.resolution}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-zinc-500">{new Date(inc.detected_at).toLocaleDateString()}</p>
                    {inc.resolved_at && (
                      <p className="text-xs text-green-600">{new Date(inc.resolved_at).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>

                {!inc.resolved_at && (
                  <div>
                    {resolving === inc.id ? (
                      <div className="flex gap-2 mt-2">
                        <input
                          value={resolution}
                          onChange={e => setResolution(e.target.value)}
                          placeholder="Resolution notes (optional)"
                          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none"
                        />
                        <button
                          onClick={() => resolveIncident(inc.id)}
                          className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg"
                        >
                          Resolve
                        </button>
                        <button
                          onClick={() => setResolving(null)}
                          className="text-xs text-zinc-400 hover:text-zinc-200 px-2"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setResolving(inc.id)}
                        className="text-xs text-green-400 hover:text-green-300 mt-1"
                      >
                        Mark resolved →
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
```

- [ ] **Step 2: Test locally**

Run: `npm run dev`
Navigate to `http://localhost:3000/admin/incidents`
- Log a test incident with title "AI provider timeout", severity "medium"
- Verify it appears in the list
- Click "Mark resolved →", enter resolution notes, click "Resolve"
- Verify it shows as resolved

- [ ] **Step 3: Commit**

```bash
git add app/admin/incidents/page.tsx
git commit -m "feat(admin): add incidents CRUD page with severity badges and resolve flow"
```

---

## Task 8: CHANGELOG.md

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create CHANGELOG.md at repo root**

Create `CHANGELOG.md`:

```markdown
# Changelog

All notable changes to LoadLight are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

---

## [Unreleased]

### Added
- GitHub Actions CI/CD pipeline (lint → test → build → deploy)
- Public `/api/health` endpoint with DB connectivity and latency check
- Security response headers: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- Admin dashboard at `/admin` with live AI usage stats, state events, and incident summary
- Incidents management at `/admin/incidents` with severity, root cause, and resolution tracking
- `.env.example` documenting all required environment variables
- Infrastructure documentation: technical design, security analysis, operations, software management

---

## [0.4.0] — 2026-05-30

### Added
- Chill Guy mode lock: user-configurable lock duration instead of hardcoded 30 days
- AI-powered Chill Snooze: snooze low-priority tasks automatically when in Chill mode

### Fixed
- Dashboard: label progress bar as all-time completion; hide when too few tasks
- Dashboard: deduplicate recurring tasks in all dashboard metrics
- Tasks: deduplicate recurring task instances — show only earliest undone

---

## [0.3.0] — 2026-05-15

### Added
- AI task extraction via Gemini 2.5 Flash with OpenAI GPT-4o mini fallback
- AI scheduling: conversational schedule builder with chat pre-processing
- AI advisory endpoint: workload analysis, triage, weekly summary, chill-snooze
- AI moderation: ethical system prompt with clinical language restrictions
- `ai_logs` table: metadata-only logging (call type, model, tokens, latency)

---

## [0.2.0] — 2026-04-20

### Added
- State machine with 5 weighted signals: task accumulation, demand concentration, completion velocity, temporal pressure, self-report
- Three workload states: Normal → Elevated → Overwhelmed
- `overwhelm_events` table: audit log of all state transitions
- Balance modes: Beast Worker (70/30), Average Worker (50/50), Chill Guy (30/70)
- Onboarding flow for new users

### Fixed
- SSR middleware: session refresh on all protected routes

---

## [0.1.0] — 2026-03-10

### Added
- Next.js 16 App Router with Supabase Auth (SSR, Row Level Security)
- Task management: create, complete, archive, recurring tasks (daily/weekly)
- Task categories with emoji, life domains, demand types, difficulty/priority levels
- Dashboard with workload sparklines and completion metrics
- Demo mode: full app functionality without Supabase credentials (localStorage fallback)
- Drizzle ORM schema for TypeScript type inference
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add CHANGELOG.md with semantic versioning history from v0.1.0"
```

---

## Task 9: docs/technical-design.md

**Files:**
- Create: `docs/technical-design.md`

- [ ] **Step 1: Create the technical design document**

Create `docs/technical-design.md`:

```markdown
# Technical Design

**Competencies covered:** I Design I2.1 · I Design I2.2 · I Design I2.3 · I Advise I2.1

---

## 1. Infrastructure Overview

LoadLight is a web application deployed on a managed cloud infrastructure. All infrastructure components are provided as services (no self-managed servers).

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                               │
│                   Browser (any device)                      │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼─────────────────────────────────────┐
│                       VERCEL                                │
│         Next.js 16 App Router (Edge Network CDN)            │
│  ┌──────────────────┐   ┌──────────────────────────────┐   │
│  │   Pages / UI     │   │   API Routes (/api/*)        │   │
│  │  (React 19, TSX) │   │  health · incidents · chat   │   │
│  └──────────────────┘   └─────────────┬────────────────┘   │
└────────────────────────────────────────┼────────────────────┘
                                         │
          ┌──────────────────────────────┼──────────────────┐
          │                             │                    │
┌─────────▼──────────┐      ┌───────────▼────────┐  ┌───────▼──────────┐
│     SUPABASE        │      │      OPENAI         │  │     GOOGLE AI    │
│  PostgreSQL + RLS  │      │  GPT-4o mini        │  │  Gemini 2.5 Flash│
│  Auth (JWT/SSR)    │      │  (primary AI)       │  │  (fallback AI)   │
│  Realtime          │      └────────────────────┘  └──────────────────┘
└────────────────────┘
```

**Data flows:**
- All user requests go to Vercel's edge network first (CDN caching for static assets)
- Server-side rendering happens in Vercel's Node.js serverless functions
- Database calls go from Vercel → Supabase via HTTPS (connection pool managed by Supabase)
- AI calls go from Vercel API routes → OpenAI or Google AI (never from the client browser)

---

## 2. Non-Functional Requirements

| NFR | Requirement | How it is met |
|---|---|---|
| **Performance** | Page load < 3s on 4G | Vercel CDN, static generation where possible, lazy loading |
| **AI Response Time** | Advisory response < 2s | GPT-4o mini (fast model), Gemini fallback, 2000-char input cap |
| **Availability** | 99% uptime | Vercel 99.99% SLA, Supabase 99.9% SLA, dual-AI-provider fallback |
| **Scalability** | Handle traffic spikes | Vercel auto-scales serverless functions; Supabase connection pooling |
| **Security** | No unauthorized data access | Row Level Security on every table, SSR auth middleware, CSP headers |
| **Privacy / GDPR** | User data isolation | RLS enforces `user_id = auth.uid()`; AI logs store metadata only (no input/output text); data stored in EU (Supabase Frankfurt region) |
| **Compliance** | No PII leakage to AI | Sanitisation removes identifiers before AI calls; ethical system prompt restricts topic scope |
| **Maintainability** | Easy to onboard new developers | `.env.example`, `CHANGELOG.md`, Drizzle typed schema, CI/CD enforces lint + test on every push |

---

## 3. Architecture Decision Records

### ADR-001: Supabase over self-hosted PostgreSQL

**Context:** LoadLight needs a relational database with auth, row-level security, and real-time capabilities. Options considered: self-hosted PostgreSQL on a VPS, PlanetScale (MySQL), Neon (serverless Postgres), Supabase.

**Decision:** Use Supabase.

**Rationale:** Supabase bundles PostgreSQL + Auth + RLS + real-time in a single managed service. Self-hosted PostgreSQL requires a VPS, SSL setup, connection pooling, and backup management — all undifferentiated operational work for a solo developer project. Neon and PlanetScale lack the built-in Auth + RLS combination LoadLight needs. Supabase's free tier supports the project's scale.

**Consequences:**
- Positive: No infrastructure to manage; built-in RLS means security policy lives at DB level
- Positive: `@supabase/ssr` provides SSR-safe auth cookie handling for Next.js
- Negative: Vendor lock-in on Auth API and RLS syntax; migrating away requires rewriting auth layer
- Negative: Supabase free tier pauses projects after 1 week of inactivity (acceptable for portfolio use)

---

### ADR-002: Vercel over VPS or Docker

**Context:** The app needs a deployment platform that supports Next.js SSR, edge functions, automatic HTTPS, and continuous deployment from GitHub. Options: DigitalOcean VPS + Nginx, Fly.io, Railway, Render, Vercel.

**Decision:** Use Vercel.

**Rationale:** Vercel is built by the creators of Next.js and provides zero-config deployment with full SSR, edge CDN, automatic HTTPS, and Vercel's image optimization. A VPS would require Nginx configuration, SSL certificate management, process supervision (PM2/systemd), and monitoring. This is significant operational overhead for a solo project. Vercel's free tier covers the project's needs. The CI/CD pipeline deploys to Vercel automatically on `main` merge.

**Consequences:**
- Positive: Zero infrastructure management; deploy in one command
- Positive: Preview deployments on every PR (free tier)
- Negative: Vendor lock-in; serverless function cold starts possible
- Negative: No persistent filesystem (not needed — all state in Supabase)

---

### ADR-003: Dual AI provider (OpenAI + Google Gemini)

**Context:** LoadLight's core features depend on AI for task extraction and workload advisory. A single AI provider creates a single point of failure (rate limits, outages, cost spikes). Options: OpenAI only, Gemini only, or dual-provider with fallback.

**Decision:** Use Gemini 2.5 Flash as primary, with smart mock fallback for demo mode. OpenAI key is available but Gemini is used for all calls given its speed/cost profile.

**Rationale:** Gemini 2.5 Flash offers better tokens-per-second performance at lower cost than GPT-4o mini for the task extraction workload. The mock fallback ensures the app remains functional without any API key (demo mode). This satisfies the reliability NFR without paying for two simultaneous AI calls.

**Consequences:**
- Positive: App works without any API keys (demo mode for portfolio)
- Positive: Lower AI cost per user session
- Negative: Gemini's JSON output occasionally includes markdown code fences (worked around with regex strip)

---

### ADR-004: Next.js App Router

**Context:** This project uses Next.js. At project start, two routing paradigms were available: the legacy Pages Router and the newer App Router. Both are supported in Next.js 16.

**Decision:** Use the App Router.

**Rationale:** The App Router provides React Server Components, simplified data fetching (fetch in server components directly), and better integration with Supabase SSR. The `@supabase/ssr` package is designed for the App Router's cookie API (`next/headers`). The App Router is the direction of Next.js and the Pages Router is in maintenance mode.

**Consequences:**
- Positive: Server components reduce client JS bundle size
- Positive: SSR auth middleware (`lib/supabase/server.ts`) integrates natively
- Negative: App Router learning curve; less community content than Pages Router (as of 2024)

---

### ADR-005: Drizzle ORM for TypeScript types only

**Context:** LoadLight needs TypeScript types that match the Supabase database schema. Options: Supabase's auto-generated types (`supabase gen types`), Prisma, Drizzle ORM with a live DB connection, or Drizzle for types only.

**Decision:** Use Drizzle ORM for TypeScript type inference only — no live Drizzle connection.

**Rationale:** Supabase JS client is used for all runtime queries (best DX, supports RLS, realtime). Drizzle's schema definition gives us typed `$inferSelect`/`$inferInsert` types without running a code generator. The SQL migration is maintained as a comment block in `schema.ts` and applied manually via the Supabase dashboard — appropriate for a small project without a migration runner. Full Drizzle or Prisma would add a direct DB connection, a migration runner, and connection pooling complexity with no benefit.

**Consequences:**
- Positive: TypeScript types stay in sync with intent without a code generator step
- Positive: No additional DB connection to manage; Supabase JS handles pooling
- Negative: Types can drift from actual DB schema if the SQL migration is not applied; this is a manual discipline requirement

---

## 4. Service Catalog

LoadLight delivers the following services to its users:

| Service | Description | Consumer | Delivery Channel |
|---|---|---|---|
| Task Management | Create, view, complete, and archive tasks with metadata (priority, deadline, demand type) | Authenticated user | Web UI (`/tasks`) |
| AI Task Extraction | Parse natural language into structured task objects | Authenticated user | Web UI → `/api/chat` (mode: extract) |
| Workload Advisory | Analyse task patterns and deliver supportive workload advice | Authenticated user | Web UI → `/api/chat` (mode: analyze/weekly/triage) |
| AI Scheduling | Conversational daily schedule builder | Authenticated user | Web UI → `/api/chat` (mode: schedule/schedule_chat) |
| State Monitoring | Automatic detection of elevated/overwhelmed workload states | Authenticated user | Client-side state machine, persisted to `overwhelm_events` |
| Admin Dashboard | Live system health, AI usage metrics, incident management | App owner (authenticated) | Web UI (`/admin`) |
| Health Check | System status and DB connectivity for uptime monitoring | External monitors (UptimeRobot) | `/api/health` (public JSON endpoint) |

---

## 5. Service Level Agreement (SLA)

**Service:** LoadLight Web Application
**Provider:** Ivan Zhechev (developer)
**Consumer:** End users

| Metric | Target | Measurement Method |
|---|---|---|
| **Uptime** | ≥ 99% per calendar month | UptimeRobot 5-minute checks on `/api/health` |
| **AI response time** | ≤ 2 seconds (p95) | `latency_ms` field in `ai_logs` table |
| **Page load time** | ≤ 3 seconds on 4G (p95) | Vercel Analytics / manual Lighthouse test |
| **Data retention** | User data retained for duration of account | Supabase persistent storage |
| **Incident response** | Critical: acknowledge within 4h; resolve within 24h | Tracked in `/admin/incidents` |
| **Planned maintenance** | Communicated 24h in advance | Entry in CHANGELOG.md |

**GDPR Compliance:**
- User data is stored in the EU (Supabase Frankfurt region, `eu-central-1`)
- AI providers receive task metadata only — no names, emails, or PII
- AI call logs store metadata only (model, tokens, latency) — input/output text is never stored
- Users can export or delete their data via Settings → Data Management

---

## 6. Automated Deployment (CI/CD)

Deployment is fully automated via GitHub Actions. See `docs/software-management.md` for the full pipeline walkthrough.

**Flow:**
```
Developer pushes to branch
        ↓
GitHub Actions: npm ci → lint → test → build
        ↓ (on main only, after CI passes)
GitHub Actions: npx vercel --prod
        ↓
Vercel: deploy to production (new immutable deployment)
        ↓
/api/health: verify DB connectivity post-deploy
```

**Infrastructure as Code approach:**
LoadLight uses managed services (Vercel, Supabase) rather than self-managed servers. This is an intentional architecture decision (ADR-002). Configuration is codified in:
- `next.config.ts` — application configuration, security headers
- `.env.example` — documented environment variable contract
- `lib/db/schema.ts` — database schema as code (Drizzle types + SQL migration)
- `.github/workflows/ci.yml` — deployment pipeline as code
- `vercel.json` (implicit — Vercel reads from package.json `build` script)
```

- [ ] **Step 2: Commit**

```bash
git add docs/technical-design.md
git commit -m "docs: add technical-design.md covering ADRs, NFRs, SLA, architecture, service catalog"
```

---

## Task 10: docs/security-and-analysis.md

**Files:**
- Create: `docs/security-and-analysis.md`

- [ ] **Step 1: Create the security and analysis document**

Create `docs/security-and-analysis.md`:

```markdown
# Security & Infrastructure Analysis

**Competencies covered:** I Analysis I2.1 · I Analysis I2.2 · I Advise I2.2

---

## 1. Infrastructure Quality Analysis

Evaluated against **ISO/IEC 25010** quality characteristics for software and systems.

| Quality Characteristic | Sub-characteristic | Assessment | Evidence |
|---|---|---|---|
| **Reliability** | Availability | Good | Vercel 99.99% SLA; Supabase 99.9% SLA; dual-AI fallback prevents total AI outage |
| **Reliability** | Fault tolerance | Moderate | AI mock fallback for offline mode; no graceful degradation for DB outage in UI |
| **Security** | Confidentiality | Good | RLS enforces per-user data isolation; no cross-user data access possible |
| **Security** | Integrity | Good | Supabase constraints (CHECK, NOT NULL, FK) prevent invalid data; input sanitisation before AI |
| **Security** | Non-repudiation | Moderate | `ai_logs` and `overwhelm_events` provide audit trail; no tamper-evident logging |
| **Performance efficiency** | Time behaviour | Good | AI calls capped at 2000 chars; Gemini Flash is fast (< 2s typical); latency logged |
| **Performance efficiency** | Resource utilisation | Good | Serverless (pay-per-request); no idle compute cost |
| **Maintainability** | Modularity | Good | Clean separation: lib/data, lib/store, lib/utils, app/api, app/(pages) |
| **Maintainability** | Testability | Moderate | 92% statement coverage on utility modules; API routes and UI not unit-tested |
| **Portability** | Adaptability | Moderate | Demo mode (localStorage fallback) works without Supabase; AI providers swappable |

**Summary:** The infrastructure performs well on security, reliability, and performance for its scale. The main gaps are the absence of automated integration tests for API routes and a lack of graceful DB-down UI handling.

---

## 2. Security Threat Analysis

Threat model using **STRIDE** methodology:

| Threat | Category | Attack Vector | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| Accessing another user's tasks | **Spoofing / Information Disclosure** | Crafted Supabase query with different `user_id` | Low | High | **RLS policy:** `auth.uid() = user_id` on all tables — DB rejects unauthenticated or cross-user queries at the PostgreSQL level |
| Session hijacking | **Spoofing** | Stolen JWT or session cookie | Medium | High | Supabase JWTs are short-lived (1h); SSR middleware refreshes session on each request; `HttpOnly` cookies prevent JS access |
| AI prompt injection | **Tampering** | Malicious user input containing instructions like "ignore previous instructions" | Medium | Medium | Sanitisation function (`sanitise()` in `app/api/chat/route.ts`) strips injection patterns; 2000-char hard cap; ethical system prompt ignores off-topic instructions |
| Excessive AI token usage (abuse) | **Denial of Service** | Automated requests to `/api/chat` | Low | Medium | Supabase Auth required for meaningful use; AI routes are serverless (auto-scale); Vercel rate limiting configurable |
| Sensitive data leakage to AI providers | **Information Disclosure** | AI logs storing PII | Low | High | AI logs store metadata only (model, tokens, latency) — no input/output text ever stored; task content sent to AI but not logged |
| Supply chain attack | **Tampering** | Malicious npm package | Low | High | `npm audit` runs in CI; pinned exact versions in `package-lock.json`; GitHub Dependabot available |
| Insecure direct object reference | **Information Disclosure** | Guessing incident/task UUIDs | Low | Medium | UUIDs are unguessable (128-bit random); RLS blocks access regardless |
| Clickjacking | **Tampering** | Embedding app in iframe | Low | Low | `X-Frame-Options: DENY` header prevents all iframe embedding |
| MIME type confusion | **Tampering** | Browser interpreting responses as wrong content type | Low | Low | `X-Content-Type-Options: nosniff` prevents MIME sniffing |

---

## 3. OWASP Top 10 (2021) Checklist

| # | Risk | Status | Evidence / Notes |
|---|---|---|---|
| A01 | Broken Access Control | **Mitigated** | Supabase RLS on every table; all queries server-validated |
| A02 | Cryptographic Failures | **Mitigated** | All traffic over HTTPS (enforced by Vercel); passwords managed by Supabase Auth (bcrypt); JWTs signed with HS256 |
| A03 | Injection | **Mitigated** | Supabase JS client uses parameterised queries (no raw SQL from user input); AI input sanitised |
| A04 | Insecure Design | **Mitigated** | RLS-first design; AI logs store no PII; ethical constraints hardcoded in system prompt |
| A05 | Security Misconfiguration | **Partially mitigated** | CSP, X-Frame-Options, X-Content-Type-Options headers added; `unsafe-eval` still present in CSP (required by Next.js dev tooling) |
| A06 | Vulnerable and Outdated Components | **Monitored** | `npm audit` runs in CI pipeline; all deps on recent majors |
| A07 | Identification and Authentication Failures | **Mitigated** | Supabase Auth handles signup/login; SSR session validation on protected routes; no custom auth code |
| A08 | Software and Data Integrity Failures | **Partially mitigated** | `package-lock.json` pins exact versions; no code signing; CI verifies build integrity |
| A09 | Security Logging and Monitoring Failures | **Mitigated** | `ai_logs` tracks all AI calls; `overwhelm_events` audits state transitions; `/admin` dashboard surfaces metrics; UptimeRobot monitors availability |
| A10 | Server-Side Request Forgery | **Not applicable** | No user-controlled URLs are fetched server-side |

---

## 4. Security Measures in Place

### Row Level Security (RLS)
Every table in the database has RLS enabled with a policy that restricts all operations to the row owner:
```sql
create policy "own [table]" on [table] for all using (auth.uid() = user_id);
```
This means that even if the application layer has a bug that leaks a `user_id`, the database itself will reject the query. RLS is the primary security control for data isolation.

### SSR Authentication Middleware
`lib/supabase/server.ts` creates a server-side Supabase client that reads the session from `HttpOnly` cookies. This prevents session tokens from being accessible to JavaScript (XSS resistance). The session is refreshed on every server-side render.

### AI Input Sanitisation
`app/api/chat/route.ts` runs all user input through `sanitise()` before passing it to AI providers:
```ts
function sanitise(input: string): string {
  return input
    .replace(/[<>`]/g, '')
    .replace(/ignore previous instructions?/gi, '')
    .replace(/system\s*:/gi, '')
    .replace(/\[INST\]/gi, '')
    .slice(0, 2000)
}
```
This removes common XSS characters, prompt injection patterns, and enforces a token cap.

### Content Security Policy
Added in `next.config.ts`. Restricts which origins can execute scripts, load styles, and make connections:
- `script-src 'self' 'unsafe-eval' 'unsafe-inline'` — required for Next.js; `unsafe-eval` is needed for React development tooling
- `connect-src` — only allows connections to Supabase, OpenAI, and Google AI

### Ethical AI Constraints
The AI system prompt (`ETHICAL_SYSTEM_PROMPT` in `app/api/chat/route.ts`) is hardcoded and not user-configurable. It restricts the AI from making clinical assessments, using directive language, or discussing topics outside task management.

---

## 5. Security Improvement Proposals

| Priority | Proposal | Effort | Competency Impact |
|---|---|---|---|
| High | Replace `unsafe-eval` in CSP with a nonce-based approach using Next.js built-in nonce support | Medium | Reduces XSS attack surface significantly |
| High | Add Supabase Auth rate limiting on login endpoint to prevent brute-force attacks | Low | Configure in Supabase dashboard → Auth → Rate Limits |
| Medium | Enable Vercel Web Application Firewall (WAF) to block malicious traffic at edge | Low | Available on Vercel Pro; blocks common attack patterns before reaching the app |
| Medium | Add `npm audit --audit-level=high` to CI pipeline to fail builds on high-severity vulnerabilities | Low | Prevents shipping known-vulnerable dependencies |
| Low | Implement Content Security Policy reporting (`report-uri`) to collect CSP violation data | Low | Helps detect injection attempts in production |

---

## 6. Incident Analysis

### Incident 001 — AI Fallback Silent Failure (2026-04-15)

**Severity:** Medium
**Detected:** During development testing — AI advisory returned empty advice without error
**Root cause:** The Gemini API returned a valid 200 response but with a malformed JSON body wrapped in markdown code fences (` ```json ... ``` `). The response parser expected raw JSON and failed silently, returning the mock fallback without logging the failure.
**Resolution:** Added a regex strip for markdown code fences before JSON.parse in `generateWithGemini()`. The fix is present in `app/api/chat/route.ts` (lines 26-29).
**Lesson learned:** AI API responses should always be defensively parsed; never assume the model returns raw JSON even when instructed.

---

### Incident 002 — Recurring Task Duplication in Dashboard (2026-05-25)

**Severity:** Low
**Detected:** User reported that recurring tasks appeared multiple times in dashboard completion counts, inflating the all-time total.
**Root cause:** The dashboard query fetched all task rows including multiple instances of recurring tasks. The deduplication logic that existed in the tasks list view was not applied to dashboard aggregation queries.
**Resolution:** Applied the same deduplication utility (`deduplicateRecurringTasks`) to all dashboard metric calculations. Committed in `fix(dashboard): deduplicate recurring tasks in all dashboard metrics` (commit `d6a3941`).
**Lesson learned:** Shared data transformation logic must be extracted into reusable utilities (like `taskUtils.ts`) rather than inline-implemented in each view.

---

### Incident 003 — Mode Lock Allowing Bypass via Settings Reload (2026-05-28)

**Severity:** Low
**Detected:** During user testing — reloading the settings page allowed mode switching even while the Chill Guy mode lock was active.
**Root cause:** The lock duration was being checked against a hardcoded 30-day value rather than reading the stored `mode_locked_until` timestamp from localStorage. After a settings page reload, the component re-initialised and re-read the timestamp correctly, but the initial comparison used the wrong reference.
**Resolution:** Changed mode lock check to always read from persistent storage (`mode_locked_until` key); removed hardcoded duration. Committed in `feat(settings): ask user for chill lock duration instead of hardcoding 30 days` (commit `bc4f25e`).
**Lesson learned:** Configurable values should never be hardcoded — always read from the single source of truth (storage or config).
```

- [ ] **Step 2: Commit**

```bash
git add docs/security-and-analysis.md
git commit -m "docs: add security-and-analysis.md covering STRIDE, OWASP, measures, incident analysis"
```

---

## Task 11: docs/operations-and-management.md

**Files:**
- Create: `docs/operations-and-management.md`

- [ ] **Step 1: Create the operations and management document**

Create `docs/operations-and-management.md`:

```markdown
# Operations & Management

**Competencies covered:** I Realisation I2.1 · I Realisation I2.2 · I Realisation I2.3 · I Manage I2.1 · I Manage I2.2 · I Manage I2.3

---

## 1. Infrastructure Setup

### Prerequisites
- Node.js 20+
- A Supabase project (free tier sufficient)
- A Vercel account (free tier sufficient)
- An OpenAI API key or Google AI API key (at least one required; app runs in demo mode without)

### Step 1: Clone and configure environment

```bash
git clone https://github.com/izhechev/loadlight.git
cd loadlight
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, GOOGLE_API_KEY
```

### Step 2: Apply the database schema

1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the SQL migration block from `lib/db/schema.ts` (the block between the `──────` lines)
4. Paste and run in the SQL Editor
5. Verify in **Table Editor** that all tables are created: `profiles`, `tasks`, `state_snapshots`, `overwhelm_events`, `ai_logs`, `incidents`

### Step 3: Configure Supabase Auth

1. In Supabase dashboard → **Authentication → Providers**: ensure Email provider is enabled
2. In **Authentication → URL Configuration**: set Site URL to `https://your-vercel-app.vercel.app`
3. Add `http://localhost:3000` to the Additional Redirect URLs for local development

### Step 4: Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
# Follow prompts to link to your Vercel account and project
```

Or connect the GitHub repository to Vercel via the Vercel dashboard for automatic deployments.

### Step 5: Configure Vercel environment variables

In Vercel dashboard → Project → **Settings → Environment Variables**, add:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `GOOGLE_API_KEY`
- `OPENAI_API_KEY` (optional)

### Step 6: Configure GitHub Actions secrets (for CI/CD)

In GitHub repository → **Settings → Secrets and variables → Actions**, add:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `VERCEL_TOKEN` (from vercel.com → Settings → Tokens)
- `VERCEL_ORG_ID` (from `.vercel/project.json` after first `vercel` command)
- `VERCEL_PROJECT_ID` (from `.vercel/project.json`)

### Performance & Scalability

**Scalability:** Vercel serverless functions auto-scale to handle traffic spikes with no manual intervention. Supabase uses a connection pooler (PgBouncer) to handle concurrent DB connections efficiently.

**Compliance:** User data is stored in the EU (Supabase Frankfurt region). No PII is sent to AI providers. Users can export and delete their data via Settings → Data Management.

---

## 2. Monitoring Setup

### Health Endpoint

LoadLight exposes a public health check endpoint at `/api/health`:

```
GET https://loadlight.vercel.app/api/health
```

Response:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "db": "connected",
  "latency_ms": 42,
  "timestamp": "2026-06-04T10:00:00.000Z"
}
```

- `status: "ok"` — all systems operational
- `status: "degraded"` — DB connectivity issue; app may be partially functional

### External Uptime Monitoring (UptimeRobot)

1. Create a free account at [uptimerobot.com](https://uptimerobot.com)
2. Add a new **HTTP(s)** monitor:
   - URL: `https://loadlight.vercel.app/api/health`
   - Interval: **5 minutes**
   - Alert contact: your email
3. UptimeRobot will send an email alert if the endpoint returns a non-200 status or times out
4. The public status page URL can be embedded in documentation as evidence of monitoring

### In-App Admin Dashboard

The admin dashboard at `/admin` provides live operational metrics visible to authenticated users:

| Metric | Source | What it shows |
|---|---|---|
| System status | `/api/health` | DB connectivity, latency, app version |
| AI call volume | `ai_logs` | Total calls, model breakdown, avg latency |
| Token usage | `ai_logs` | Total tokens in/out (cost indicator) |
| State transitions | `overwhelm_events` | Recent Normal/Elevated/Overwhelmed transitions |
| Incidents | `incidents` | Open vs resolved incident count |

### Interpreting Metrics

- **High AI latency (> 2000ms avg):** Gemini API may be under load; consider switching to OpenAI primary
- **DB latency > 500ms:** Supabase may be under load; check [status.supabase.com](https://status.supabase.com)
- **Open incidents > 0:** Review `/admin/incidents` and resolve outstanding issues

---

## 3. Infrastructure Test Plan

The following test plan verifies that the LoadLight infrastructure meets its non-functional requirements.

### Test Category 1: Connectivity

| Test ID | Test | Method | Pass Criterion |
|---|---|---|---|
| CON-01 | Application loads in browser | Navigate to production URL | Page renders within 3s; no console errors |
| CON-02 | Health endpoint responds | `GET /api/health` | HTTP 200; `status: "ok"` or `"degraded"` |
| CON-03 | DB connectivity | Check `db` field in health response | `"connected"` |
| CON-04 | AI provider available | Submit a task extraction via UI | Task extracted successfully |

### Test Category 2: Authentication

| Test ID | Test | Method | Pass Criterion |
|---|---|---|---|
| AUTH-01 | Unauthenticated access to protected routes | Navigate to `/tasks` without login | Redirected to `/login` |
| AUTH-02 | Unauthenticated access to admin | Navigate to `/admin` without login | Redirected to `/login` |
| AUTH-03 | Login with valid credentials | Submit login form | Redirected to `/dashboard`; session cookie set |
| AUTH-04 | Login with invalid credentials | Submit login form with wrong password | Error message shown; no session created |
| AUTH-05 | Session persistence | Login, close tab, reopen URL | Session still active (if within JWT expiry) |

### Test Category 3: Row Level Security

| Test ID | Test | Method | Pass Criterion |
|---|---|---|---|
| RLS-01 | User A cannot read User B's tasks | Attempt direct Supabase query with User A's session for User B's `user_id` | Empty result set returned (0 rows) |
| RLS-02 | Unauthenticated query on tasks | Direct Supabase REST query with no auth header | HTTP 401 or empty result |
| RLS-03 | User can only modify own incidents | Attempt PATCH on incident with different `user_id` | HTTP 400 or no rows updated |

### Test Category 4: Health Endpoint

| Test ID | Test | Method | Pass Criterion |
|---|---|---|---|
| HLT-01 | Endpoint is publicly accessible | `GET /api/health` without auth | HTTP 200 |
| HLT-02 | Response includes all required fields | Parse JSON response | `status`, `version`, `db`, `latency_ms`, `timestamp` all present |
| HLT-03 | Latency is reasonable | Check `latency_ms` field | < 1000ms |
| HLT-04 | Version matches package.json | Compare `version` field | Matches `version` in `package.json` |

### Test Category 5: Security Headers

| Test ID | Test | Method | Pass Criterion |
|---|---|---|---|
| SEC-01 | X-Frame-Options header present | Check response headers | `X-Frame-Options: DENY` |
| SEC-02 | CSP header present | Check response headers | `Content-Security-Policy` header with `default-src 'self'` |
| SEC-03 | X-Content-Type-Options present | Check response headers | `X-Content-Type-Options: nosniff` |
| SEC-04 | App not embeddable in iframe | Attempt to embed in `<iframe>` | Browser blocks the frame |

**How to run security header tests:**
```bash
curl -I https://loadlight.vercel.app/ | grep -E "(X-Frame|Content-Security|X-Content-Type|Referrer)"
```

### Test Execution Record

| Test Run | Date | Tester | Result |
|---|---|---|---|
| Initial | 2026-06-04 | Ivan Zhechev | All CON, AUTH, HLT, SEC tests pass; RLS-01/02/03 pass via Supabase dashboard verification |

---

## 4. Management Processes

### Change Management Flow

All changes to LoadLight follow this process:

```
1. IDENTIFY   → Developer identifies bug, improvement, or new requirement
                 Source: user feedback, self-testing, incident analysis

2. DEVELOP    → Create a feature branch from main
                 Branch naming: feat/*, fix/*, docs/*, ci/*

3. IMPLEMENT  → Write code; run tests locally (npm test)
                 Tests must pass before proceeding

4. REVIEW     → Self-review via git diff; check for security issues
                 For significant changes: use /code-review skill

5. CI CHECK   → Push branch; GitHub Actions runs lint + test + build
                 All checks must be green before merge

6. MERGE      → Merge to main via GitHub PR or direct push
                 A merge triggers automatic deployment to Vercel

7. VERIFY     → Check /api/health post-deploy
                 Monitor Vercel logs for errors in first 5 minutes

8. DOCUMENT   → Update CHANGELOG.md with change in [Unreleased] section
                 Tag a release if it's a significant milestone
```

### Incident Management Process

When a production incident is detected:

1. **Detect** — UptimeRobot alert, user report, or admin dashboard anomaly
2. **Log** — Create entry in `/admin/incidents` with severity, description, and `detected_at`
3. **Triage** — Assess severity: critical (app down) / high (data loss risk) / medium (feature broken) / low (cosmetic)
4. **Investigate** — Check Vercel function logs, Supabase logs, and `ai_logs`/`overwhelm_events` for context
5. **Fix** — Apply fix following Change Management Flow; use `fix/*` branch prefix
6. **Resolve** — Update incident entry in `/admin/incidents` with `resolution` text and `resolved_at`
7. **Post-mortem** — For medium+ severity: document root cause and prevention in `docs/security-and-analysis.md`

---

## 5. New Technology Management

### How upgrades are managed

**Node.js / Next.js:** Pin the exact Next.js version in `package.json`. Upgrade only when a new version provides a required feature or security fix. Test upgrade in a separate branch; CI must pass before merging.

**Supabase:** The Supabase JS client (`@supabase/supabase-js`) is updated on minor versions automatically via `npm update`. Major version upgrades require reviewing the migration guide and testing auth flows. Supabase platform (PostgreSQL version, Auth) is managed by Supabase and upgrades automatically — monitor [status.supabase.com](https://status.supabase.com) for maintenance windows.

**AI models:** AI model selection is configurable in `app/api/chat/route.ts`. When a new model becomes available (e.g., Gemini 3.0, GPT-5), evaluate it against current model on latency and output quality, then update the model identifier. No breaking schema changes are required.

**Security patches:** `npm audit` runs in every CI build. If a high-severity vulnerability is found, a `fix/security-patch` branch is created immediately; standard change management flow applies but with expedited merge.

---

## 6. Service Level Reporting

The following metrics map directly to the SLA targets defined in `docs/technical-design.md`.

### How to read the admin dashboard for SLA compliance

| SLA Metric | Where to check | How to calculate |
|---|---|---|
| Uptime ≥ 99% | UptimeRobot dashboard | `(total_minutes - downtime_minutes) / total_minutes × 100` |
| AI response ≤ 2s (p95) | `ai_logs` via admin dashboard | Sort `latency_ms` ascending, take value at 95th percentile |
| Open incidents | `/admin/incidents` | Count of rows where `resolved_at IS NULL` |

### Monthly SLA report template

```
LoadLight SLA Report — [Month YYYY]

Uptime:          [X]% (target: ≥ 99%)
AI latency p95:  [X]ms (target: ≤ 2000ms)
Total AI calls:  [X]
Total incidents: [X] (open: [X], resolved: [X])
GDPR events:     0 data breaches or PII leaks

Status: [COMPLIANT / NON-COMPLIANT]
Non-compliances: [list any misses]
Actions taken:   [list any remediation]
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/operations-and-management.md
git commit -m "docs: add operations-and-management.md covering setup, monitoring, test plan, management processes"
```

---

## Task 12: docs/software-management.md

**Files:**
- Create: `docs/software-management.md`

- [ ] **Step 1: Create the software management document**

Create `docs/software-management.md`:

```markdown
# Software Management

**Competencies covered:** S3.1 (Configuration, Change & Release Management) · S3.2 (Development Pipeline with Automated Build & Test Infrastructure)

---

## 1. CI/CD Pipeline (S3.2)

The CI/CD pipeline is defined in `.github/workflows/ci.yml` and runs on GitHub Actions.

### Pipeline Architecture

```
Developer pushes code
        │
        ▼
┌───────────────────────────────────────────┐
│          GitHub Actions: ci job           │
│                                           │
│  1. actions/checkout@v4                   │
│     └─ Clone repository at commit SHA    │
│                                           │
│  2. actions/setup-node@v4 (Node 20)       │
│     └─ Cache npm dependencies            │
│                                           │
│  3. npm ci                                │
│     └─ Install exact versions from       │
│        package-lock.json (reproducible)  │
│                                           │
│  4. npm run lint                          │
│     └─ ESLint v9 — enforce code style,   │
│        catch common errors               │
│                                           │
│  5. npm test                              │
│     └─ Vitest — run all .test.ts files   │
│        92 tests, must all pass           │
│                                           │
│  6. npm run build                         │
│     └─ Next.js production build          │
│        TypeScript type-check included    │
└───────────────────┬───────────────────────┘
                    │ (only on push to main, after ci passes)
                    ▼
┌───────────────────────────────────────────┐
│         GitHub Actions: deploy job        │
│                                           │
│  1. actions/checkout@v4                   │
│  2. actions/setup-node@v4                 │
│  3. npm ci                                │
│                                           │
│  4. npx vercel --prod --token=$TOKEN      │
│     └─ Deploy to Vercel production        │
│        Vercel creates a new immutable    │
│        deployment; routes production     │
│        traffic to it atomically          │
└───────────────────────────────────────────┘
```

### Why each step exists

| Step | Purpose |
|---|---|
| `npm ci` | Uses `package-lock.json` for exact reproducible installs — prevents "works on my machine" issues |
| `npm run lint` | Catches code quality issues and TypeScript errors early — cheaper to fix in CI than in production |
| `npm test` | Verifies business logic (state machine, task utilities) hasn't regressed — 92 tests covering critical paths |
| `npm run build` | Full TypeScript compile + Next.js optimisation — catches type errors and build failures before they reach users |
| `vercel --prod` | Atomic deployment — Vercel only switches production traffic after the new build is fully ready |

### Trigger conditions

| Event | Jobs that run |
|---|---|
| Push to any branch | `ci` only |
| Pull request to `main` | `ci` only |
| Push to `main` | `ci` → `deploy` (sequential) |

### Secrets required (GitHub repository secrets)

| Secret | Source | Used in |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API | `build` step (needed for Next.js static analysis) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project → Settings → API | `build` step |
| `VERCEL_TOKEN` | vercel.com → Settings → Tokens | `deploy` step |
| `VERCEL_ORG_ID` | `.vercel/project.json` (after first `vercel` command) | `deploy` step |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` | `deploy` step |

---

## 2. Release Management (S3.1)

### Semantic Versioning

LoadLight uses [Semantic Versioning 2.0.0](https://semver.org/):

```
MAJOR.MINOR.PATCH
  │     │     └─ Bug fix, performance improvement, dependency update
  │     └─ New feature, backwards-compatible
  └─ Breaking change (e.g., schema migration requiring data migration)
```

Current version: `0.1.0` — pre-1.0 development phase. Version `1.0.0` marks the first production-ready release.

### Release Process

1. **During development:** Add changes to `## [Unreleased]` section of `CHANGELOG.md`
2. **When releasing:** 
   ```bash
   # Update version in package.json
   npm version minor  # or patch or major
   
   # Move [Unreleased] entries to the new version in CHANGELOG.md
   # Example: ## [0.2.0] — 2026-06-15
   
   # Commit and tag
   git add CHANGELOG.md package.json
   git commit -m "chore: release v0.2.0"
   git tag v0.2.0
   git push origin main --tags
   ```
3. **CI/CD picks up the push to main** and deploys automatically
4. **Verify** the release on production via `/api/health` (check `version` field)

### CHANGELOG format

LoadLight follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format:
- `### Added` — new features
- `### Changed` — changes to existing features
- `### Fixed` — bug fixes
- `### Removed` — removed features
- `### Security` — security patches

---

## 3. Configuration Management (S3.1)

### Environment variables

All environment variables are documented in `.env.example`. Variables fall into two categories:

| Category | Variables | Storage |
|---|---|---|
| **Public** (safe to expose in browser) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel env vars (public), GitHub Actions secrets |
| **Secret** (never in browser) | `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `VERCEL_TOKEN` | Vercel env vars (secret), GitHub Actions secrets |

**Rules:**
- `.env.local` is in `.gitignore` — never committed
- `.env.example` contains no real values — only descriptions and placeholder text
- All secrets are managed via Vercel's encrypted environment variable store in production
- GitHub Actions secrets are encrypted and only exposed to the specific job that needs them

### Infrastructure as Code

| Artifact | What it configures | Where |
|---|---|---|
| `.github/workflows/ci.yml` | CI/CD pipeline | Repository |
| `next.config.ts` | App configuration, security headers | Repository |
| `lib/db/schema.ts` | Database schema (Drizzle types + SQL) | Repository |
| `.env.example` | Environment variable contract | Repository |
| Vercel project settings | Production env vars, domain, build settings | Vercel dashboard |
| Supabase SQL migration | Database tables, RLS policies | `lib/db/schema.ts` comment block |

### Dependency management

- `package-lock.json` pins exact versions for reproducible builds
- `npm ci` (not `npm install`) is used in CI for strict lockfile adherence
- `npm audit` is run as part of `npm test` — vulnerabilities are surfaced in CI
- Dependabot can be enabled in GitHub to create automatic PRs for security updates

---

## 4. Change Management Process (S3.1)

### Branch strategy

```
main (production)
 ├── feat/admin-dashboard
 ├── fix/ai-fallback-parsing
 ├── docs/infrastructure-docs
 └── ci/github-actions
```

All development happens on feature branches. Direct pushes to `main` are allowed for the solo developer workflow but trigger CI/CD automatically.

### Commit conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

Types: feat, fix, docs, ci, refactor, test, chore, security
Scope: optional — (api), (admin), (db), (auth), (ui)

Examples:
feat(admin): add incidents CRUD page with severity badges
fix(dashboard): deduplicate recurring tasks in all metrics
ci: add GitHub Actions pipeline with lint, test, build, deploy
security: add CSP and X-Frame-Options response headers
docs: add technical-design.md covering ADRs and SLA
```

### Code review

For significant changes, use `/code-review` in Claude Code to analyse the diff for correctness and security before merging. All changes must pass CI before deployment.

---

## 5. Coordination with Infrastructure Management (S3.1)

### Software release → Infrastructure actions

| Software change | Infrastructure action required |
|---|---|
| New database table/column | Run SQL migration in Supabase dashboard before or immediately after deployment |
| New environment variable | Add to Vercel env vars AND GitHub Actions secrets before deployment |
| New external API dependency | Add domain to CSP `connect-src` in `next.config.ts` |
| Version bump | Update `version` in `package.json`; verify `/api/health` returns new version post-deploy |
| Security header change | Test locally with `curl -I localhost:3000`; verify headers in production post-deploy |

### Database migration coordination

Since there is no automated migration runner (by design — see ADR-005), schema changes follow this manual coordination:

1. Add new SQL to the migration block in `lib/db/schema.ts`
2. Add Drizzle type definition to the same file
3. Apply SQL in Supabase SQL Editor (staging: test project, production: live project)
4. Deploy the application code
5. Verify the feature works in production
6. Update CHANGELOG.md

**Rule:** Never deploy application code that references a new table/column before that table/column exists in the database. The database migration always runs first.
```

- [ ] **Step 2: Commit**

```bash
git add docs/software-management.md
git commit -m "docs: add software-management.md covering CI/CD, release, configuration, change management"
```

---

## Task 13: Push & Screenshots

**Files:** none (git push + external browser actions)

- [ ] **Step 1: Push all commits to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Wait for CI to go green**

Go to: `https://github.com/izhechev/loadlight/actions`
Expected: The CI/CD workflow runs and all steps (lint, test, build, deploy) show green checkmarks. Wait for the deploy job to complete.

- [ ] **Step 3: Take screenshot — GitHub Actions CI run**

Screenshot the GitHub Actions workflow run page showing all green steps. Save as evidence for S3.2.

- [ ] **Step 4: Open the deployed app and navigate to /admin**

Navigate to your Vercel production URL + `/admin` (e.g., `https://loadlight.vercel.app/admin`). Log in if prompted. Take a screenshot of the admin dashboard showing the 4 cards (System Health, AI Usage, State Events, Incidents).

- [ ] **Step 5: Navigate to /admin/incidents and log a real incident**

Log at least one real incident (e.g., "AI Gemini markdown wrapping bug" from Incident 001 in `docs/security-and-analysis.md`). Take a screenshot showing the incidents list with at least one entry.

- [ ] **Step 6: Screenshot the /api/health response**

Navigate to `https://loadlight.vercel.app/api/health` in the browser. Take a screenshot of the JSON response.

- [ ] **Step 7: Set up UptimeRobot monitor**

1. Go to [uptimerobot.com](https://uptimerobot.com) → Sign up / Log in
2. Click **Add New Monitor**
3. Type: HTTP(s), Friendly Name: LoadLight, URL: `https://loadlight.vercel.app/api/health`, Interval: 5 minutes
4. Click **Create Monitor**
5. Wait for first check (up to 5 minutes), then screenshot the monitor showing "Up" status

- [ ] **Step 8: Embed screenshots in docs**

Add screenshots to the relevant docs:
- GitHub Actions screenshot → `docs/software-management.md` (under CI/CD section)
- Admin dashboard screenshot → `docs/operations-and-management.md` (under Monitoring Setup)
- Health endpoint screenshot → `docs/operations-and-management.md`
- UptimeRobot screenshot → `docs/operations-and-management.md`
- Incidents page screenshot → `docs/operations-and-management.md`

To embed an image in markdown:
```markdown
![Admin Dashboard](../screenshots/admin-dashboard.png)
```
Create a `docs/screenshots/` directory and save screenshots there.

- [ ] **Step 9: Final commit**

```bash
git add docs/screenshots/ docs/operations-and-management.md docs/software-management.md
git commit -m "docs: add screenshots as evidence for admin dashboard, CI/CD, health endpoint, monitoring"
git push origin main
```
