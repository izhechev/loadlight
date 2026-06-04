# Operations & Management

**Competencies covered:** I Realisation I2.1 · I Realisation I2.2 · I Realisation I2.3 · I Manage I2.1 · I Manage I2.2 · I Manage I2.3

---

## 1. Infrastructure Setup

### Prerequisites
- Node.js 20+
- A Supabase project (free tier sufficient)
- A Vercel account (free tier sufficient)
- A Google AI API key or OpenAI API key (at least one required; app runs in demo mode without either)

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
3. Copy the SQL migration block from `lib/db/schema.ts` (the block between the `──────` dividers)
4. Paste and run in the SQL Editor
5. Verify in **Table Editor** that all tables are created: `profiles`, `tasks`, `state_snapshots`, `overwhelm_events`, `ai_logs`, `incidents`

### Step 3: Configure Supabase Auth

1. In Supabase dashboard → **Authentication → Providers**: ensure Email provider is enabled
2. In **Authentication → URL Configuration**: set Site URL to your Vercel production URL
3. Add `http://localhost:3000` to Additional Redirect URLs for local development

### Step 4: Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
# Follow prompts to link to your Vercel account and project
```

Or connect the GitHub repository to Vercel via the dashboard for automatic deployments on every push to `main`.

### Step 5: Configure Vercel environment variables

In Vercel dashboard → Project → **Settings → Environment Variables**, add:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `GOOGLE_API_KEY`
- `OPENAI_API_KEY` (optional)

### Step 6: Configure GitHub Actions secrets

In GitHub repository → **Settings → Secrets and variables → Actions**, add:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `VERCEL_TOKEN` (from vercel.com → Settings → Tokens)
- `VERCEL_ORG_ID` (from `.vercel/project.json` after first `vercel` deploy)
- `VERCEL_PROJECT_ID` (from `.vercel/project.json`)

### Performance & Scalability

**Scalability:** Vercel serverless functions auto-scale to handle traffic spikes with no manual intervention. Supabase uses PgBouncer connection pooling to efficiently handle concurrent database connections.

**Compliance:** User data is stored in the EU (Supabase Frankfurt region). No PII is sent to AI providers. Users can export and delete their data via Settings → Data Management.

---

## 2. Monitoring Setup

### Health Endpoint

LoadLight exposes a public health check endpoint:

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
   - Alert contact: developer email
3. UptimeRobot sends an email alert if the endpoint returns non-200 or times out
4. The public status page URL serves as external evidence of uptime monitoring

### In-App Admin Dashboard

The admin dashboard at `/admin` provides live operational metrics for authenticated users:

| Metric | Source | Interpretation |
|---|---|---|
| System status | `/api/health` | DB connectivity, latency, app version |
| AI call volume | `ai_logs` | Total calls all-time, model breakdown, avg latency |
| Token usage | `ai_logs` | Total tokens in/out (cost indicator) |
| State transitions | `overwhelm_events` | Recent Normal/Elevated/Overwhelmed transitions |
| Incidents | `incidents` | Open vs resolved incident count |

### Interpreting Metrics

- **High AI latency (avg > 2000ms):** Gemini API may be under load; consider switching primary provider
- **DB latency > 500ms:** Supabase may be under load; check [status.supabase.com](https://status.supabase.com)
- **Open incidents > 0:** Review `/admin/incidents` and resolve outstanding issues

### Screenshots

_Screenshots below are taken from the live production deployment:_

<!-- Add screenshots here after deployment:
![Admin Dashboard](/docs/screenshots/admin-dashboard.png)
![Health Endpoint](/docs/screenshots/health-endpoint.png)
![UptimeRobot Monitor](/docs/screenshots/uptimerobot.png)
-->

---

## 3. Infrastructure Test Plan

The following test plan verifies LoadLight meets its non-functional requirements.

### Test Category 1: Connectivity

| Test ID | Test | Method | Pass Criterion |
|---|---|---|---|
| CON-01 | Application loads in browser | Navigate to production URL | Page renders within 3s; no console errors |
| CON-02 | Health endpoint responds | `GET /api/health` | HTTP 200; JSON with `status` field |
| CON-03 | DB connectivity | Check `db` field in health response | Value is `"connected"` |
| CON-04 | AI provider available | Submit task extraction via UI | Task extracted successfully |

### Test Category 2: Authentication

| Test ID | Test | Method | Pass Criterion |
|---|---|---|---|
| AUTH-01 | Unauthenticated access to tasks | Navigate to `/tasks` without login | Redirected to `/login` |
| AUTH-02 | Unauthenticated access to admin | Navigate to `/admin` without login | Redirected to `/login` |
| AUTH-03 | Login with valid credentials | Submit login form | Redirected to `/dashboard`; session cookie set |
| AUTH-04 | Login with invalid credentials | Submit login form with wrong password | Error message shown; no session created |
| AUTH-05 | Session persistence | Login, close tab, reopen URL | Session still active within JWT expiry |

### Test Category 3: Row Level Security

| Test ID | Test | Method | Pass Criterion |
|---|---|---|---|
| RLS-01 | User A cannot read User B's tasks | Direct Supabase query with User A's session for User B's `user_id` | Empty result (0 rows) |
| RLS-02 | Unauthenticated query on tasks | Supabase REST query with no auth header | HTTP 401 or empty result |
| RLS-03 | User can only modify own incidents | PATCH on incident with different `user_id` | No rows updated |

### Test Category 4: Health Endpoint

| Test ID | Test | Method | Pass Criterion |
|---|---|---|---|
| HLT-01 | Endpoint is publicly accessible | `GET /api/health` without auth | HTTP 200 |
| HLT-02 | Response has all required fields | Parse JSON response | `status`, `version`, `db`, `latency_ms`, `timestamp` all present |
| HLT-03 | Latency is reasonable | Check `latency_ms` | < 1000ms |
| HLT-04 | Version matches package.json | Compare `version` field | Matches `version` in `package.json` |

### Test Category 5: Security Headers

| Test ID | Test | Method | Pass Criterion |
|---|---|---|---|
| SEC-01 | X-Frame-Options present | `curl -I https://loadlight.vercel.app/` | `X-Frame-Options: DENY` in response headers |
| SEC-02 | CSP header present | Same curl command | `Content-Security-Policy` header with `default-src 'self'` |
| SEC-03 | X-Content-Type-Options present | Same curl command | `X-Content-Type-Options: nosniff` |
| SEC-04 | Referrer-Policy present | Same curl command | `Referrer-Policy: strict-origin-when-cross-origin` |

**Command to run all security header tests at once:**
```bash
curl -I https://loadlight.vercel.app/ | grep -E "(X-Frame|Content-Security|X-Content-Type|Referrer)"
```

### Test Execution Record

| Test Run | Date | Tester | Pass/Fail |
|---|---|---|---|
| Initial | 2026-06-04 | Ivan Zhechev | All categories pass |

---

## 4. Management Processes

### Change Management Flow

All changes to LoadLight follow this process:

```
1. IDENTIFY   → Developer identifies bug, improvement, or requirement
                 Source: user feedback, incident analysis, self-testing

2. DEVELOP    → Create feature branch from main
                 Branch naming: feat/*, fix/*, docs/*, ci/*, security/*

3. IMPLEMENT  → Write code; run tests locally (npm test)
                 All tests must pass before proceeding

4. REVIEW     → Self-review via git diff; check for security issues
                 For significant changes: use /code-review

5. CI CHECK   → Push branch; GitHub Actions: lint + test + build
                 All checks must be green before merge

6. MERGE      → Merge to main via GitHub
                 Merge triggers automatic Vercel deployment

7. VERIFY     → Check /api/health post-deploy
                 Monitor Vercel function logs for first 5 minutes

8. DOCUMENT   → Update CHANGELOG.md [Unreleased] section
                 Tag a release for significant milestones
```

### Incident Management Process

When a production incident is detected:

1. **Detect** — UptimeRobot alert, user report, or admin dashboard anomaly
2. **Log** — Create entry in `/admin/incidents` with severity, description, `detected_at`
3. **Triage** — Assess severity: critical / high / medium / low
4. **Investigate** — Check Vercel function logs and `ai_logs`/`overwhelm_events` for context
5. **Fix** — Apply fix via Change Management Flow (`fix/*` branch prefix)
6. **Resolve** — Update incident in `/admin/incidents` with `resolution` text and `resolved_at`
7. **Post-mortem** — For medium+ severity: document root cause in `docs/security-and-analysis.md`

---

## 5. New Technology Management

### Node.js / Next.js upgrades
Pin exact Next.js version in `package.json`. Upgrade only when a new version provides a required feature or security fix. Test in a separate branch; CI must pass before merging.

### Supabase upgrades
The Supabase JS client (`@supabase/supabase-js`) is updated on minor versions via `npm update`. Major version upgrades require reviewing the migration guide and testing auth flows. Supabase platform (PostgreSQL version, Auth) upgrades automatically — monitor [status.supabase.com](https://status.supabase.com) for maintenance windows.

### AI model upgrades
AI model selection is configurable in `app/api/chat/route.ts`. When a new model becomes available, evaluate it against the current model on latency and output quality, then update the model identifier. No breaking schema changes are required for model swaps.

### Security patches
`npm audit` runs in every CI build. If a high-severity vulnerability is found, a `security/patch` branch is created immediately; standard change management flow applies with expedited merge.

---

## 6. Service Level Reporting

The following metrics map directly to the SLA targets defined in `docs/technical-design.md`.

### How to read the admin dashboard for SLA compliance

| SLA Metric | Where to check | How to calculate |
|---|---|---|
| Uptime ≥ 99% | UptimeRobot dashboard | `(total_minutes - downtime_minutes) / total_minutes × 100` |
| AI response ≤ 2s p95 | `ai_logs` via admin dashboard | Sort `latency_ms` ascending, take 95th percentile value |
| Open incidents | `/admin/incidents` | Count rows where `resolved_at IS NULL` |

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
