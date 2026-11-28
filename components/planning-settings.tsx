"use client"

import Script from 'next/script'
import { useEffect, useState } from 'react'
import { AVAILABILITY_KEY, CALENDAR_BUSY_KEY, type BusyInterval } from '@/lib/utils/availability'

const calendarClientId = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID
const scope = 'https://www.googleapis.com/auth/calendar.freebusy'
const DEFAULT_HOURS = { workStart: '08:00', workEnd: '23:00', breakStart: '', breakEnd: '' }

type GoogleIdentity = Window & { google?: { accounts?: { oauth2?: {
  initTokenClient(options: {
    client_id: string
    scope: string
    include_granted_scopes: boolean
    callback: (response: { access_token?: string }) => void
    error_callback: () => void
  }): { requestAccessToken(): void }
} } } }

export function PlanningSettings() {
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [hours, setHours] = useState(DEFAULT_HOURS)
  const [busyCount, setBusyCount] = useState(0)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        setHours({ ...DEFAULT_HOURS, ...JSON.parse(localStorage.getItem(AVAILABILITY_KEY) ?? '{}') })
        const busy = JSON.parse(localStorage.getItem(CALENDAR_BUSY_KEY) ?? '[]') as BusyInterval[]
        setBusyCount(Array.isArray(busy) ? busy.filter(slot => slot.end > Date.now()).length : 0)
      } catch { /* Storage can be disabled. */ }
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  function saveHours() {
    setMessage('')
    setError('')
    const { workStart, workEnd, breakStart, breakEnd } = hours
    if (!workStart || !workEnd || workStart >= workEnd) {
      setError('Choose a work end time after the start.')
      return
    }
    if ((breakStart || breakEnd) && (!breakStart || !breakEnd || breakStart >= breakEnd || breakStart < workStart || breakEnd > workEnd)) {
      setError('Choose a break that starts and ends within your work hours.')
      return
    }
    try {
      localStorage.setItem(AVAILABILITY_KEY, JSON.stringify(hours))
      window.dispatchEvent(new Event('loadlight:availability-changed'))
      setMessage('Planning hours saved on this device.')
    } catch { setError('This browser could not save your planning hours.') }
  }

  async function importBusy(token: string) {
    try {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 31)
      const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeMin: start.toISOString(), timeMax: end.toISOString(), items: [{ id: 'primary' }] }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error()
      const data = await response.json() as { calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> }
      const calendars = Object.values(data.calendars ?? {})
      const calendar = data.calendars?.primary ?? (calendars.length === 1 ? calendars[0] : undefined)
      if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) throw new Error()
      const slots = calendar.busy.map(({ start, end }) => ({ start: Date.parse(start), end: Date.parse(end) }))
      if (slots.some(slot => !Number.isFinite(slot.start) || !Number.isFinite(slot.end) || slot.start >= slot.end)) throw new Error()
      localStorage.setItem(CALENDAR_BUSY_KEY, JSON.stringify(slots))
      window.dispatchEvent(new Event('loadlight:availability-changed'))
      setBusyCount(slots.filter(slot => slot.end > Date.now()).length)
      setMessage('Google Calendar busy times imported.')
    } catch { setError('Could not import Google Calendar availability. Try again.') }
    finally { setLoading(false) }
  }

  function connect() {
    const oauth = (window as GoogleIdentity).google?.accounts?.oauth2
    if (!oauth || !calendarClientId || loading) return
    setLoading(true)
    setMessage('')
    setError('')
    const onFailure = () => {
      setLoading(false)
      setError('Google Calendar authorization did not complete.')
    }
    try {
      oauth.initTokenClient({
        client_id: calendarClientId, scope, include_granted_scopes: false,
        callback: response => response.access_token ? void importBusy(response.access_token) : onFailure(),
        error_callback: onFailure,
      }).requestAccessToken()
    } catch { onFailure() }
  }

  return (
    <section className="skeu-card p-6 space-y-3">
      <h2 className="font-black">Planning availability</h2>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); saveHours() }}>
        <div className="grid grid-cols-2 gap-3">
          {([
            ['workStart', 'Work starts'], ['workEnd', 'Work ends'],
            ['breakStart', 'Break starts'], ['breakEnd', 'Break ends'],
          ] as const).map(([field, label]) => (
            <label key={field} className="text-sm font-semibold">
              {label}
              <input aria-label={label} type="time" value={hours[field]} required={field.startsWith('work')}
                onChange={event => setHours({ ...hours, [field]: event.target.value })}
                className="input-skeu w-full rounded-lg px-2 py-1 block" />
            </label>
          ))}
        </div>
        <button type="submit" className="vista-btn-secondary px-3 py-2 text-sm">Save hours</button>
      </form>
      <div className="border-t border-sky-200 pt-3 space-y-2">
        <h3 className="font-semibold text-sm">Google Calendar</h3>
        <p className="text-xs">Import 31 days of busy times from your primary calendar. LoadLight stores the busy times on this device.</p>
        {calendarClientId ? (
          <>
            <Script src="https://accounts.google.com/gsi/client" onReady={() => setReady(true)}
              onError={() => setError('Google Calendar did not load.')} />
            <button type="button" disabled={!ready || loading} onClick={connect} className="vista-btn-secondary px-3 py-2 text-sm">
              {loading ? 'Importing…' : 'Import busy times'}
            </button>
          </>
        ) : <p className="text-xs">Google Calendar setup is required for this deployment.</p>}
        {busyCount > 0 && (
          <div className="flex gap-3 items-center text-xs">
            <span>{busyCount} upcoming busy blocks</span>
            <button type="button" disabled={loading} onClick={() => {
              try {
                localStorage.removeItem(CALENDAR_BUSY_KEY)
                window.dispatchEvent(new Event('loadlight:availability-changed'))
                setBusyCount(0)
                setError('')
                setMessage('Imported busy times cleared.')
              } catch { setError('Could not clear the imported busy times.') }
            }} className="underline">Clear busy times</button>
          </div>
        )}
      </div>
      {message && <p role="status" className="text-sm">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  )
}
