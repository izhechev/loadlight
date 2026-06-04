# Software Management

**Competencies covered:** S3.1 (Configuration, Change & Release Management) · S3.2 (Development Pipeline with Automated Build & Test Infrastructure)

---

## 1. CI/CD Pipeline (S3.2)

The CI/CD pipeline is defined in `.github/workflows/ci.yml` and runs automatically on GitHub Actions.

### Pipeline Architecture

```
Developer pushes code to GitHub
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
│        catch TypeScript errors early     │
│                                           │
│  5. npm test                              │
│     └─ Vitest — run all .test.ts files   │
│        92 tests, all must pass           │
│                                           │
│  6. npm run build                         │
│     └─ Next.js production build          │
│        TypeScript full type-check        │
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
│        New immutable deployment created  │
│        Production traffic switched only  │
│        when new build is fully ready     │
└───────────────────────────────────────────┘
```

### Why each step exists

| Step | Purpose |
|---|---|
| `npm ci` | Uses `package-lock.json` for exact reproducible installs — no "works on my machine" surprises |
| `npm run lint` | Catches code quality issues and TypeScript errors early — cheaper to fix in CI than in production |
| `npm test` | Verifies business logic (state machine, task utilities) hasn't regressed — 92 tests covering critical paths |
| `npm run build` | Full TypeScript compile + Next.js optimisation — catches type errors before they reach users |
| `vercel --prod` | Atomic deployment — Vercel switches production traffic only after the new build is fully ready |

### Trigger conditions

| Event | Jobs that run |
|---|---|
| Push to any branch | `ci` only |
| Pull request to `main` | `ci` only |
| Push to `main` | `ci` → `deploy` (sequential, deploy only if ci passes) |

### Required GitHub Secrets

| Secret | Source | Used in |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | `build` step |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Settings → API | `build` step |
| `VERCEL_TOKEN` | vercel.com → Settings → Tokens | `deploy` step |
| `VERCEL_ORG_ID` | `.vercel/project.json` | `deploy` step |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` | `deploy` step |

### Screenshots

_Screenshot of a passing CI/CD run in GitHub Actions:_

<!-- Add screenshot after first successful CI run:
![GitHub Actions CI Run](screenshots/github-actions-ci.png)
-->

---

## 2. Release Management (S3.1)

### Semantic Versioning

LoadLight uses [Semantic Versioning 2.0.0](https://semver.org/):

```
MAJOR.MINOR.PATCH
  │     │     └─ Bug fix, performance improvement, dependency patch
  │     └─ New feature, backwards-compatible
  └─ Breaking change (e.g., schema migration requiring data migration)
```

Current version: `0.1.0` — pre-1.0 development phase. Version `1.0.0` marks the first stable production release.

### Release Process

1. **During development:** Add changes to `## [Unreleased]` section of `CHANGELOG.md`
2. **When releasing:**
   ```bash
   # Update version in package.json (npm version handles this)
   npm version minor   # or: patch | major

   # Move [Unreleased] entries to new version in CHANGELOG.md
   # Example: ## [0.2.0] — 2026-06-15

   # Commit and tag
   git add CHANGELOG.md package.json
   git commit -m "chore: release v0.2.0"
   git tag v0.2.0
   git push origin main --tags
   ```
3. **CI/CD picks up the push to main** and deploys automatically
4. **Verify** the release on production via `/api/health` — check the `version` field matches

### CHANGELOG format

LoadLight follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/):
- `### Added` — new features
- `### Changed` — changes to existing features
- `### Fixed` — bug fixes
- `### Removed` — removed features
- `### Security` — security patches

---

## 3. Configuration Management (S3.1)

### Environment variables

All environment variables are documented in `.env.example`. Variables fall into two categories:

| Category | Variables | Storage location |
|---|---|---|
| **Public** (safe to expose in browser) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel env vars (public), GitHub Actions secrets |
| **Secret** (server-only, never in browser) | `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `VERCEL_TOKEN` | Vercel env vars (secret), GitHub Actions secrets |

**Rules:**
- `.env.local` is in `.gitignore` — never committed to git
- `.env.example` contains only descriptions and placeholders — safe to commit
- All secrets in production are managed via Vercel's encrypted environment variable store
- GitHub Actions secrets are encrypted and only exposed to the specific job step that needs them

### Infrastructure as Code

All infrastructure configuration is stored in the repository:

| Artifact | What it configures |
|---|---|
| `.github/workflows/ci.yml` | CI/CD pipeline — lint, test, build, deploy automation |
| `next.config.ts` | Application config, security response headers |
| `lib/db/schema.ts` | Database schema (Drizzle type definitions + SQL migration comment block) |
| `.env.example` | Environment variable contract — documents all required variables |

### Dependency management

- `package-lock.json` pins exact versions of every dependency for reproducible builds
- `npm ci` (not `npm install`) is used in CI — fails if `package-lock.json` is out of sync
- `npm audit` runs as part of every CI build — vulnerabilities are surfaced before deployment

---

## 4. Change Management Process (S3.1)

### Branch strategy

```
main (production — protected, auto-deploys on push)
 ├── feat/admin-dashboard
 ├── fix/ai-fallback-parsing
 ├── docs/infrastructure-docs
 ├── ci/github-actions
 └── security/csp-headers
```

All development happens on feature branches. Merging to `main` triggers the deploy job automatically.

### Commit conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

Types:   feat, fix, docs, ci, refactor, test, chore, security
Scopes:  (api), (admin), (db), (auth), (ui) — optional

Examples:
feat(admin): add incidents CRUD page with severity badges
fix(dashboard): deduplicate recurring tasks in all metrics
ci: add GitHub Actions pipeline with lint, test, build, deploy
security: add CSP and X-Frame-Options response headers
docs: add technical-design.md covering ADRs and SLA
```

### Code review

For significant changes, use `/code-review` in Claude Code to analyse the diff before merging. All changes must pass CI (lint, test, build) before the deploy job runs.

---

## 5. Coordination with Infrastructure Management (S3.1)

### Software release → Infrastructure actions

| Software change | Infrastructure action required |
|---|---|
| New database table or column | Run SQL migration in Supabase SQL Editor before deploying the application code |
| New environment variable | Add to Vercel env vars AND GitHub Actions secrets before pushing to main |
| New external API dependency | Add domain to CSP `connect-src` in `next.config.ts` |
| Version bump | Update `version` in `package.json`; verify `/api/health` returns new version post-deploy |
| Security header change | Test locally with `curl -I localhost:3000`; verify headers in production post-deploy |

### Database migration coordination

Schema changes follow this manual coordination process (see ADR-005 in `docs/technical-design.md`):

1. Add new SQL to the migration comment block in `lib/db/schema.ts`
2. Add the Drizzle type definition to the same file
3. Apply SQL in Supabase SQL Editor (production project)
4. Deploy the application code to Vercel (via push to main → CI/CD)
5. Verify the feature works in production
6. Update `CHANGELOG.md`

**Rule:** The database migration **always runs before** the application code that references the new table/column. Reversing this order causes runtime errors that are hard to diagnose.
