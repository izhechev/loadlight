# Infrastructure & Management Design
_Date: 2026-06-04_

## Purpose

Add all infrastructure, monitoring, CI/CD, and management features to LoadLight to fully evidence I2 (Analysis, Advise, Design, Realisation, Manage & Control) and S3 (Manage) competencies. Produce 4 combined documentation files alongside the code changes.

---

## Competency Coverage Map

| Competency | Covered by |
|---|---|
| I Analysis I2.1 | `docs/security-and-analysis.md` — quality analysis of infrastructure |
| I Analysis I2.2 | `docs/security-and-analysis.md` + incidents table/UI |
| I Advise I2.1 | `docs/technical-design.md` — ADRs with NFR justification |
| I Advise I2.2 | `docs/security-and-analysis.md` — OWASP checklist, proposed measures |
| I Design I2.1 | `docs/technical-design.md` — SLA, service catalog, management processes |
| I Design I2.2 | GitHub Actions CI/CD + `docs/technical-design.md` |
| I Design I2.3 | `docs/technical-design.md` — full technical design with security |
| I Realisation I2.1 | Vercel + Supabase setup documented in `docs/operations-and-management.md` |
| I Realisation I2.2 | `/api/health` + `/admin` page + `docs/operations-and-management.md` |
| I Realisation I2.3 | `docs/operations-and-management.md` — infrastructure test plan |
| I Manage I2.1 | `docs/operations-and-management.md` — new tech developments section |
| I Manage I2.2 | `docs/operations-and-management.md` — management process implementation |
| I Manage I2.3 | `/admin` page (live SLA reporting) + `docs/operations-and-management.md` |
| S3.1 | `CHANGELOG.md` + `docs/software-management.md` — release & change management |
| S3.2 | `.github/workflows/ci.yml` + `docs/software-management.md` |

---

## Code Changes

### 1. `.github/workflows/ci.yml`
GitHub Actions workflow with two jobs:
- **ci**: triggers on every push and pull_request — runs `npm ci`, `npm run lint`, `npm test`, `npm run build`
- **deploy**: triggers only on push to `main`, after ci passes — deploys to Vercel via `vercel --prod` using `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` secrets

### 2. `app/api/health/route.ts`
Public GET endpoint. No authentication required. Returns JSON:
```json
{
  "status": "ok",
  "version": "1.2.0",
  "db": "connected",
  "latency_ms": 45,
  "timestamp": "2026-06-04T10:00:00Z"
}
```
Implementation: pings Supabase with a lightweight query (`select 1`), measures round-trip latency, reads version from `package.json`. Returns `status: "degraded"` if DB ping fails.

### 3. Supabase `incidents` table
SQL migration added to `lib/db/schema.ts` (Drizzle) and applied via Supabase dashboard:
```sql
create table incidents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  detected_at timestamptz not null,
  resolved_at timestamptz,
  severity text check (severity in ('low', 'medium', 'high', 'critical')) not null,
  title text not null,
  description text,
  root_cause text,
  resolution text,
  created_at timestamptz default now()
);
alter table incidents enable row level security;
create policy "Users manage own incidents" on incidents
  for all using (user_id = auth.uid());
```

### 4. `app/admin/page.tsx`
In-app admin dashboard, protected by existing Supabase middleware (no new auth needed — redirects to login if unauthenticated). Four cards:

- **System Health** — live fetch to `/api/health`, shows DB status, latency, version
- **AI Usage Stats** — aggregated query on `ai_logs`: total calls (7d/30d/all-time), avg latency, total tokens in/out, model breakdown (GPT-4o mini vs Gemini)
- **State Events** — last 10 `overwhelm_events` rows with trigger, previous state, new state, timestamp
- **Incidents** — count of open vs resolved incidents, link to `/admin/incidents`

Implemented as a Next.js server component — reads from Supabase directly using the existing `supabaseServer` client (same pattern as other server-side pages in the codebase). No client-side TanStack Query needed; data is fetched at render time on the server.

### 5. `app/admin/incidents/page.tsx` + `app/api/incidents/route.ts`
Incidents CRUD:
- **List view**: table of all incidents sorted by `detected_at` desc, with severity badge, open/resolved status
- **Log incident** button: opens a form (title, severity select, description, root_cause, detected_at)
- **Resolve** button on each open incident: fills `resolved_at` + `resolution` inline
- API route handles POST (create) and PATCH (update/resolve), server-side, uses supabaseServer

### 6. `next.config.ts` — Security Headers
Add to `headers()` export:
```ts
'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' *.supabase.co api.openai.com generativelanguage.googleapis.com",
'X-Frame-Options': 'DENY',
'X-Content-Type-Options': 'nosniff',
'Referrer-Policy': 'strict-origin-when-cross-origin'
```

### 7. `.env.example`
Document every environment variable with description, whether required/optional, and example value. All secrets redacted. Serves as both onboarding guide and compliance artifact.

### 8. `CHANGELOG.md`
Semantic versioning log at repo root. Covers all past development grouped into releases (`v0.1.0` through `v1.2.0`). Format: `## [version] — date`, then `### Added / Fixed / Changed` subsections.

---

## Documentation Files

### `docs/technical-design.md`
Covers: I Design I2.1/I2.2/I2.3 + I Advise I2.1

Sections:
1. Infrastructure overview (ASCII architecture diagram: Browser → Vercel/Next.js → Supabase → OpenAI/Gemini)
2. Non-functional requirements table (performance targets, scalability, security, compliance/GDPR)
3. Architecture Decision Records (5 ADRs: Supabase over self-hosted Postgres, Vercel over VPS, dual-AI-provider fallback, Next.js App Router, Drizzle ORM)
4. Service catalog (what services LoadLight delivers, to whom, under what conditions)
5. SLA document (uptime target 99%, AI response <2s, data retention policy, support process)
6. Automated deployment description (CI/CD flow, IaC approach using Vercel + Supabase managed infra)

### `docs/security-and-analysis.md`
Covers: I Analysis I2.1/I2.2 + I Advise I2.2

Sections:
1. Infrastructure quality analysis (evaluate Vercel, Supabase, and AI providers against ISO/IEC 25010 quality characteristics)
2. Security threat analysis (threat model: data in transit, data at rest, auth, AI prompt injection, supply chain)
3. OWASP Top 10 checklist (each item: addressed / not applicable / mitigated — with evidence)
4. Security measures in place (RLS, SSR auth, CSP headers, input validation, AI moderation)
5. Security improvement proposals (3–5 actionable recommendations with priority and effort)
6. Incident analysis (2–3 documented real development incidents in structured format)

### `docs/operations-and-management.md`
Covers: I Realisation I2.1/I2.2/I2.3 + I Manage I2.1/I2.2/I2.3

Sections:
1. Infrastructure setup (Vercel + Supabase environment configuration, environment variables, RLS setup)
2. Monitoring setup (health endpoint, admin dashboard, external uptime monitoring via UptimeRobot)
3. Infrastructure test plan (test categories: connectivity, auth, RLS enforcement, health endpoint, security headers — with pass/fail criteria)
4. Management processes (change management flow: dev branch → CI → review → merge → auto-deploy)
5. New technology management (how AI model updates, Supabase version changes, Next.js upgrades are handled)
6. Service level reporting (SLA targets vs actuals, how admin page metrics map to SLA compliance)

### `docs/software-management.md`
Covers: S3.1 + S3.2

Sections:
1. CI/CD pipeline (GitHub Actions workflow annotated, what each step does and why)
2. Release management (semantic versioning strategy, CHANGELOG format, git tag process)
3. Configuration management (`.env.example` walkthrough, secrets management via Vercel env vars, no secrets in git)
4. Change management process (how features flow from idea → implementation → review → release)
5. Coordination with infrastructure management (how software releases coordinate with Supabase schema migrations and Vercel deploys)

---

## Admin Page — Data Queries

All queries use the existing `supabaseServer` client (already in the codebase). No new auth patterns introduced.

```ts
// AI usage stats (last 30 days)
supabase.from('ai_logs').select('model, tokens_in, tokens_out, latency_ms, created_at')
  .gte('created_at', thirtyDaysAgo)

// State events (last 10)
supabase.from('overwhelm_events').select('*').order('created_at', { ascending: false }).limit(10)

// Incidents summary
supabase.from('incidents').select('id, severity, resolved_at')
```

---

## Screenshots

After all code is deployed and docs are written, screenshots are taken of:
1. GitHub Actions CI run (green)
2. `/admin` dashboard with live data
3. `/admin/incidents` page
4. UptimeRobot monitor showing LoadLight uptime
5. `/api/health` JSON response in browser

Screenshots are embedded in the relevant docs as evidence.

---

## File Tree (new/modified files)

```
.github/
  workflows/
    ci.yml                          ← new
app/
  api/
    health/
      route.ts                      ← new
    incidents/
      route.ts                      ← new
  admin/
    page.tsx                        ← new
    incidents/
      page.tsx                      ← new
lib/
  db/
    schema.ts                       ← modified (add incidents table)
next.config.ts                      ← modified (add security headers)
.env.example                        ← new
CHANGELOG.md                        ← new
docs/
  technical-design.md               ← new
  security-and-analysis.md          ← new
  operations-and-management.md      ← new
  software-management.md            ← new
```

---

## Constraints & Assumptions

- GitHub Actions free tier is sufficient (public repo or private with free minutes)
- Vercel deployment via CLI requires `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` set as GitHub secrets
- UptimeRobot free tier monitors `/api/health` every 5 minutes
- No new auth patterns — admin page relies entirely on existing Supabase middleware
- Incidents table uses same RLS pattern as all other tables (`user_id = auth.uid()`)
- No staging environment — CI/CD goes straight to production on main (documented as a design decision in ADRs)
