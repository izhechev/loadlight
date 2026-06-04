import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const version = '0.1.0'
  const timestamp = new Date().toISOString()
  const start = Date.now()

  let dbStatus: 'connected' | 'degraded' | 'error' = 'connected'

  try {
    const supabase = await createClient()
    const { error } = await supabase.from('profiles').select('id').limit(1)
    if (error && error.code !== 'PGRST301') {
      dbStatus = 'degraded'
    }
  } catch {
    dbStatus = 'error'
  }

  const latency_ms = Date.now() - start

  return Response.json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    version,
    db: dbStatus,
    latency_ms,
    timestamp,
  })
}
