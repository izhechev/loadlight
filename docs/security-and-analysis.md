# Security & Infrastructure Analysis

**Competencies covered:** I Analysis I2.1 · I Analysis I2.2 · I Advise I2.2

---

## 1. Infrastructure Quality Analysis

Evaluated against **ISO/IEC 25010** quality characteristics for software and systems.

| Quality Characteristic | Sub-characteristic | Assessment | Evidence |
|---|---|---|---|
| **Reliability** | Availability | Good | Vercel 99.99% SLA; Supabase 99.9% SLA; AI mock fallback prevents total AI outage |
| **Reliability** | Fault tolerance | Moderate | AI mock fallback for offline mode; no graceful degradation UI for DB outage |
| **Security** | Confidentiality | Good | RLS enforces per-user data isolation; no cross-user data access possible at DB level |
| **Security** | Integrity | Good | Supabase CHECK constraints, NOT NULL, FK constraints prevent invalid data; input sanitised before AI |
| **Security** | Non-repudiation | Moderate | `ai_logs` and `overwhelm_events` provide audit trail; logs are not tamper-evident |
| **Performance efficiency** | Time behaviour | Good | AI calls capped at 2000 chars; Gemini 2.5 Flash is fast (< 2s typical); latency logged in `ai_logs` |
| **Performance efficiency** | Resource utilisation | Good | Serverless (pay-per-request); no idle compute cost; Vercel free tier handles current scale |
| **Maintainability** | Modularity | Good | Clean separation: `lib/data`, `lib/store`, `lib/utils`, `app/api`, `app/(pages)` |
| **Maintainability** | Testability | Moderate | 92% statement coverage on utility modules; API routes and UI components not unit-tested |
| **Portability** | Adaptability | Good | Demo mode (localStorage fallback) works without Supabase; AI providers are swappable |

**Summary:** The infrastructure performs well on security, reliability, and performance for its scale. The primary gap is the absence of automated integration tests for API routes and a lack of graceful DB-down error handling in the UI.

---

## 2. Security Threat Analysis

Threat model using **STRIDE** methodology:

| Threat | STRIDE Category | Attack Vector | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| Accessing another user's tasks | Spoofing / Information Disclosure | Crafted Supabase query with different `user_id` | Low | High | **RLS:** `auth.uid() = user_id` on all tables — DB rejects cross-user queries at PostgreSQL level |
| Session hijacking | Spoofing | Stolen JWT or session cookie | Medium | High | Supabase JWTs are short-lived (1h); SSR middleware refreshes on each request; `HttpOnly` cookies |
| AI prompt injection | Tampering | Input containing "ignore previous instructions" | Medium | Medium | `sanitise()` in `app/api/chat/route.ts` strips injection patterns; 2000-char hard cap; ethical system prompt |
| Excessive AI token usage (abuse) | Denial of Service | Automated requests to `/api/chat` | Low | Medium | Supabase Auth required for meaningful use; Vercel rate limiting configurable |
| PII leakage to AI providers | Information Disclosure | AI logs storing user input text | Low | High | AI logs store metadata only (model, tokens, latency) — input/output text never stored |
| Supply chain attack | Tampering | Malicious npm package | Low | High | `npm audit` runs in CI; `package-lock.json` pins exact versions |
| Insecure direct object reference | Information Disclosure | Guessing incident/task UUIDs | Low | Medium | UUIDs are unguessable (128-bit random); RLS blocks access regardless of UUID knowledge |
| Clickjacking | Tampering | Embedding app in iframe | Low | Low | `X-Frame-Options: DENY` header prevents all iframe embedding |
| MIME type confusion | Tampering | Browser interpreting wrong content type | Low | Low | `X-Content-Type-Options: nosniff` prevents MIME sniffing |

---

## 3. OWASP Top 10 (2021) Checklist

| # | Risk | Status | Evidence / Notes |
|---|---|---|---|
| A01 | Broken Access Control | **Mitigated** | Supabase RLS on every table; all queries server-validated; no IDOR possible |
| A02 | Cryptographic Failures | **Mitigated** | All traffic over HTTPS (enforced by Vercel); passwords managed by Supabase Auth (bcrypt); JWTs signed |
| A03 | Injection | **Mitigated** | Supabase JS client uses parameterised queries (no raw SQL from user input); AI input sanitised |
| A04 | Insecure Design | **Mitigated** | RLS-first design; AI logs store no PII; ethical constraints hardcoded in system prompt; not user-configurable |
| A05 | Security Misconfiguration | **Partially mitigated** | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy headers added; `unsafe-eval` remains in CSP (required by Next.js build tooling — see improvement proposals) |
| A06 | Vulnerable and Outdated Components | **Monitored** | `npm audit` runs in CI pipeline; all dependencies on recent major versions |
| A07 | Identification and Authentication Failures | **Mitigated** | Supabase Auth manages signup/login/session; SSR session validation on server-side routes; no custom auth code |
| A08 | Software and Data Integrity Failures | **Partially mitigated** | `package-lock.json` pins exact versions; `npm ci` in CI enforces lockfile; no code signing |
| A09 | Security Logging and Monitoring Failures | **Mitigated** | `ai_logs` tracks all AI calls; `overwhelm_events` audits state transitions; `/admin` dashboard surfaces metrics; UptimeRobot monitors availability |
| A10 | Server-Side Request Forgery | **Not applicable** | No user-controlled URLs are fetched server-side |

---

## 4. Security Measures in Place

### Row Level Security (RLS)
Every table in the database has RLS enabled with a policy that restricts all operations to the row owner:
```sql
create policy "own [table]" on [table] for all using (auth.uid() = user_id);
```
This means that even if the application layer has a bug, the database itself will reject unauthorised queries. RLS is the primary security control for data isolation.

### SSR Authentication
`lib/supabase/server.ts` creates a server-side Supabase client reading the session from `HttpOnly` cookies. This prevents session tokens from being accessible to JavaScript (XSS resistance). Session is refreshed on every server-side render.

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
This removes common XSS characters, prompt injection patterns, and enforces a 2000-character token cap.

### Content Security Policy
Added in `next.config.ts`. Restricts which origins can execute scripts and make connections:
- `connect-src` — only allows connections to Supabase, OpenAI, and Google AI
- `frame-ancestors 'none'` — prevents clickjacking
- `X-Frame-Options: DENY` — legacy browser support for same protection

### Ethical AI Constraints
The `ETHICAL_SYSTEM_PROMPT` in `app/api/chat/route.ts` is hardcoded and not user-configurable. It restricts the AI from making clinical assessments, using directive language ("you must"), or discussing topics outside task management scope.

---

## 5. Security Improvement Proposals

| Priority | Proposal | Effort | Benefit |
|---|---|---|---|
| High | Replace `unsafe-eval` in CSP with Next.js nonce-based approach | Medium | Eliminates the most significant remaining XSS vector in the CSP |
| High | Enable Supabase Auth rate limiting on login endpoint | Low | Prevents brute-force password attacks — configurable in Supabase dashboard → Auth → Rate Limits |
| Medium | Add `npm audit --audit-level=high` as a CI gate | Low | Fails the build on high-severity dependency vulnerabilities, preventing known-vulnerable deploys |
| Medium | Enable Vercel WAF (Web Application Firewall) | Low | Blocks common attack patterns (SQLi attempts, scanner traffic) at the edge before hitting the app — available on Vercel Pro |
| Low | Implement CSP reporting endpoint (`report-uri`) | Low | Collects real-world CSP violation data to detect injection attempts in production |

---

## 6. Incident Analysis

### Incident 001 — AI Response Silent Failure (Gemini Markdown Wrapping)

**Date:** 2026-04-15 | **Severity:** Medium | **Status:** Resolved

**Description:** During development testing, AI advisory returned empty or incorrect responses without surfacing any error to the user.

**Root cause:** The Gemini API returned a valid HTTP 200 response but the JSON body was wrapped in markdown code fences (` ```json ... ``` `). The JSON parser expected raw JSON and threw a silent parse error, causing the route to fall through to the mock fallback without logging the failure.

**Resolution:** Added a regex strip for markdown code fences immediately before `JSON.parse()` in `generateWithGemini()`:
```ts
textContent = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
```
Fix is present in `app/api/chat/route.ts` lines 26–29.

**Lesson learned:** AI API responses must always be defensively parsed. Never assume the model returns raw JSON even when instructed with `responseMimeType: 'application/json'`.

---

### Incident 002 — Recurring Task Duplication in Dashboard Metrics

**Date:** 2026-05-25 | **Severity:** Low | **Status:** Resolved

**Description:** Dashboard completion counts were inflated — recurring tasks appeared multiple times in all-time totals.

**Root cause:** The dashboard aggregation queries fetched all task rows including multiple recurring instances. The deduplication logic (`deduplicateRecurringTasks`) that existed in the task list view was not applied to dashboard metric calculations — each view had its own inline aggregation.

**Resolution:** Applied the shared `deduplicateRecurringTasks` utility to all dashboard metric calculations. Committed in `fix(dashboard): deduplicate recurring tasks in all dashboard metrics` (commit `d6a3941`).

**Lesson learned:** Shared data transformation logic must be extracted into reusable utilities rather than inline-implemented per view. If the same transformation is needed in more than one place, it belongs in `lib/utils/`.

---

### Incident 003 — Chill Mode Lock Bypass via Page Reload

**Date:** 2026-05-28 | **Severity:** Low | **Status:** Resolved

**Description:** Reloading the Settings page allowed mode switching even while the Chill Guy mode lock was active.

**Root cause:** The lock duration was being compared against a hardcoded 30-day value rather than reading `mode_locked_until` from localStorage. On page reload, the React component re-initialised with a fresh state, bypassing the in-memory lock check.

**Resolution:** Changed mode lock check to always read the `mode_locked_until` timestamp from localStorage (single source of truth); removed the hardcoded duration constant. User is now asked for a custom duration at time of lock. Committed in `feat(settings): ask user for chill lock duration instead of hardcoding 30 days` (commit `bc4f25e`).

**Lesson learned:** Configurable values should never be hardcoded in component state — always read from the persistent single source of truth (localStorage, database, or config). In-memory state is lost on reload.
