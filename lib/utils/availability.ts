export interface BusyInterval {
  start: number
  end: number
}

export interface PlanningAvailability {
  workStart?: string
  workEnd?: string
  breakStart?: string
  breakEnd?: string
  busy?: { date: string; start: number; end: number }[]
}

export const AVAILABILITY_KEY = 'loadlight-availability'
export const CALENDAR_BUSY_KEY = 'loadlight-calendar-busy'

export function readStoredAvailability(storage: Pick<Storage, 'getItem'>, dates: string[]): PlanningAvailability {
  try {
    const hours = JSON.parse(storage.getItem(AVAILABILITY_KEY) ?? '{}') as PlanningAvailability | null
    const saved = JSON.parse(storage.getItem(CALENDAR_BUSY_KEY) ?? '[]') as BusyInterval[] | null
    return {
      workStart: hours?.workStart || undefined, workEnd: hours?.workEnd || undefined,
      breakStart: hours?.breakStart || undefined, breakEnd: hours?.breakEnd || undefined,
      busy: calendarSlots(Array.isArray(saved) ? saved : [], dates),
    }
  } catch {
    return {}
  }
}

export function calendarSlots(events: BusyInterval[], dates: string[]): NonNullable<PlanningAvailability['busy']> {
  return [...new Set(dates)].flatMap(date => {
    const midnight = new Date(date + 'T00:00')
    const nextMidnight = new Date(midnight)
    nextMidnight.setDate(nextMidnight.getDate() + 1)
    const slots = events.flatMap(event => {
      if (!event || !Number.isFinite(event.start) || !Number.isFinite(event.end) || event.end <= event.start ||
          event.start >= nextMidnight.getTime() || event.end <= midnight.getTime()) return []
      const start = new Date(event.start)
      const end = new Date(event.end)
      const from = event.start <= midnight.getTime() ? 0 : start.getHours() * 60 + start.getMinutes()
      const to = event.end >= nextMidnight.getTime() ? 1440 : end.getHours() * 60 + end.getMinutes() + Number(end.getSeconds() > 0 || end.getMilliseconds() > 0)
      const rewind = Math.max(0, end.getTimezoneOffset() - start.getTimezoneOffset())
      return [{ date, start: from < to ? from : Math.max(0, to - rewind), end: from < to ? to : Math.min(1440, from + rewind) }]
    }).sort((a, b) => a.start - b.start)
    const merged: typeof slots = []
    for (const slot of slots) {
      const previous = merged[merged.length - 1]
      if (previous && previous.end >= slot.start) previous.end = Math.max(previous.end, slot.end)
      else if (slot.end > slot.start) merged.push(slot)
    }
    return merged
  })
}
