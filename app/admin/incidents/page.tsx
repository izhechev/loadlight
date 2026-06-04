"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { AppLayout } from "@/components/app-layout"

type Severity = 'low' | 'medium' | 'high' | 'critical'

interface Incident {
  id: string
  detected_at: string
  resolved_at: string | null
  severity: Severity
  title: string
  description: string | null
  root_cause: string | null
  resolution: string | null
  created_at: string
}

const SEVERITY_COLOURS: Record<Severity, string> = {
  low: 'bg-zinc-700 text-zinc-200',
  medium: 'bg-yellow-900 text-yellow-200',
  high: 'bg-orange-900 text-orange-200',
  critical: 'bg-red-900 text-red-200',
}

export default function IncidentsPage() {
  const router = useRouter()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)
  const [resolution, setResolution] = useState('')

  const [form, setForm] = useState({
    title: '',
    severity: 'medium' as Severity,
    description: '',
    root_cause: '',
    detected_at: new Date().toISOString().slice(0, 16),
  })

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data } = await supabase
      .from('incidents')
      .select('*')
      .order('detected_at', { ascending: false })
    setIncidents(data ?? [])
    setLoading(false)
  }, [router])

  useEffect(() => { load() }, [load])

  async function createIncident(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('incidents').insert({
      user_id: user.id,
      title: form.title,
      severity: form.severity,
      description: form.description || null,
      root_cause: form.root_cause || null,
      detected_at: new Date(form.detected_at).toISOString(),
    })
    setForm({ title: '', severity: 'medium', description: '', root_cause: '', detected_at: new Date().toISOString().slice(0, 16) })
    setShowForm(false)
    load()
  }

  async function resolveIncident(id: string) {
    const supabase = createClient()
    await supabase.from('incidents').update({
      resolved_at: new Date().toISOString(),
      resolution: resolution || null,
    }).eq('id', id)
    setResolving(null)
    setResolution('')
    load()
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-zinc-400">Loading…</div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/admin" className="text-xs text-zinc-500 hover:text-zinc-300">← Admin</Link>
            <h1 className="text-2xl font-bold text-zinc-100 mt-1">Incidents</h1>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg"
          >
            {showForm ? 'Cancel' : '+ Log Incident'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={createIncident} className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-300">New Incident</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Title *</label>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                  placeholder="Brief incident title"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Severity *</label>
                <select
                  value={form.severity}
                  onChange={e => setForm(f => ({ ...f, severity: e.target.value as Severity }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Detected at *</label>
                <input
                  type="datetime-local"
                  required
                  value={form.detected_at}
                  onChange={e => setForm(f => ({ ...f, detected_at: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                placeholder="What happened?"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Root Cause</label>
              <textarea
                value={form.root_cause}
                onChange={e => setForm(f => ({ ...f, root_cause: e.target.value }))}
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-blue-500"
                placeholder="Why did it happen?"
              />
            </div>
            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg">
              Log Incident
            </button>
          </form>
        )}

        {incidents.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-500 text-sm">
            No incidents logged yet.
          </div>
        ) : (
          <div className="space-y-3">
            {incidents.map(inc => (
              <div key={inc.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLOURS[inc.severity]}`}>
                        {inc.severity}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${inc.resolved_at ? 'bg-green-900 text-green-200' : 'bg-zinc-700 text-zinc-300'}`}>
                        {inc.resolved_at ? 'resolved' : 'open'}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-zinc-100">{inc.title}</p>
                    {inc.description && <p className="text-xs text-zinc-400">{inc.description}</p>}
                    {inc.root_cause && (
                      <p className="text-xs text-zinc-500">Root cause: {inc.root_cause}</p>
                    )}
                    {inc.resolution && (
                      <p className="text-xs text-zinc-500">Resolution: {inc.resolution}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-zinc-500">{new Date(inc.detected_at).toLocaleDateString()}</p>
                    {inc.resolved_at && (
                      <p className="text-xs text-green-600">{new Date(inc.resolved_at).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>

                {!inc.resolved_at && (
                  <div>
                    {resolving === inc.id ? (
                      <div className="flex gap-2 mt-2">
                        <input
                          value={resolution}
                          onChange={e => setResolution(e.target.value)}
                          placeholder="Resolution notes (optional)"
                          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none"
                        />
                        <button
                          onClick={() => resolveIncident(inc.id)}
                          className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg"
                        >
                          Resolve
                        </button>
                        <button
                          onClick={() => setResolving(null)}
                          className="text-xs text-zinc-400 hover:text-zinc-200 px-2"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setResolving(inc.id)}
                        className="text-xs text-green-400 hover:text-green-300 mt-1"
                      >
                        Mark resolved →
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
