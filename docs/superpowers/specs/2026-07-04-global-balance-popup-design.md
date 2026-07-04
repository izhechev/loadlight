# Global Balance-Check Popup — Design

**Date:** 2026-07-04
**Status:** Approved

## Problem

The balance-check feature (AI verdict `too_much` / `ok` / `too_little` with remove/add
suggestions, shown in `BalancePopup`) only triggers once when the dashboard page mounts.
Users on `/tasks`, `/categories`, or `/settings` never see it, and adding a pile of tasks
after the dashboard loaded produces no alert.

## Goal

Show the same in-app Balance Check popup on any app page, triggered on app open **and**
after task changes, with an anti-nag rule so an unchanged situation never re-alerts.
No browser/system notifications (explicitly out of scope — user decision).

## Architecture

### New: `components/balance-check-provider.tsx` (client)
Mounted once in `app/layout.tsx`. Renders `<BalancePopup>` when an alert is active,
otherwise nothing.

- **Page gating:** active only when `usePathname()` starts with `/dashboard`, `/tasks`,
  `/categories`, or `/settings`. Silent on `/` (landing), `/login`, `/onboarding`,
  `/admin`, `/auth`.
- Owns popup open/close state and the hide/delete/add action handlers (same behavior
  as the dashboard's current handlers, using the data layer).

### New: `lib/hooks/useBalanceCheck.ts`
The trigger logic currently inlined in `app/dashboard/page.tsx` (~lines 320–376),
extracted verbatim in behavior:

1. Load active tasks via `lib/data/tasks.ts`.
2. Compute `dayLoadMinutes`, `toughDayThreshold(balanceMode)`, `countRecentToughDays`
   (including today, as the dashboard does now).
3. POST `/api/chat` with `mode: 'balance-check'`.
4. On AI failure or `ok` verdict on a tough day: fall back to local
   `buildToughDayResult` (unchanged).

### New: `lib/utils/balanceTrigger.ts` (pure, unit-tested)
- `taskSignature(tasks, loadMinutes)` — sorted deduped `name||category` keys plus the
  day-load rounded to 30-minute buckets, joined into a string.
- `shouldSkipCheck(currentSig, lastCheckedSig)` — true when identical (saves the AI call).
- `shouldShowResult(verdict, currentSig, lastDismissed: {sig, verdict} | null)` — false
  when the verdict **and** signature match the last dismissed alert.

### Modified: `lib/data/tasks.ts`
Every successful mutation (add / update / toggle / delete) dispatches
`window.dispatchEvent(new CustomEvent('loadlight:tasks-changed'))`. One line per
mutation; identical in demo (localStorage) and Supabase modes.

### Modified: `app/layout.tsx`
Mount the provider around/next to `{children}`.

### Modified: `app/dashboard/page.tsx`
Delete the inlined balance-check effect, `balanceFetched` ref, `balanceResult` /
`showBalance` state and its `BalancePopup` render — the provider is the single source
of popups.

## Trigger flow

```
mount (any gated page) ──────────────► run check
'loadlight:tasks-changed' event ──► debounce 20s after LAST event ──► run check

run check:
  signature unchanged since last check? ──► skip (no API call)
  state === overwhelmed or 0 active tasks? ─► skip
  else POST balance-check
     verdict ok ──► tough-day fallback or nothing
     verdict too_much/too_little:
         matches last DISMISSED {sig, verdict} in localStorage? ─► stay quiet
         else ─► show BalancePopup
on dismiss ──► persist {sig, verdict} to localStorage ('loadlight-balance-dismissed')
```

## Kept guardrails (unchanged)

- Suppressed in Rest Mode / overwhelmed state and with an empty task list.
- Recurring tasks deduplicated by name+category before analysis.
- Health/medication tasks never appear in `remove`.
- Neutral, non-clinical language enforced by the existing `ETHICAL_SYSTEM_PROMPT`.

## Error handling

- AI/network failure → existing `buildToughDayResult` local fallback.
- localStorage unavailable → treat as "nothing dismissed" (popup may re-show; fail open).
- Event listener registered/removed with the provider's lifecycle; debounce timer
  cleared on unmount.

## Testing

- Unit tests for `balanceTrigger.ts` (signature stability, bucket edges, skip/show
  decisions) following the `lib/utils/toughDays.test.ts` pattern.
- `npm run build` must pass with zero TypeScript errors.
- Manual: add tasks on `/tasks` page → popup appears there ~20s after last add;
  dismiss → no re-show until the task mix changes; landing/login stay silent.
