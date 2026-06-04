"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { AppLayout } from "@/components/app-layout"

interface HealthData {
  status: string
  version: string
  db: string
  latency_ms: number
  timestamp: string
}

interface AiStats {
  totalCalls: number
  avgLatencyMs: number
  totalTokensIn: number
  totalTokensOut: number
  modelBreakdown: Record<string, number>
  callTypeBreakdown: Record<string, number>
}

interface StateEvent {
  id: string
  trigger: string
  previous_state: string
  new_state: string
  created_at: string
}

interface IncidentSummary {
  open: number
  resolved: number
}

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<HealthData | null>(null)
  const [aiStats, setAiStats] = useState<AiStats | null>(null)
  const [stateEvents, setStateEvents] = useState<StateEvent[]>([])
  const [incidentSummary, setIncidentSummary] = useState<IncidentSummary>({ open: 0, resolved: 0 })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      fetch('/api/health')
        .then(r => r.json())
        .then(setHealth)
        .catch(() => setHealth(null))

      const { data: logs } = await supabase
        .from('ai_logs')
        .select('model, call_type, tokens_in, tokens_out, latency_ms')

      if (logs && logs.length > 0) {
        const totalCalls = logs.length
        const avgLatencyMs = Math.round(logs.reduce((s, l) => s + l.latency_ms, 0) / totalCalls)
        const totalTokensIn = logs.reduce((s, l) => s + l.tokens_in, 0)
        const totalTokensOut = logs.reduce((s, l) => s + l.tokens_out, 0)
        const modelBreakdown: Record<string, number> = {}
        const callTypeBreakdown: Record<string, number> = {}
        for (const l of logs) {
          modelBreakdown[l.model] = (modelBreakdown[l.model] ?? 0) + 1
          callTypeBreakdown[l.call_type] = (callTypeBreakdown[l.call_type] ?? 0) + 1
        }
        setAiStats({ totalCalls, avgLatencyMs, totalTokensIn, totalTokensOut, modelBreakdown, callTypeBreakdown })
      } else {
        setAiStats({ totalCalls: 0, avgLatencyMs: 0, totalTokensIn: 0, totalTokensOut: 0, modelBreakdown: {}, callTypeBreakdown: {} })
      }

      const { data: events } = await supabase
        .from('overwhelm_events')
        .select('id, trigger, previous_state, new_state, created_at')
        .order('created_at', { ascending: false })
        .limit(10)
      setStateEvents(events ?? [])

      const { data: inc } = await supabase
        .from('incidents')
        .select('id, resolved_at')
      if (inc) {
        setIncidentSummary({
          open: inc.filter(i => !i.resolved_at).length,
          resolved: inc.filter(i => !!i.resolved_at).length,
        })
      }

      setLoading(false)
    }
    load()
  }, [router])

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64 text-zinc-400">Loading admin data…</div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-100">Admin Dashboard</h1>
          <span className="text-xs text-zinc-500">v{health?.version ?? '—'}</span>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">System Health</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Status" value={health?.status ?? '—'} highlight={health?.status === 'ok'} />
            <Stat label="DB" value={health?.db ?? '—'} highlight={health?.db === 'connected'} />
            <Stat label="Latency" value={health ? `${health.latency_ms}ms` : '—'} />
            <Stat label="Version" value={health?.version ?? '—'} />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">AI Usage (All-time)</h2>
          {aiStats && aiStats.totalCalls > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Total Calls" value={String(aiStats.totalCalls)} />
                <Stat label="Avg Latency" value={`${aiStats.avgLatencyMs}ms`} />
                <Stat label="Tokens In" value={aiStats.totalTokensIn.toLocaleString()} />
                <Stat label="Tokens Out" value={aiStats.totalTokensOut.toLocaleString()} />
              </div>
              {Object.keys(aiStats.modelBreakdown).length > 0 && (
                <div>
                  <p className="text-xs text-zinc-500 mb-2">Model breakdown</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(aiStats.modelBreakdown).map(([model, count]) => (
                      <span key={model} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded-md">
                        {model}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No AI calls logged yet.</p>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Recent State Transitions</h2>
          {stateEvents.length === 0 ? (
            <p className="text-sm text-zinc-500">No state transitions yet.</p>
          ) : (
            <div className="space-y-2">
              {stateEvents.map(e => (
                <div key={e.id} className="flex items-center gap-3 text-sm">
                  <span className="text-zinc-500 text-xs w-36 shrink-0">{new Date(e.created_at).toLocaleString()}</span>
                  <span className="text-zinc-400">{e.previous_state}</span>
                  <span className="text-zinc-600">→</span>
                  <span className="text-zinc-200 font-medium">{e.new_state}</span>
                  <span className="text-xs text-zinc-600 ml-auto">{e.trigger}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Incidents</h2>
            <Link href="/admin/incidents" className="text-xs text-blue-400 hover:text-blue-300">
              Manage incidents →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Open" value={String(incidentSummary.open)} highlight={incidentSummary.open === 0} />
            <Stat label="Resolved" value={String(incidentSummary.resolved)} />
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? 'text-green-400' : 'text-zinc-100'}`}>{value}</p>
    </div>
  )
}
