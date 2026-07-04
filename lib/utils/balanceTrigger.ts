// Pure decision logic for the global balance-check popup: when to call the
// AI, when to show the result, and what the current workload "situation"
// fingerprint is (used for the anti-nag rule).

import type { BalanceVerdict, BalanceResult, AddItem } from './balance'

export interface SignatureTask {
  name: string
  category?: string | null
  done?: boolean
  estimated_minutes?: number | null
}

export interface DismissedRecord {
  sig: string
  verdict: BalanceVerdict
}

/**
 * Stable fingerprint of the active workload: sorted deduped name+category
 * keys plus the day load bucketed in 30-minute steps. Same tasks and a
 * similar load produce the same signature.
 */
export function taskSignature(tasks: SignatureTask[], loadMinutes: number): string {
  const keys = [...new Set(
    tasks
      .filter(t => !t.done)
      .map(t => `${(t.name ?? '').trim().toLowerCase()}||${(t.category ?? '').toLowerCase()}`),
  )].sort()
  const loadBucket = Math.floor(loadMinutes / 30)
  return `${keys.join(';')}#${loadBucket}`
}

/** Skip the AI call entirely when nothing changed since the last check. */
export function shouldSkipCheck(currentSig: string, lastCheckedSig: string | null): boolean {
  return currentSig === lastCheckedSig
}

/**
 * Anti-nag: show a non-ok verdict unless the user already dismissed the same
 * verdict for the same situation.
 */
export function shouldShowResult(
  verdict: BalanceVerdict,
  currentSig: string,
  lastDismissed: DismissedRecord | null,
): boolean {
  if (verdict === 'ok') return false
  if (lastDismissed && lastDismissed.sig === currentSig && lastDismissed.verdict === verdict) return false
  return true
}

// ─── Life-area coverage ──────────────────────────────────────────────────────

const AREAS: { label: string; categories: RegExp; keywords: RegExp }[] = [
  {
    label: 'physical activity',
    categories: /exercise|sport|fitness|gym|health/i,
    keywords: /\b(gym|run|running|jog|walk|swim|yoga|boxing|workout|exercise|bike|cycling|stretch|sport|football|basketball|tennis)\b/i,
  },
  {
    // "Admin" is household admin (trash, paperwork) in this app — not work
    label: 'work or study',
    categories: /work|study|school|university/i,
    keywords: /\b(work|study|report|homework|assignment|project|meeting|email|class|lecture|exam|learn)\b/i,
  },
  {
    label: 'social time',
    categories: /social|family|friends/i,
    keywords: /\b(call|meet|visit|friend|family|mom|dad|dinner with|hang out|date|party)\b/i,
  },
  {
    label: 'leisure or hobby',
    categories: /leisure|creative|hobby|fun/i,
    keywords: /\b(read|reading|draw|drawing|paint|music|guitar|piano|game|gaming|movie|hobby|write|writing|cook for fun)\b/i,
  },
]

/**
 * Core life areas with no active task. A chores-and-hygiene-only list returns
 * all four areas — used to tell the user concretely what is missing.
 */
export function missingLifeAreas(tasks: SignatureTask[]): string[] {
  const active = tasks.filter(t => !t.done)
  return AREAS
    .filter(area => !active.some(t =>
      area.categories.test(t.category ?? '') || area.keywords.test(t.name ?? ''),
    ))
    .map(a => a.label)
}

const AREA_SUGGESTIONS: Record<string, AddItem> = {
  'physical activity': { name: 'Go for a 20-minute walk', category: 'Exercise', reason: 'No physical activity on your list' },
  'work or study':     { name: 'One focused work block',  category: 'Work',     reason: 'No work or study on your list' },
  'social time':       { name: 'Call a friend or family', category: 'Personal', reason: 'No social time on your list' },
  'leisure or hobby':  { name: 'Read or enjoy a hobby',   category: 'Personal', reason: 'No leisure on your list' },
}

/**
 * Deterministic "too little" advisory for when the AI is unavailable: names
 * the missing areas and suggests one activity per area (max 3). Returns null
 * unless at least two areas are missing — one gap alone is not an alert.
 */
export function buildTooLittleResult(missing: string[]): BalanceResult | null {
  if (missing.length < 2) return null
  return {
    verdict: 'too_little',
    headline: 'Your list could use more variety',
    reason: `Nothing on your list covers: ${missing.join(', ')}. You might consider adding one of these.`,
    remove: [],
    add: missing.slice(0, 3).map(m => AREA_SUGGESTIONS[m]).filter(Boolean),
  }
}
