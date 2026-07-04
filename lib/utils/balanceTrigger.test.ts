import { describe, it, expect } from 'vitest'
import {
  taskSignature,
  shouldSkipCheck,
  shouldShowResult,
  missingLifeAreas,
  buildTooLittleResult,
} from './balanceTrigger'

const t = (name: string, category = 'Personal', done = false, estimated_minutes: number | null = 30) =>
  ({ name, category, done, estimated_minutes })

// ─── taskSignature ───────────────────────────────────────────────────────────
// Stable fingerprint of the active workload: same tasks + similar load = same
// signature; adding a task or a big load swing changes it.

describe('taskSignature', () => {
  it('is stable across task order', () => {
    const a = taskSignature([t('Bath'), t('Shave')], 60)
    const b = taskSignature([t('Shave'), t('Bath')], 60)
    expect(a).toBe(b)
  })

  it('ignores completed tasks', () => {
    const a = taskSignature([t('Bath'), t('Old', 'Personal', true)], 60)
    const b = taskSignature([t('Bath')], 60)
    expect(a).toBe(b)
  })

  it('changes when a task is added', () => {
    const a = taskSignature([t('Bath')], 60)
    const b = taskSignature([t('Bath'), t('Gym')], 60)
    expect(a).not.toBe(b)
  })

  it('deduplicates recurring copies (same name+category counts once)', () => {
    const a = taskSignature([t('Meds'), t('Meds')], 60)
    const b = taskSignature([t('Meds')], 60)
    expect(a).toBe(b)
  })

  it('buckets load in 30-minute steps: small drift same, big swing different', () => {
    expect(taskSignature([t('Bath')], 60)).toBe(taskSignature([t('Bath')], 75))
    expect(taskSignature([t('Bath')], 60)).not.toBe(taskSignature([t('Bath')], 200))
  })

  it('is case-insensitive on names', () => {
    expect(taskSignature([t('bath')], 60)).toBe(taskSignature([t('Bath')], 60))
  })
})

// ─── shouldSkipCheck ─────────────────────────────────────────────────────────

describe('shouldSkipCheck', () => {
  it('skips when the signature has not changed since the last check', () => {
    expect(shouldSkipCheck('sig-a', 'sig-a')).toBe(true)
  })

  it('runs when the signature changed or there was no previous check', () => {
    expect(shouldSkipCheck('sig-a', 'sig-b')).toBe(false)
    expect(shouldSkipCheck('sig-a', null)).toBe(false)
  })
})

// ─── shouldShowResult ────────────────────────────────────────────────────────

describe('shouldShowResult', () => {
  it('never shows an ok verdict', () => {
    expect(shouldShowResult('ok', 'sig-a', null)).toBe(false)
  })

  it('shows too_much / too_little when nothing was dismissed before', () => {
    expect(shouldShowResult('too_much', 'sig-a', null)).toBe(true)
    expect(shouldShowResult('too_little', 'sig-a', null)).toBe(true)
  })

  it('stays quiet when the same verdict+signature was already dismissed', () => {
    expect(shouldShowResult('too_much', 'sig-a', { sig: 'sig-a', verdict: 'too_much' })).toBe(false)
  })

  it('shows again when the situation or verdict changed since dismissal', () => {
    expect(shouldShowResult('too_much', 'sig-b', { sig: 'sig-a', verdict: 'too_much' })).toBe(true)
    expect(shouldShowResult('too_little', 'sig-a', { sig: 'sig-a', verdict: 'too_much' })).toBe(true)
  })
})

// ─── missingLifeAreas ────────────────────────────────────────────────────────
// Which core life areas have no active task: physical, work/study, social,
// leisure. Used to tell the user concretely what their list is missing.

describe('missingLifeAreas', () => {
  it('flags all areas missing for a pure chores/hygiene list', () => {
    const areas = missingLifeAreas([t('Take meds'), t('Bath'), t('Shave'), t('Clean apartment'), t('Throw trash', 'Admin')])
    expect(areas).toContain('physical activity')
    expect(areas).toContain('work or study')
    expect(areas).toContain('social time')
    expect(areas).toContain('leisure or hobby')
  })

  it('recognises exercise by category', () => {
    const areas = missingLifeAreas([t('Boxing', 'Exercise'), t('Bath')])
    expect(areas).not.toContain('physical activity')
  })

  it('recognises exercise by name keywords', () => {
    const areas = missingLifeAreas([t('Go for a run'), t('Bath')])
    expect(areas).not.toContain('physical activity')
  })

  it('recognises work by category and study keywords', () => {
    expect(missingLifeAreas([t('Finish report', 'Work')])).not.toContain('work or study')
    expect(missingLifeAreas([t('Study math')])).not.toContain('work or study')
  })

  it('recognises social and leisure activities', () => {
    const areas = missingLifeAreas([t('Call mom'), t('Read a book')])
    expect(areas).not.toContain('social time')
    expect(areas).not.toContain('leisure or hobby')
  })

  it('ignores completed tasks', () => {
    const areas = missingLifeAreas([t('Boxing', 'Exercise', true)])
    expect(areas).toContain('physical activity')
  })
})

// ─── buildTooLittleResult ────────────────────────────────────────────────────
// Local fallback when the AI is unavailable: names the missing areas and
// suggests one concrete activity per missing area.

describe('buildTooLittleResult', () => {
  it('returns null when fewer than 2 areas are missing', () => {
    expect(buildTooLittleResult(['physical activity'])).toBeNull()
    expect(buildTooLittleResult([])).toBeNull()
  })

  it('builds a too_little verdict naming the missing areas', () => {
    const r = buildTooLittleResult(['physical activity', 'social time'])!
    expect(r.verdict).toBe('too_little')
    expect(r.reason.toLowerCase()).toContain('physical activity')
    expect(r.reason.toLowerCase()).toContain('social time')
  })

  it('suggests one activity per missing area (max 3)', () => {
    const r = buildTooLittleResult(['physical activity', 'social time', 'work or study', 'leisure or hobby'])!
    expect(r.add.length).toBe(3)
    expect(r.add.every(a => a.name.length > 0 && a.category.length > 0)).toBe(true)
  })
})
