import { describe, expect, it } from 'vitest'
import { getDailyWorkload, getTaskSignals, getWeeklyWorkload } from './workload'

const now = new Date(2026, 10, 28, 9).getTime()

describe('getDailyWorkload', () => {
  it('uses only today’s planned tasks and open deadlines up to today, excluding hidden rows', () => {
    const day = getDailyWorkload([
      { name: 'Important submission', deadline: '2026-11-28', estimatedMinutes: 180 },
      { name: 'Scheduled today', startDate: '2026-11-28T09:30', deadline: '2026-12-02', estimatedMinutes: 120 },
      { name: 'Overdue', deadline: '2026-11-27', estimatedMinutes: 30 },
      { name: 'Next month', deadline: '2026-12-22', estimatedMinutes: 330 },
      { name: 'Hidden', deadline: '2026-11-28', snoozedUntil: now + 60_000, estimatedMinutes: 80 },
      { name: 'Backlog', estimatedMinutes: 300 },
      { name: 'Already completed', status: 'completed', deadline: '2026-11-28', estimatedMinutes: 600 },
      { name: 'Removed', status: 'archived', deadline: '2026-11-28', estimatedMinutes: 600 },
    ], 'average', now)
    expect(day).toMatchObject({ today: '2026-11-28', minutes: 330, capacity: 240, heavy: true })
    expect(day.tasks.map(task => task.name)).toEqual(['Important submission', 'Scheduled today', 'Overdue'])
  })

  it('advances stale repeating dates without turning next week into today’s load', () => {
    const day = getDailyWorkload([
      { name: 'Weekly call', recurring: 'weekly', deadline: '2026-11-16', startDate: '2026-11-30', estimatedMinutes: 60 },
      { name: 'Daily stand-up', recurring: 'daily', deadline: '2026-11-26T07:00', estimatedMinutes: 20 },
      { name: 'Repeating call with no deadline', recurring: 'weekly', startDate: '2026-12-03', estimatedMinutes: 40 },
    ], 'average', now)
    expect(day.tasks.map(task => task.name)).toEqual(['Daily stand-up'])
    expect(day.minutes).toBe(20)
  })

  it('never substitutes a stale duration or start-date alias for an explicit null', () => {
    const tasks = [{ name: 'Deferred plan', estimatedMinutes: null, estimated_minutes: 75, startDate: null, start_date: '2026-11-28' }]
    expect(getDailyWorkload(tasks, 'average', now).tasks).toEqual([])
    expect(getDailyWorkload([{ ...tasks[0], deadline: '2026-11-28' }], 'average', now).minutes).toBe(30)
  })
})

describe('getWeeklyWorkload', () => {
  it('counts tasks scheduled or due this calendar week once and uses the real completion time', () => {
    const date = (day: number) => new Date(2026, 10, day, 8).toISOString()
    const week = getWeeklyWorkload([
      { name: 'Current', category: 'Study', startDate: '2026-11-28', deadline: '2026-11-29', estimatedMinutes: 50 },
      { name: 'December', deadline: '2026-12-01', estimatedMinutes: 90 },
      { name: 'Finished old item', done: true, createdAt: date(2), completedAt: date(28), estimatedMinutes: 20 },
      { name: 'Finished last week', done: true, createdAt: date(20), completedAt: date(22), estimatedMinutes: 30 },
    ], now)
    expect(week).toMatchObject({ startDay: '2026-11-23', endDay: '2026-11-29', pending: 1, completed: 1, minutes: 50 })
    expect(week.dailyMinutes).toEqual([0, 0, 0, 0, 0, 50, 0])
  })
})

describe('getTaskSignals', () => {
  it('uses the completion date and accepts ISO storage dates', () => {
    const date = new Date(2026, 10, 28, 8).toISOString()
    expect(getTaskSignals([
      { name: 'Finished old item', done: true, createdAt: '2026-10-12', completedAt: date },
      { name: 'Work today', deadline: '2026-11-28', createdAt: date, demandType: 'cognitive' },
      { name: 'Archived item', status: 'archived', deadline: '2026-11-28' },
    ], now)).toMatchObject({ addedLast7Days: 1, completedLast7Days: 1, tasksDueWithin48h: 1, totalUndoneMinutes: 30 })
  })
})
