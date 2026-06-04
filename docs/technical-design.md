# Technical Design

**Competencies covered:** I Design I2.1 · I Design I2.2 · I Design I2.3 · I Advise I2.1

---

## 1. Infrastructure Overview

LoadLight is a web application deployed on a managed cloud infrastructure. All infrastructure components are provided as services — no self-managed servers.

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
│  │  (React 19, TSX) │   │  health · chat               │   │
│  └──────────────────┘   └─────────────┬────────────────┘   │
└────────────────────────────────────────┼────────────────────┘
                                         │
          ┌──────────────────────────────┼──────────────────┐
          │                             │                    │
┌─────────▼──────────┐      ┌───────────▼────────┐  ┌───────▼──────────┐
│     SUPABASE        │      │      OPENAI         │  │     GOOGLE AI    │
│  PostgreSQL + RLS  │      │  GPT-4o mini        │  │  Gemini 2.5 Flash│
│  Auth (JWT/SSR)    │      │  (available)        │  │  (primary AI)    │
│  Realtime          │      └────────────────────┘  └──────────────────┘
└────────────────────┘
```

**Data flows:**
- All user requests go to Vercel's edge network first (CDN caching for static assets)
- Server-side rendering happens in Vercel's Node.js serverless functions
- Database calls go from Vercel → Supabase via HTTPS (connection pool managed by Supabase)
- AI calls go from Vercel API routes → Google AI or OpenAI (never from the client browser)

---

## 2. Non-Functional Requirements

| NFR | Requirement | How it is met |
|---|---|---|
| **Performance** | Page load < 3s on 4G | Vercel CDN, static generation where possible, lazy loading |
| **AI Response Time** | Advisory response < 2s | Gemini 2.5 Flash (fast model), 2000-char input cap |
| **Availability** | 99% uptime | Vercel 99.99% SLA, Supabase 99.9% SLA, AI mock fallback for demo mode |
| **Scalability** | Handle traffic spikes | Vercel auto-scales serverless functions; Supabase connection pooling via PgBouncer |
| **Security** | No unauthorized data access | Row Level Security on every table, SSR auth middleware, CSP headers |
| **Privacy / GDPR** | User data isolation | RLS enforces `user_id = auth.uid()`; AI logs store metadata only (no input/output text); data stored in EU (Supabase Frankfurt region) |
| **Compliance** | No PII leakage to AI | Sanitisation removes injection patterns before AI calls; ethical system prompt restricts topic scope |
| **Maintainability** | Easy to onboard developers | `.env.example`, `CHANGELOG.md`, Drizzle typed schema, CI/CD enforces lint + test on every push |

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

**Rationale:** Vercel is built by the creators of Next.js and provides zero-config deployment with full SSR, edge CDN, automatic HTTPS, and image optimization. A VPS would require Nginx configuration, SSL certificate management, process supervision (PM2/systemd), and monitoring — significant operational overhead for a solo project. Vercel's free tier covers the project's needs. The CI/CD pipeline deploys to Vercel automatically on `main` merge.

**Consequences:**
- Positive: Zero infrastructure management; deploy in one command
- Positive: Preview deployments on every branch push
- Negative: Vendor lock-in; serverless function cold starts possible
- Negative: No persistent filesystem (not needed — all state in Supabase)

---

### ADR-003: Dual AI provider strategy (Gemini primary + mock fallback)

**Context:** LoadLight's core features depend on AI for task extraction and workload advisory. A single AI provider creates a single point of failure. Options: OpenAI only, Gemini only, or dual-provider with fallback.

**Decision:** Use Gemini 2.5 Flash as primary AI provider, with a smart mock fallback for demo mode and offline scenarios.

**Rationale:** Gemini 2.5 Flash offers excellent tokens-per-second performance at lower cost for the task extraction workload. The mock fallback ensures the app remains fully functional without any API key (demo mode for portfolio presentations). OpenAI API key is supported as an additional option. This satisfies the reliability NFR without requiring two simultaneous paid API calls.

**Consequences:**
- Positive: App works without any API keys (demo mode for portfolio)
- Positive: Lower AI cost per user session compared to GPT-4o
- Negative: Gemini's JSON output occasionally includes markdown code fences (worked around with regex strip in the response parser)

---

### ADR-004: Next.js App Router over Pages Router

**Context:** This project uses Next.js. At project start, two routing paradigms were available: the legacy Pages Router and the newer App Router. Both are supported in Next.js 16.

**Decision:** Use the App Router.

**Rationale:** The App Router provides React Server Components, simplified data fetching, and better integration with Supabase SSR. The `@supabase/ssr` package is designed for the App Router's cookie API (`next/headers`). The App Router is the active development direction of Next.js; the Pages Router is in maintenance mode.

**Consequences:**
- Positive: SSR auth middleware (`lib/supabase/server.ts`) integrates natively with App Router cookies
- Positive: Server components reduce client JS bundle size
- Negative: App Router learning curve; some community patterns are still Pages Router-first

---

### ADR-005: Drizzle ORM for TypeScript types only (no live connection)

**Context:** LoadLight needs TypeScript types that match the Supabase database schema. Options: Supabase's auto-generated types, Prisma, Drizzle ORM with a live DB connection, or Drizzle for types only.

**Decision:** Use Drizzle ORM for TypeScript type inference only — no live Drizzle DB connection.

**Rationale:** Supabase JS client is used for all runtime queries (best DX, supports RLS, realtime). Drizzle's schema definition gives typed `$inferSelect`/`$inferInsert` types without running a code generator. The SQL migration is maintained as a comment block in `schema.ts` and applied manually via the Supabase dashboard — appropriate for a small project without a migration runner. Full Drizzle or Prisma would add a direct DB connection and connection pooling complexity with no benefit at this scale.

**Consequences:**
- Positive: TypeScript types stay in sync with intent without a code generator step
- Positive: No additional DB connection to manage
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
| State Monitoring | Automatic detection of Normal/Elevated/Overwhelmed workload states | Authenticated user | Client-side state machine, persisted to `overwhelm_events` |
| Admin Dashboard | Live system health, AI usage metrics, incident management | App owner (authenticated) | Web UI (`/admin`) |
| Health Check | System status and DB connectivity for uptime monitoring | External monitors (UptimeRobot) | `/api/health` (public JSON endpoint) |

---

## 5. Service Level Agreement (SLA)

**Service:** LoadLight Web Application
**Provider:** Ivan Zhechev (developer)
**Consumer:** End users and assessors

| Metric | Target | Measurement Method |
|---|---|---|
| **Uptime** | ≥ 99% per calendar month | UptimeRobot 5-minute checks on `/api/health` |
| **AI response time** | ≤ 2 seconds (p95) | `latency_ms` field in `ai_logs` table, visible in `/admin` |
| **Page load time** | ≤ 3 seconds on 4G (p95) | Vercel Analytics / manual Lighthouse test |
| **Data retention** | User data retained for duration of account | Supabase persistent storage |
| **Incident response** | Critical: acknowledge within 4h, resolve within 24h | Tracked in `/admin/incidents` |
| **Planned maintenance** | Communicated 24h in advance via CHANGELOG.md | Entry in `## [Unreleased]` section |

**GDPR Compliance:**
- User data is stored in the EU (Supabase Frankfurt region, `eu-central-1`)
- AI providers receive task metadata only — no names, emails, or PII
- AI call logs store metadata only (model, tokens, latency) — input/output text is never stored
- Users can export or delete their data via Settings → Data Management

---

## 6. Automated Deployment (CI/CD)

Deployment is fully automated via GitHub Actions (`.github/workflows/ci.yml`). See `docs/software-management.md` for the full annotated pipeline walkthrough.

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

**Infrastructure as Code:** LoadLight uses managed services (Vercel, Supabase) rather than self-managed servers (ADR-002). All configuration is codified:

| File | What it configures |
|---|---|
| `next.config.ts` | Application config, security headers |
| `.env.example` | Documented environment variable contract |
| `lib/db/schema.ts` | Database schema (Drizzle types + SQL migration comment) |
| `.github/workflows/ci.yml` | CI/CD pipeline — deployment automation |
