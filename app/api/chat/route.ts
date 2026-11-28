import { suggestedSteps } from '@/lib/utils/taskSteps'
import { canSnoozeTask } from '@/lib/utils/toughDays'
import { readAiRequest } from '@/lib/ai/request'
import { extractTaskDrafts, taskPreview } from '@/lib/ai/taskExtraction'
import { triageTasks } from '@/lib/ai/triage'
import { buildSchedule, localDateStr } from '@/lib/utils/scheduling'
import { chatOutputSchemas, chatRequestSchema } from '@/lib/ai/schemas'
import { fetchGemini, GEMINI_MODELS, geminiText, getGeminiAccess, readGeminiJson, type GeminiResponse } from '@/lib/ai/server'

type ChatGeneration = {
  mode: keyof typeof chatOutputSchemas
  jsonSchemaText: string
  system: string
  prompt: string
  extractInput?: { text: string; today: string; categories: string[] }
}

const triageResponseSchema = chatOutputSchemas.triage.toJSONSchema()
delete triageResponseSchema.$schema

async function generateWithGemini(options: ChatGeneration) {
  const access = await getGeminiAccess()
  if (access) {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: options.system }] },
      contents: [{
        parts: [{
          text: `${options.prompt}

Return a JSON object with this structure:
${options.jsonSchemaText}`,
        }],
      }],
      generationConfig: {
        maxOutputTokens: 8_192, responseMimeType: 'application/json',
        responseJsonSchema: options.mode === 'triage' ? triageResponseSchema : undefined,
      },
    })
    for (const model of GEMINI_MODELS) {
      let data: GeminiResponse
      try {
        const response = await fetchGemini(model, access.apiKey, body)
        if ([404, 408, 429].includes(response.status) || response.status >= 500) continue
        if (!response.ok) break
        data = await response.json()
      } catch (error) {
        console.warn('LoadLight chat could not read the Gemini response.', { model })
        if (error instanceof SyntaxError) break
        continue
      }
      try {
        const finishReason = data.candidates?.[0]?.finishReason
        if (finishReason && finishReason !== 'STOP') break
        const raw = geminiText(data)
        if (raw) {
          const parsed = chatOutputSchemas[options.mode].safeParse(readGeminiJson(raw))
          if (parsed.success) return { object: parsed.data }
        }
      } catch {
        console.warn('LoadLight chat received no usable Gemini response.', { model })
      }
      break
    }
  }

  if (options.mode === 'breakdown') return { object: null }

  if (options.mode === 'extract' && options.extractInput) {
    const { text, today, categories } = options.extractInput
    return { object: { tasks: extractTaskDrafts(text, today, categories).map(taskPreview), offline: true } }
  }

  if (options.mode === 'balance-check' || options.mode === 'weekly' || options.mode === 'analyze') return { object: null }

  return { object: null }
}

// RQ6: Hardcoded ethical constraints — not user-configurable
const ETHICAL_SYSTEM_PROMPT = `You are a workload analysis assistant for LoadLight. Follow these rules strictly:
1. Tone: Supportive only. Use "consider", "you might", "one option is". Never "you should", "you must". No clinical language (anxiety, depression, burnout, mental health diagnosis).
2. Scope: Task volume, deadline distribution, demand balance, completion patterns only. Never interpret emotions or psychological state.
3. Authority: Tool framing only. State observable facts about task data, never judgements about the user as a person.
4. Escalation: If input mentions mental health crisis, respond only with factual task data and add: "For personal support, please reach out to a professional."
5. Transparency: All suggestions are AI-generated and optional. The user decides.`

// NFR-10: Sanitise input before passing to AI
function sanitise(input: string): string {
  return input
    .replace(/[<>`]/g, '')
    .replace(/ignore previous instructions?/gi, '')
    .replace(/system\s*:/gi, '')
    .replace(/\[INST\]/gi, '')
    .slice(0, 2000) // hard cap
}


export async function POST(req: Request) {
  const body = await readAiRequest(req, chatRequestSchema)
  if (body instanceof Response) return body

  const { mode, tasks, balanceMode } = body
  const categories = body.categories ?? ['Work', 'Study', 'Personal', 'Exercise', 'Creative', 'Admin']
  const text = body.text ? sanitise(body.text) : ''

  if (mode === 'extract') {
    const todayStr = body.todayStr ?? new Date().toISOString().slice(0, 10)
    const dayName = new Date(todayStr).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })

    // Pre-process: if input contains "Task:" labels (structured list from app UI),
    // extract task names and times ourselves before the AI sees the noisy form elements.
    let extractText = text
    let lineCount: number | null = null // will be set if we do newline splitting

    if (/\bTask:\s/.test(text)) {
      // Split on "Task:" boundaries
      const parts = text.split(/\bTask:\s*/)
      const cleanLines: string[] = []
      for (const part of parts.slice(1)) { // skip pre-first-task text
        // Task name = text up to "Date:", a category emoji, or obvious UI noise
        const nameRaw = part
          .replace(/Date:.*$/s, '')   // cut at "Date:"
          .replace(/[🏠🧠💰🎓🚀🌱📌🏃‍♂️].*$/s, '') // cut at category emoji
          .replace(/\b(routine|cognitive|physical|creative|emotional|Easy|Medium|Hard)\b.*$/s, '') // cut at form labels
          .replace(/\b(Priority|Repeat|Due|Start|Notes|Times)\b.*$/s, '')
          .replace(/\b(None|Daily|Weekly)\b.*$/s, '')
          .replace(/P[1-4]\s*[🔴🟠🟡]?.*$/s, '')
          .trim()
          .replace(/\s+/g, ' ')

        if (!nameRaw || nameRaw.length < 2) continue

        // Try to find a time: "Date: HH:MM" or "Due: DD/MM/YYYY HH:MM"
        const directTime   = part.match(/Date:\s*(\d{1,2}:\d{2})/)
        const formDueTime  = part.match(/Due:\s*\d{2}\/\d{2}\/\d{4}\s+(\d{2}:\d{2})/)
        const time = directTime?.[1] ?? formDueTime?.[1] ?? null

        cleanLines.push(time ? `${nameRaw} at ${time}` : nameRaw)
      }
      if (cleanLines.length > 0) {
        extractText = cleanLines.join('\n')
        lineCount = cleanLines.length
      }
    } else {
      // Pre-process: plain newline-separated list.
      // Strip any UI noise that may have leaked in, then treat each remaining line as one task.
      const UI_NOISE = /^(due|start|priority|repeat|notes|times\/day|times|dd\/mm\/yyyy|none|daily|weekly|p[1-4]|🔴|🟠|🟡|easy|medium|hard|routine|cognitive|physical|creative|emotional|--:--)$/i
      const rawLines = text.split('\n').map(l => l.trim()).filter(l => {
        if (l.length < 2) return false
        if (UI_NOISE.test(l)) return false
        // Drop lines that are only a date pattern or only an emoji
        if (/^\d{2}\/\d{2}\/\d{4}/.test(l)) return false
        if (/^\p{Emoji_Presentation}\s*\w+$/u.test(l)) return false
        return true
      })
      if (rawLines.length >= 2) {
        extractText = rawLines.join('\n')
        lineCount = rawLines.length
      }
    }

    return Response.json((await generateWithGemini({
      mode: 'extract',
      extractInput: { text: extractText, today: todayStr, categories },
      jsonSchemaText: `{ "tasks": [{ "name": "string", "category": "string", "demand_type": "cognitive" | "emotional" | "creative" | "routine" | "physical", "difficulty": number (1-5), "deadline": "YYYY-MM-DDTHH:mm" or null, "start_date": "YYYY-MM-DDTHH:mm" or null, "priority": 1 | 2 | 3 | 4, "notes": "string", "estimated_minutes": number or null, "recurring": "none" | "daily" | "weekly" | "monthly" | "yearly", "times_per_day": number, "recurring_hours": number | null, "recurring_days": number | null }], "clarification": { "question": "string", "taskName": "string", "options": [{ "label": "string", "recurring": "none" | "daily" | "weekly", "recurring_hours": number | null }] } | null }`,
      system: ETHICAL_SYSTEM_PROMPT,
      prompt: `<system_instruction>
You are an advanced, agentic task-extraction AI for LoadLight. Your goal is to deeply analyze the user's input, break it down logically, and map it strictly to the allowed categories and schemas.
</system_instruction>

<context>
Today is ${todayStr} (${dayName}). The user has provided a raw text input containing one or more tasks. You must split them if they represent distinct actions.
</context>

<user_categories>
${categories.join(', ')}
</user_categories>

<rules>
0. **LIST DETECTION**:
   - If the input has "Task:" labels: each "Task:" introduces ONE task. Extract every one.
   - If the input is a plain list with one task per line: each LINE is ONE task. Do NOT combine multiple lines into one task. Treat newlines as hard separators between distinct tasks.
1. **SPLIT**: Identify distinct actions. "I need to do laundry and also finish the math report" -> TWO tasks. If a single task has TWO distinct times mentioned (e.g. "take lamictal at 10:30 and 22:30"), create TWO separate tasks with the same name — one per time. Apply all other rules (recurring, name, etc.) to BOTH tasks.
2. **CLEAN & NORMALIZE**: Strip ALL UI/command prefixes from the task name — including "Add task to", "Add a task to", "Create a task to", "I have to", "Need to", "Maybe", "I should", "remind me to", "don't forget to". Remove time expressions from the task name. Capitalize only the first letter (Sentence case). "Add task to wash the DISHES" -> "Wash the dishes".
3. **SMART CATEGORIZATION**: Map each task to the single MOST appropriate category from the <user_categories> list exactly as written.
4. **DEMAND TYPE**: Think about the core effort:
   - 'cognitive': Thinking, studying, complex problems.
   - 'emotional': Socializing, caregiving, resolving conflicts.
   - 'creative': Designing, writing, art.
   - 'physical': Exercise, going to the gym, heavy lifting, moving.
   - 'routine': Chores, cleaning, basic admin, taking medication.
5. **ESTIMATES**: Assign a realistic 'estimated_minutes'. For quick tasks like taking pills, drinking water, or sending a quick text, use 1 or 2 minutes. For larger tasks, use realistic estimates (e.g., gym = 60, dishes = 15).
6. **RECURRING — INFER FROM CONTEXT, DON'T JUST MATCH KEYWORDS**:
   - Explicit words: "daily"/"every day"/"each morning" → "daily". "weekly"/"every week" → "weekly".
   - **Medications** (pills, lamictal, lithium, vitamins, supplements, medication, medicine) → ALWAYS "daily". People take these every day.
   - **Time-of-day anchored habits**: "morning coffee", "evening walk", "bedtime routine", "wake up", "brush teeth" → "daily".
   - **Gym/workout/run/yoga/exercise** with NO day specified → set recurring: "daily" as best guess AND flag for clarification (see rule 14).
   - If truly a one-off with no recurring signal → "none".
7. **TIMES PER DAY / EVERY N HOURS**: If the task occurs multiple times a day (e.g. "3 times a day", "twice daily"), set 'times_per_day' to that number and 'recurring_hours' to null. If the user says "every X hours" (e.g. "every 8 hours", "every 4h", "every 2 hours"), set 'recurring_hours' to X and 'recurring' to "daily", and 'times_per_day' to 1. Otherwise 'recurring_hours' is null. If the user says "every X days", "every other day", or "every second day" (e.g. "throw trash every two days"), set 'recurring_days' to X (2 for "every other/second day"), 'recurring' to "daily", and deadline to today (date only if no time given). Otherwise 'recurring_days' is null. Clean these phrases out of the task name.
8. **INVENT TASKS**: If the user explicitly asks you to "give me a random task", "invent a task", or "suggest something to do", DO NOT extract their command. Instead, invent a realistic, actionable task for them (e.g., "Read 10 pages of a book", "Organize your desk").
9. **DEADLINE WITH TIME**: If a specific time is mentioned (e.g., "at 10:30", "by 3pm", "10:30", "3pm"), ALWAYS extract it into the deadline field using 24-hour "YYYY-MM-DDTHH:mm" format. Use today's date (${todayStr}) when only a time is given. Examples: "pills 10:30" -> deadline: "${todayStr}T10:30", "meeting 3pm" -> deadline: "${todayStr}T15:00", "call by Friday 2pm" -> deadline: "[next friday]T14:00". Remove the time expression from the task name.
10. **START DATE**: If the user says "starting at", "from [time]", "begin at", set start_date to that datetime. For tasks with only a deadline time (no explicit start), start_date is null.
11. **PRIORITY**: Set priority based on urgency: 1=urgent/must-do-today/specific time given, 2=important/this week, 3=normal, 4=someday/low urgency. A task with a specific time today is priority 1.
12. **NOTES**: If the user provides extra context beyond the task name (e.g., "take pills with food" -> notes: "with food"), capture it in notes. Otherwise use empty string "".
13. **COUNT CHECK**: If the input has "Task:" labels, count them and output exactly that many tasks. If the input is a line-by-line list (one task per line), output exactly one task per line — NEVER merge two lines into one task, NEVER skip a line.
14. **CLARIFYING QUESTION**: If ONE task's recurring pattern is genuinely ambiguous (e.g. gym, workout, run — could be daily or a few times a week), set clarification to ask. Pick the MOST ambiguous single task. Options must cover the realistic choices. If everything is clear, clarification is null.
   Example: { "question": "Is 'Go to the gym' daily, a few times a week, or just this once?", "taskName": "Go to the gym", "options": [{ "label": "Every day", "recurring": "daily" }, { "label": "A few times a week", "recurring": "weekly" }, { "label": "Just this once", "recurring": "none" }] }
</rules>

<examples>
Input: "hit the gym daily, take lithium 3 times a day"
Output tasks:
- "Hit the gym" (Physical, Daily, 1 time a day, ~60m, priority 3)
- "Take lithium" (Routine, Daily, 3 times a day, ~1m, priority 1)
clarification: null

Input: "take my pills 10:30"
Output: name: "Take my pills", deadline: "${todayStr}T10:30", recurring: "daily", priority: 1, estimated_minutes: 2
clarification: null  (medication = always daily)

Input: "go to the gym and finish my report"
Output tasks:
- "Go to the gym" (Physical, recurring: "daily" as default guess)
- "Finish my report" (Cognitive, recurring: "none")
clarification: { question: "Is the gym a daily habit, a few times a week, or just today?", taskName: "Go to the gym", options: [{"label":"Every day","recurring":"daily"},{"label":"Few times a week","recurring":"weekly"},{"label":"Just today","recurring":"none"}] }

Input: "Add task to take lamictal daily at 10:30 and 22:30"
Output:
- name: "Take lamictal", deadline: "${todayStr}T10:30", recurring: "daily", priority: 1, estimated_minutes: 2
- name: "Take lamictal", deadline: "${todayStr}T22:30", recurring: "daily", priority: 1, estimated_minutes: 2
clarification: null
</examples>

<user_input>
${extractText}
</user_input>
${lineCount !== null ? `\n<line_count>${lineCount}</line_count>\nThe input above has exactly ${lineCount} lines. Each line is ONE separate task. Your output MUST contain exactly ${lineCount} tasks — one per line. Do NOT merge lines. Do NOT skip lines.` : ''}

Analyze the <user_input> step-by-step and output the final JSON.`,
    })).object)
  }

  if (mode === 'analyze' || mode === 'weekly') {
    const week = body.week
    if (!week || week.pending + week.completed === 0) {
      return Response.json({ source: 'rules', verdict: null, trend: '', advice: '', suggestion: '' })
    }

    const result = await generateWithGemini({
      mode: 'weekly',
      jsonSchemaText: `{ "verdict": "overloaded" | "balanced" | "light", "trend": "string", "advice": "string", "suggestion": "string" }`,
      system: `${ETHICAL_SYSTEM_PROMPT}
Describe one pattern in the weekly totals in the trend field. Return empty strings for advice and suggestion.
These totals do not show fixed appointments, deadlines, or availability. Do not propose a task order, new times, or moving work to another day.`,
      prompt: `This snapshot covers one week. Describe its distribution in one or two sentences.
User's local date and time: ${[body.todayStr, body.currentTime].filter(Boolean).join(' ') || 'unknown'}
Week: ${week.startDay} through ${week.endDay}
Mode: ${balanceMode ?? 'average'}
Completed this week: ${week.completed}
Pending tasks planned or due this week: ${week.pending}
Pending estimated minutes: ${week.minutes}
Estimated minutes by weekday (Monday first): ${week.dailyMinutes.join(', ')}
Pending task counts by category: ${JSON.stringify(week.categories)}`,
    })
    const parsed = chatOutputSchemas.weekly.safeParse(result.object)
    if (!parsed.success) return Response.json({ source: 'rules', verdict: null, trend: '', advice: '', suggestion: '' })
    return Response.json({ source: 'gemini', verdict: parsed.data.verdict, trend: parsed.data.trend, advice: '', suggestion: '' })
  }

  if (mode === 'breakdown') {
    const result = await generateWithGemini({
      mode: 'breakdown',
      jsonSchemaText: '{ "tasks": [{ "name": "string" }] }',
      system: 'Suggest three to five short, actionable checklist steps for the named task.',
      prompt: text ?? '',
    })
    if (result.object) return Response.json({ ...result.object, source: 'ai' })
    return Response.json({ tasks: suggestedSteps(text ?? '').map(name => ({ name })), source: 'local' })
  }

  if (mode === 'schedule_chat') {
    const history = body.history ?? []
    if (history.filter(item => item.role === 'user').length >= 3) {
      return Response.json({ type: 'ready' })
    }
    const result = await generateWithGemini({
      mode: 'schedule_chat',
      jsonSchemaText: `{ "type": "question" | "ready", "question": "string when asking" }`,
      system: 'Clarify ambiguous constraints in the user’s planning notes. Ask one question about a missing time only when it prevents planning. Never infer times, assign times, or ask a question about recurrence.',
      prompt: `Planning date: ${body.todayStr ?? localDateStr()}, time: ${body.currentTime ?? 'unknown'}.
Task names: ${JSON.stringify((tasks ?? []).filter(task => !task.done).map(task => task.name))}
User's planning notes: ${JSON.stringify(text)}
Conversation: ${JSON.stringify(history)}

Ask for one of these formats if a time is missing: "Busy 09:00–11:00", "Task name at 09:00", or "Task name by 11:00".
Use the exact task name. If the notes already provide the needed times or have no time constraints, return type="ready".`,
    })
    const answer = result.object as { type?: string; question?: string } | null
    return Response.json(answer?.type === 'question' && answer.question
      ? { type: 'question', question: answer.question }
      : { type: 'ready' })
  }

  if (mode === 'schedule') {
    return Response.json(buildSchedule(tasks ?? [], {
      today: body.todayStr ?? localDateStr(),
      currentTime: body.currentTime ?? '09:00',
      overflowDate: body.overflowDate,
      text: body.text,
    }))
  }

  if (mode === 'triage') {
    const now = new Date()
    const today = body.todayStr ?? localDateStr(0, now.getTime())
    const clock = body.currentTime ?? now.toTimeString().slice(0, 5)
    const { commitments, flexible, next } = triageTasks(tasks ?? [], today, clock)
    const result = flexible.length ? await generateWithGemini({
      mode: 'triage',
      jsonSchemaText: '{ "canSkip": [integer task indices], "urgent": [integer task indices], "questionTask": integer task index or null }',
      system: ETHICAL_SYSTEM_PROMPT,
      prompt: `At ${today} ${clock} local time, the app has already reserved fixed appointments and ranked today's deadlines.
Keep those commitments ahead of tomorrow's work. Consider the listed durations and remaining time.
Choose up to three flexible task indices for each list. Only use urgent for other important work worth reviewing after the commitments.
Only use canSkip for work that can wait today. Keep fixed bookings out of canSkip.
For one ambiguous flexible task, return its index as questionTask, otherwise null.
${JSON.stringify({ commitments, next: next?.index ?? null, flexible })}`,
    }) : { object: null }
    const choice = chatOutputSchemas.triage.safeParse(result.object)
    const suggested = choice.success ? choice.data : null
    const usedNames = new Set(commitments.map(task => task.name))
    const flexibleNames = new Set<string>()
    for (const task of flexible) {
      if (flexibleNames.has(task.name)) usedNames.add(task.name)
      flexibleNames.add(task.name)
    }
    const remaining = new Map(flexible.map(task => [task.index, task]))
    const choose = (indices: number[], canWait: boolean) => indices.flatMap(index => {
      const task = remaining.get(index)
      if (!task || usedNames.has(task.name) || (canWait && task.end)) return []
      usedNames.add(task.name)
      return [{ name: task.name, reason: task.reason }]
    })
    const extra = choose(suggested?.urgent ?? [], false)
    const canSkip = choose(suggested?.canSkip ?? [], true)
    const clarify = suggested?.questionTask == null ? null : remaining.get(suggested.questionTask)
    const question = clarify && !clarify.end && !usedNames.has(clarify.name) ? `Does ${clarify.name} need attention today?` : null
    return Response.json({
      urgent: [...commitments.map(({ name, reason }) => ({ name, reason })), ...extra],
      canSkip, question,
      source: extra.length || canSkip.length || question ? 'gemini' : 'rules',
    })
  }

  if (mode === 'chill-snooze') {
    const now = new Date()
    const today = body.todayStr ?? localDateStr()
    const clock = body.currentTime ?? now.toTimeString().slice(0, 5)
    const localNow = new Date(`${today}T${clock}`).getTime()
    const eligible = new Map((tasks ?? []).filter(task => task.id && task.status !== 'archived' && task.status !== 'completed' &&
      (task.snoozedUntil ?? 0) <= now.getTime() && canSnoozeTask(task, localNow)).map(task => [task.id!, task]))
    if (!eligible.size) {
      return Response.json({ canPostpone: [], question: null, questionTaskName: null, questionTaskId: null })
    }

    const result = await generateWithGemini({
      mode: 'chill-snooze',
      jsonSchemaText: '{ "taskIds": ["task ID"], "questionId": "task ID or null" }',
      system: ETHICAL_SYSTEM_PROMPT,
      prompt: `Choose up to four flexible tasks to hide for 24 hours starting ${today} ${clock}. Use only IDs in the list.
If one task needs the user's confirmation, put its ID in questionId. Otherwise use null.
${JSON.stringify([...eligible.values()].map(({ id, name, category, deadline, priority }) => ({ id, name, category, deadline, priority })))}`,
    })
    const parsed = chatOutputSchemas['chill-snooze'].safeParse(result.object)
    const selected = parsed.success ? parsed.data.taskIds : [...eligible.keys()].slice(0, 4)
    const canPostpone = [...new Set(selected)].flatMap(id => {
      const task = eligible.get(id)
      return task ? [{ id, name: task.name, reason: task.deadline ? 'Deadline beyond 48 hours' : 'No deadline' }] : []
    })
    const questionTask = parsed.success && parsed.data.questionId ? eligible.get(parsed.data.questionId) : null
    return Response.json({ canPostpone, question: questionTask ? `Do you need ${questionTask.name} today?` : null,
      questionTaskName: questionTask?.name ?? null, questionTaskId: questionTask?.id ?? null })
  }

  if (mode === 'balance-check') {
    const unavailable = { source: 'rules', verdict: 'ok', headline: '', reason: '', remove: [], add: [] }
    const spare = (body.toughDayThreshold ?? 0) - (body.dayLoadMinutes ?? 0)
    const missing = body.missingAreas ?? []
    if (body.state === 'overwhelmed' || (body.dayTaskCount ?? tasks?.length ?? 0) === 0 || spare < 10 || missing.length < 2) {
      return Response.json(unavailable)
    }

    const result = await generateWithGemini({
      mode: 'balance-check',
      jsonSchemaText: `{ "verdict": "too_little", "headline": "string", "reason": "string", "remove": [], "add": [{ "name": "string", "category": "string", "reason": "string", "estimatedMinutes": number }] }`,
      system: ETHICAL_SYSTEM_PROMPT,
      prompt: `Offer up to three optional task ideas today. The task list cannot tell you what the user did outside the app. Do not suggest that any area is required.
Areas not represented on today's list: ${missing.join(', ')}
App categories: ${categories.join(', ')}
Each idea must fit in ${Math.min(spare, 180)} minutes. Choose a duration of 5–180 minutes. Keep the headline, reason and suggestions short. Do not recommend deleting, hiding or deferring any task.`,
    })
    const parsed = chatOutputSchemas['balance-check'].safeParse(result.object)
    if (!parsed.success || parsed.data.verdict !== 'too_little') return Response.json(unavailable)
    const valid = parsed.data.add.filter(item => categories.includes(item.category)
      && typeof item.estimatedMinutes === 'number' && item.estimatedMinutes <= spare)
    if (!valid.length) return Response.json(unavailable)
    return Response.json({ ...parsed.data, source: 'gemini', remove: [], add: valid })
  }

  return Response.json({ error: 'Unknown mode' }, { status: 400 })
}
