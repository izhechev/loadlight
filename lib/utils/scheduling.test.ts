import { describe, it, expect } from 'vitest'
import { buildSchedule, localDateStr, selectSchedulable, orderByEnergy, WORK_START_MIN, WORK_END_MIN, type SchedulableTask } from './scheduling'

// Fixed "now": Sunday 2026-07-05 at 00:30 UTC (late night)
const NOW = new Date('2026-07-05T00:30Z').getTime()

const t = (over: Partial<{ id: string; name: string; deadline: string | null; priority: number; difficulty: number; done: boolean }>) => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  name: over.name ?? 'Task',
  deadline: over.deadline ?? null,
  priority: over.priority ?? 3,
  difficulty: over.difficulty ?? 2,
  done: over.done ?? false,
})

// ─── selectSchedulable ───────────────────────────────────────────────────────
// Include near-term starts, near-term deadlines, overdue work and undated tasks.

describe('selectSchedulable', () => {
  it('includes tasks due today or tomorrow', () => {
    const today = t({ name: 'Meds', deadline: '2026-07-05T10:00' })
    const tomorrow = t({ name: 'Speedy', deadline: '2026-07-06' })
    const r = selectSchedulable([today, tomorrow], NOW)
    expect(r).toContain(today)
    expect(r).toContain(tomorrow)
  })

  it('includes overdue tasks', () => {
    const overdue = t({ name: 'Old thing', deadline: '2026-06-03T14:00' })
    expect(selectSchedulable([overdue], NOW)).toContain(overdue)
  })

  it('excludes later deadlines with no nearby planned start, even P1', () => {
    const dayAfter = t({ name: 'Wash clothes', deadline: '2026-07-07' })
    const farP1 = t({ name: 'Tax return', deadline: '2026-07-15', priority: 1 })
    const r = selectSchedulable([dayAfter, farP1], NOW)
    expect(r).not.toContain(dayAfter)
    expect(r).not.toContain(farP1)
  })

  it('includes appointments starting today or tomorrow even when their deadline is later', () => {
    const booking = { ...t({ name: 'Design review', deadline: '2026-07-15' }), start_date: '2026-07-05T13:00' }
    const next = { ...booking, id: 'next', start_date: '2026-07-06T08:00' }
    const later = { ...booking, id: 'later', start_date: '2026-07-07T13:00' }
    const past = { ...booking, id: 'old', start_date: '2026-07-04T13:00' }
    expect(selectSchedulable([booking, next, later, past, { ...booking, done: true }], NOW, '2026-07-05'))
      .toEqual([booking, next])
  })

  it('includes undated tasks (scheduling gives them times)', () => {
    const undated = t({ name: 'Read a book', deadline: null })
    expect(selectSchedulable([undated], NOW)).toContain(undated)
  })

  it('excludes completed tasks', () => {
    const done = t({ name: 'Done thing', deadline: '2026-07-05T10:00', done: true })
    expect(selectSchedulable([done], NOW)).not.toContain(done)
  })
})

// ─── orderByEnergy ───────────────────────────────────────────────────────────
// Priority first; within a priority, harder tasks earlier (fresh brain first).

describe('orderByEnergy', () => {
  it('orders by priority, then difficulty descending', () => {
    const easyP1 = t({ name: 'easy-p1', priority: 1, difficulty: 1 })
    const hardP1 = t({ name: 'hard-p1', priority: 1, difficulty: 5 })
    const hardP3 = t({ name: 'hard-p3', priority: 3, difficulty: 5 })
    const result = orderByEnergy([hardP3, easyP1, hardP1])
    expect(result.map(x => x.name)).toEqual(['hard-p1', 'easy-p1', 'hard-p3'])
  })

  it('does not mutate the input array', () => {
    const input = [t({ priority: 3 }), t({ priority: 1 })]
    const copy = [...input]
    orderByEnergy(input)
    expect(input).toEqual(copy)
  })
})

// ─── working hours ───────────────────────────────────────────────────────────

describe('working hours window', () => {
  it('starts at 08:00 and ends at 23:00', () => {
    expect(WORK_START_MIN).toBe(8 * 60)
    expect(WORK_END_MIN).toBe(23 * 60)
  })
})

const today = '2026-11-28'
const tomorrow = '2026-11-29'
const at = (time: string, day = today) => `${day}T${time}`
const task = (name: string, fields: Partial<SchedulableTask> = {}) => ({ id: name, name, ...fields })

describe('buildSchedule', () => {
  it('respects working hours, a recurring break, and imported busy blocks', () => {
    const plan = buildSchedule([
      task('Morning work', { estimated_minutes: 60, deadline: at('12:00') }),
      task('Afternoon work', { estimated_minutes: 60, deadline: at('17:00') }),
    ], { today, currentTime: '08:00', availability: {
      workStart: '09:00', workEnd: '17:00', breakStart: '12:00', breakEnd: '13:00',
      busy: [{ date: today, start: 9 * 60, end: 11 * 60 }],
    } })
    expect(plan.scheduled.map(item => [item.name, item.start_date])).toEqual([
      ['Morning work', at('11:00')], ['Afternoon work', at('13:00')],
    ])
  })
  it('fills a slot before its deadline and never rewrites the task', () => {
    const tasks = [task('Essay', { deadline: at('10:00'), estimated_minutes: 60 })]
    const plan = buildSchedule(tasks, { today, currentTime: '09:00' })
    expect(plan.scheduled).toEqual([{ id: 'Essay', name: 'Essay', start_date: at('09:00'), end_date: at('10:00') }])
    expect(tasks[0]).toEqual({ id: 'Essay', name: 'Essay', deadline: at('10:00'), estimated_minutes: 60 })
    expect(buildSchedule(tasks, { today, currentTime: '09:01' }).unscheduled[0]?.reason).toBe('No room before its deadline.')
  })

  it('keeps a real 09:00 fixed start and warns about overlap', () => {
    const plan = buildSchedule([
      task('Appointment', { start_date: at('09:00'), estimated_minutes: 60 }),
      task('Overlap', { start_date: at('09:30'), estimated_minutes: 60 }),
      task('Flexible', { estimated_minutes: 90 }),
    ], { today, currentTime: '08:00' })
    expect(plan.scheduled.map(({ name, start_date }) => [name, start_date])).toEqual([
      ['Appointment', at('09:00')], ['Flexible', at('10:30')],
    ])
    expect(plan.unscheduled.map(({ name }) => name)).toEqual(['Overlap'])
  })

  it('reserves appointments already in progress', () => {
    const plan = buildSchedule([
      task('Appointment', { start_date: at('09:00'), estimated_minutes: 60 }),
      task('Flexible', { estimated_minutes: 30 }),
    ], { today, currentTime: '09:15' })
    expect(plan.scheduled[0]?.start_date).toBe(at('10:00'))
    expect(plan.unscheduled).toEqual([])
  })

  it('keeps an ongoing recurring slot occupied until its end', () => {
    const plan = buildSchedule([
      task('Daily review', { recurring: 'daily', deadline: at('09:00', '2026-11-27'), estimated_minutes: 60 }),
      task('Proof', { deadline: at('11:00'), estimated_minutes: 30 }),
    ], { today, currentTime: '09:15' })
    expect(plan.scheduled.map(({ name, start_date }) => [name, start_date])).toEqual([['Proof', at('10:00')]])
  })

  it('matches separate named times and honors busy windows or skips', () => {
    const plan = buildSchedule([
      task('Doctor', { estimated_minutes: 30 }), task('Shopping', { estimated_minutes: 25 }),
      task('Laundry', { estimated_minutes: 30 }), task('Archive files', { estimated_minutes: 30 }),
    ], { today, currentTime: '09:00', text: 'Unavailable from 09:00 to 11:00. Doctor at 11:00 and Shopping at 16:00. Skip Laundry.' })
    expect(plan.scheduled.map(({ name, start_date }) => [name, start_date])).toEqual([
      ['Doctor', at('11:00')], ['Archive files', at('11:30')], ['Shopping', at('16:00')],
    ])
    expect(plan.unscheduled[0]?.name).toBe('Laundry')
  })

  it('applies common availability wording on the right calendar day', () => {
    const plan = buildSchedule([
      task('Today task', { priority: 1, estimated_minutes: 30 }),
      task('Tomorrow task', { start_date: tomorrow, estimated_minutes: 30 }),
    ], { today, currentTime: '09:00', text: 'Today I can begin after 10:00 and work only until 11:00. Tomorrow I am not available from 08:00 to 12:00. 2026-11-29 Tomorrow task at 13:00.' })
    expect(plan.scheduled[0]?.start_date).toBe(at('10:00'))
    expect(plan.overflow[0]?.start_date).toBe(at('13:00', tomorrow))
    expect(plan.unusedNotes).toEqual([])
  })

  it('warns about unparsed and out-of-horizon note constraints', () => {
    const plan = buildSchedule([task('Study')], {
      today, currentTime: '09:00',
      text: 'I prefer a quiet morning. 2026-12-01 Busy from 09:00 to 10:00. Busy 22:00–08:00.',
    })
    expect(plan.unusedNotes).toEqual(['I prefer a quiet morning', '2026-12-01 Busy from 09:00 to 10:00', 'Busy 22:00–08:00'])
  })

  it('checks deadline dates before difficulty and duration for equal priority', () => {
    const plan = buildSchedule([
      task('Quick admin', { priority: 1, deadline: tomorrow, estimated_minutes: 5, difficulty: 1 }),
      task('Study', { priority: 1, deadline: today, estimated_minutes: 90, difficulty: 5 }),
    ], { today, currentTime: '09:00' })
    expect(plan.scheduled.map(({ name }) => name)).toEqual(['Study', 'Quick admin'])
  })

  it('reserves enough time for a timed deadline before all-day work', () => {
    const plan = buildSchedule([
      task('All-day', { deadline: today, estimated_minutes: 90 }),
      task('Needs finishing at ten', { deadline: at('10:00'), estimated_minutes: 60 }),
    ], { today, currentTime: '09:00' })
    expect(plan.scheduled.map(({ name }) => name)).toEqual(['Needs finishing at ten', 'All-day'])
  })

  it('fits today’s deadlines around the fixed design review before starting tomorrow’s slides', () => {
    const tasks = [
      task('Workshop slides', { priority: 1, deadline: at('17:00', tomorrow), estimated_minutes: 100 }),
      task('Client estimate', { priority: 1, deadline: at('16:00'), estimated_minutes: 120 }),
      task('Travel claim', { priority: 2, deadline: today, estimated_minutes: 60 }),
      task('Design review', { priority: 2, start_date: at('13:00'), estimated_minutes: 45 }),
      task('Print proof', { priority: 3, deadline: at('12:30'), estimated_minutes: 25 }),
      task('Reference files', { priority: 4, estimated_minutes: 50 }),
    ]
    const plan = buildSchedule(tasks, { today, currentTime: '11:20' })
    expect(plan.scheduled.map(({ name, start_date, end_date }) => [name, start_date, end_date])).toEqual([
      ['Print proof', at('11:20'), at('11:45')], ['Travel claim', at('11:45'), at('12:45')],
      ['Design review', at('13:00'), at('13:45')], ['Client estimate', at('13:45'), at('15:45')],
      ['Workshop slides', at('15:45'), at('17:25')], ['Reference files', at('17:25'), at('18:15')],
    ])
    expect(plan.unscheduled).toEqual([])
  })

  it('keeps tomorrow’s short task after the work due today, including across an appointment gap', () => {
    const plan = buildSchedule([
      task('Tomorrow', { priority: 1, deadline: tomorrow, estimated_minutes: 10 }),
      task('Meeting', { start_date: at('09:30'), estimated_minutes: 30 }),
      task('Today', { priority: 4, deadline: at('12:00'), estimated_minutes: 60 }),
    ], { today, currentTime: '09:00' })
    expect(plan.scheduled.map(({ name, start_date }) => [name, start_date])).toEqual([
      ['Meeting', at('09:30')], ['Today', at('10:00')], ['Tomorrow', at('11:00')],
    ])
  })

  it('treats date-only starts as the earliest planning day without pinning 08:00', () => {
    const plan = buildSchedule([
      task('First', { start_date: today, estimated_minutes: 60 }),
      task('Second', { start_date: at('00:00:00Z'), estimated_minutes: 60 }),
      task('Tomorrow work', { start_date: tomorrow, estimated_minutes: 30 }),
    ], { today, currentTime: '09:00' })
    expect(plan.scheduled.map(({ start_date }) => start_date)).toEqual([at('09:00'), at('10:00')])
    expect(plan.overflow[0]?.start_date).toBe(at('08:00', tomorrow))
    expect(plan.unscheduled).toEqual([])
  })

  it('honors a by-time note without changing the original due date', () => {
    const tasks = [task('Essay', { deadline: at('16:00'), estimated_minutes: 60 })]
    const plan = buildSchedule(tasks, { today, currentTime: '09:00', text: 'Essay must be done by 10:00.' })
    expect(plan.scheduled[0]?.end_date).toBe(at('10:00'))
    expect(tasks[0].deadline).toBe(at('16:00'))
  })

  it('does not create invalid times for pinned work across closing', () => {
    const plan = buildSchedule([
      task('Meeting', { start_date: at('23:30'), estimated_minutes: 60 }),
      task('Quick admin', { estimated_minutes: 15 }),
    ], { today, currentTime: '22:30' })
    expect(plan.scheduled[0]?.end_date).toBe(at('22:45'))
    expect(plan.unscheduled[0]?.name).toBe('Meeting')
  })

  it('moves the planning day and overflow forward separately after closing', () => {
    const plan = buildSchedule([
      task('Long task', { priority: 1, estimated_minutes: 900 }),
      task('Small task', { estimated_minutes: 30 }),
    ], { today, currentTime: '23:05', overflowDate: tomorrow })
    expect(plan.date).toBe(tomorrow)
    expect(plan.scheduled[0]?.end_date).toBe(at('23:00', tomorrow))
    expect(plan.overflow[0]?.start_date).toBe(at('08:00', '2026-11-30'))
  })

  it('leaves an unfinished appointment at its original fixed start after closing', () => {
    const appointment = task('Meeting', { start_date: at('17:00'), estimated_minutes: 60 })
    const plan = buildSchedule([appointment, task('Flexible task')], { today, currentTime: '23:05' })
    expect(plan.scheduled.map(({ name }) => name)).toEqual(['Flexible task'])
    expect(plan.overflow).toEqual([])
    expect(plan.unscheduled[0]).toMatchObject({ name: 'Meeting', reason: 'Fixed start already passed. Edit the task to move it.' })
    expect(appointment.start_date).toBe(at('17:00'))
  })

  it('books available overflow time around an existing start and preserves original date limits', () => {
    const plan = buildSchedule([
      task('Tonight only', { deadline: today, estimated_minutes: 120 }),
      task('Overflow one', { estimated_minutes: 120 }),
      task('Overflow two', { estimated_minutes: 180 }),
      task('Existing start', { start_date: at('09:00', tomorrow), deadline: '2026-12-10', estimated_minutes: 60 }),
    ], { today, currentTime: '22:30' })
    expect(plan.unscheduled[0]?.name).toBe('Tonight only')
    expect(plan.overflow.map(({ name, start_date }) => [name, start_date])).toEqual([
      ['Existing start', at('09:00', tomorrow)],
      ['Overflow one', at('10:00', tomorrow)],
      ['Overflow two', at('12:00', tomorrow)],
    ])
  })

  it('keeps recurring times anchored and puts date-only tasks before end of day', () => {
    const plan = buildSchedule([
      task('Daily call', { recurring: 'daily', deadline: at('09:00', '2026-11-27'), estimated_minutes: 20 }),
      task('Today chore', { recurring: 'daily', deadline: at('00:00'), estimated_minutes: 20 }),
    ], { today, currentTime: '08:00' })
    expect(plan.scheduled.map(({ name, start_date }) => [name, start_date])).toEqual([
      ['Today chore', at('08:00')], ['Daily call', at('09:00')],
    ])
  })

  it('reserves the saved start of a recurring appointment even when its deadline is later', () => {
    const plan = buildSchedule([
      task('Weekly review', { recurring: 'weekly', start_date: at('13:00'), deadline: at('14:00'), estimated_minutes: 45 }),
      task('Report', { deadline: at('16:00'), estimated_minutes: 60 }),
    ], { today, currentTime: '12:30' })
    expect(plan.scheduled.map(({ name, start_date }) => [name, start_date])).toEqual([
      ['Weekly review', at('13:00')], ['Report', at('13:45')],
    ])
  })

  it('excludes snoozed, done and archived tasks', () => {
    const plan = buildSchedule([
      task('Snoozed', { snoozedUntil: NOW + 1000 }),
      task('Done', { done: true }),
      task('Archived', { status: 'archived' }),
      task('Active'),
    ], { today, currentTime: '09:00', nowMs: NOW })
    expect(plan.scheduled.map(({ name }) => name)).toEqual(['Active'])
  })

  it('selects tomorrow using the current local calendar day rather than UTC', () => {
    const now = Date.parse('2026-11-28T00:30:00+01:00')
    const result = selectSchedulable([task('Tomorrow', { deadline: tomorrow })], now, today)
    expect(result.map(({ name }) => name)).toEqual(['Tomorrow'])
    const local = new Date(2026, 9, 25, 0, 30)
    expect(localDateStr(1, local.getTime())).toBe('2026-10-26')
  })
})
