import { readAiRequest } from '@/lib/ai/request'
import { extractOutputSchema, extractRequestSchema, type ExtractedTask } from '@/lib/ai/schemas'
import { fetchGemini, GEMINI_MODELS, geminiText, getGeminiAccess, readGeminiJson, recordAiCall, type GeminiResponse } from '@/lib/ai/server'
import { extractTaskDrafts, taskPreview, type TaskDraft } from '@/lib/ai/taskExtraction'

const SYSTEM_PROMPT = `Extract tasks in the order they appear. Return a JSON object with a tasks array.
Each task has name, category, lifeDomain, demandType, difficulty, priority, deadline, startDate, estimatedMinutes, notes, recurring, recurringHours, recurringDays and timesPerDay.
- Keep the original wording of each task name, removing only its scheduling details. Keep separate lines and distinct actions as separate tasks.
- Use the provided category names. lifeDomain is work, study, personal, health, finance, social, creativity or home.
- demandType is cognitive, emotional, creative, routine or physical. Difficulty is 1–5 and priority is 1–4.
- Use YYYY-MM-DD for date-only deadlines and YYYY-MM-DDTHH:mm for a date with a time. Use the provided date as the reference for relative days and weekdays. Use null when there is no date or time. Use startDate for an appointment at a fixed time. Use deadline for an action that needs to finish by a time.
- estimatedMinutes is minutes only when the user gives a duration. Use null otherwise.
- recurring is none, daily, weekly, monthly or yearly. Preserve explicit cadence. Use recurringHours for every N hours and recurringDays for every N days, or the month/year interval for monthly/yearly tasks.
- Create one task per explicit daily time and use timesPerDay = 1 for each. Use timesPerDay greater than 1 only for a daily count without separate times.`

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
]

function knownDetails(model: ExtractedTask, local?: TaskDraft): TaskDraft {
  const recurrence = local?.recurring !== undefined && local.recurring !== 'none' ? local : model
  return {
    ...model,
    lifeDomain: model.lifeDomain ?? local?.lifeDomain ?? 'personal',
    deadline: local?.startDate ? local.deadline : local?.deadline ?? model.deadline ?? null,
    startDate: local?.deadline ? local.startDate : local?.startDate ?? model.startDate ?? null,
    estimatedMinutes: local?.estimatedMinutes ?? model.estimatedMinutes ?? null,
    recurring: recurrence.recurring,
    recurringHours: recurrence.recurringHours ?? null,
    recurringDays: recurrence.recurringDays ?? null,
    timesPerDay: recurrence.timesPerDay ?? 1,
  }
}

function taskNameKey(name: string) {
  const words = name.normalize('NFKC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []
  return words.filter(word => !['a', 'an', 'the'].includes(word)).join(' ')
}

function alignTasks(localTasks: TaskDraft[], modelTasks: ExtractedTask[]): TaskDraft[] | null {
  if (localTasks.length !== modelTasks.length) {
    return localTasks.length === 1 ? modelTasks.map(model => knownDetails(model)) : null
  }

  const localKeys = localTasks.map(task => taskNameKey(task.name))
  const modelKeys = modelTasks.map(task => taskNameKey(task.name))
  const used = new Set<ExtractedTask>()
  const aligned: TaskDraft[] = []

  for (const [index, task] of localTasks.entries()) {
    const key = localKeys[index]
    if (!key) return null
    const sameName = modelTasks.filter((_, i) => modelKeys[i] === key)
    const repeatedName = localKeys.filter(localKey => localKey === key).length > 1
    // Same-name drafts need an exact appointment or deadline to identify the occurrence.
    const candidates = repeatedName || sameName.length > 1
      ? sameName.filter(model => (
        task.startDate
          ? model.startDate?.slice(0, 16) === task.startDate
          : task.deadline && model.deadline?.slice(0, 16) === task.deadline
      ))
      : sameName

    if (candidates.length !== 1 || used.has(candidates[0])) return null
    used.add(candidates[0])
    aligned.push(knownDetails(candidates[0], task))
  }

  return aligned
}

export async function POST(request: Request) {
  const body = await readAiRequest(request, extractRequestSchema)
  if (body instanceof Response) return body
  const { text, categories, today = new Date().toISOString().slice(0, 10) } = body
  const localTasks = extractTaskDrafts(text, today, categories)
  if (!localTasks.length) return Response.json({ tasks: [] })

  const offline = () => Response.json({ tasks: localTasks.map(taskPreview), offline: true })
  const access = await getGeminiAccess()
  if (!access) return offline()

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: JSON.stringify({ today, categories, text }) }] }],
    generationConfig: { maxOutputTokens: 8192, responseMimeType: 'application/json' },
    safetySettings: SAFETY_SETTINGS,
  })
  const start = Date.now()

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetchGemini(model, access.apiKey, requestBody)
      if (!res.ok) continue

      const data: GeminiResponse = await res.json()
      const candidate = data.candidates?.[0]
      if (candidate?.finishReason === 'SAFETY') {
        const hit = (name: string) => candidate.safetyRatings?.some(r => r.category === name && r.probability !== 'NEGLIGIBLE')
        const category = hit('HARM_CATEGORY_DANGEROUS_CONTENT') ? 'self_harm' :
          hit('HARM_CATEGORY_SEXUALLY_EXPLICIT') ? 'sexual' :
          hit('HARM_CATEGORY_HATE_SPEECH') ? 'hate' : 'other'
        return Response.json({ blocked: true, category })
      }

      const raw = geminiText(data)
      if (!raw) {
        console.warn('LoadLight Gemini extraction', { model, reason: 'empty_output' })
        continue
      }
      const parsed = extractOutputSchema.safeParse(readGeminiJson(raw))
      if (!parsed.success) {
        console.warn('LoadLight Gemini extraction', { model, reason: 'invalid_schema' })
        continue
      }

      const { tasks, clarification } = parsed.data
      const aligned = alignTasks(localTasks, tasks)
      await recordAiCall(access, 'extraction', model, start, data.usageMetadata)
      if (!aligned) {
        console.warn('LoadLight Gemini extraction', { model, reason: 'unmatched_tasks' })
        return offline()
      }
      return Response.json({
        tasks: aligned.map(taskPreview),
        clarification,
        offline: false,
      })
    } catch (error) {
      const reason = error instanceof SyntaxError ? 'invalid_json'
        : error instanceof Error && error.name === 'TimeoutError' ? 'provider_timeout' : 'request_failed'
      console.warn('LoadLight Gemini extraction', { model, reason })
    }
  }

  return offline()
}
