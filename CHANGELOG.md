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
