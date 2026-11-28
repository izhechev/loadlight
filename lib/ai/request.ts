import type { ZodType } from 'zod'

const BODY_LIMIT = 128 * 1024

export async function readAiRequest<T>(request: Request, schema: ZodType<T>): Promise<T | Response> {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (mediaType !== 'application/json') {
    return Response.json({ error: 'Send a JSON request.' }, { status: 415 })
  }
  if (Number(request.headers.get('content-length')) > BODY_LIMIT) {
    return Response.json({ error: 'Request is too large.' }, { status: 413 })
  }

  const reader = request.body?.getReader()
  if (!reader) return Response.json({ error: 'Request body is required.' }, { status: 400 })

  try {
    let bytes = 0
    let text = ''
    const decoder = new TextDecoder('utf-8', { fatal: true })
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > BODY_LIMIT) {
        await reader.cancel().catch(() => {})
        return Response.json({ error: 'Request is too large.' }, { status: 413 })
      }
      text += decoder.decode(value, { stream: true })
    }

    const parsed = schema.safeParse(JSON.parse(text + decoder.decode()))
    if (parsed.success) return parsed.data
  } catch {
    return Response.json({ error: 'Invalid JSON request.' }, { status: 400 })
  } finally {
    reader.releaseLock()
  }

  return Response.json({ error: 'Invalid AI request fields.' }, { status: 400 })
}
