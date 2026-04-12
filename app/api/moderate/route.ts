import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'edge'

export type ModerationCategory = 'self_harm' | 'sexual' | 'violence' | 'hate' | 'other'

export interface ModerationResult {
  flagged: boolean
  category: ModerationCategory | null
}

export async function POST(request: NextRequest) {
  const { text } = await request.json() as { text: string }

  const apiKey = process.env.OPENAI_API_KEY
  // If no key configured, fail open — extraction will proceed
  if (!apiKey) return NextResponse.json<ModerationResult>({ flagged: false, category: null })

  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input: text }),
    })

    if (!res.ok) return NextResponse.json<ModerationResult>({ flagged: false, category: null })

    const data = await res.json() as {
      results: { flagged: boolean; categories: Record<string, boolean> }[]
    }
    const result = data.results?.[0]
    if (!result?.flagged) return NextResponse.json<ModerationResult>({ flagged: false, category: null })

    const c = result.categories
    let category: ModerationCategory = 'other'
    if (c['self-harm'] || c['self-harm/intent'] || c['self-harm/instructions']) category = 'self_harm'
    else if (c['sexual/minors']) category = 'sexual'
    else if (c['sexual']) category = 'sexual'
    else if (c['violence'] || c['violence/graphic']) category = 'violence'
    else if (c['hate'] || c['hate/threatening']) category = 'hate'

    return NextResponse.json<ModerationResult>({ flagged: true, category })
  } catch {
    // Moderation unavailable — fail open
    return NextResponse.json<ModerationResult>({ flagged: false, category: null })
  }
}
