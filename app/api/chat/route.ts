export const runtime = 'edge'

// Direct Gemini API call using simple fetch
async function generateWithGemini(options: any) {
  const apiKey = process.env.GOOGLE_API_KEY
  const model = "gemini-2.5-flash"
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${options.system}\n\n${options.prompt}\n\nCRITICAL: You must output ONLY a valid JSON object matching this exact structure:\n${options.jsonSchemaText}`
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      })
    })

    const data = await response.json()
    let textContent = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (textContent) {
      // Strip any residual markdown code blocks just in case
      textContent = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      return { object: JSON.parse(textContent) }
    }
  } catch (err) {
    console.error('Gemini direct fetch error:', err)
  }

  // Smart Mock Fallback if API fails
  if (options.mode === 'extract') {
    const match = options.prompt.match(/<user_input>\s*([\s\S]*?)\s*<\/user_input>/)
    const text = match ? match[1] : ''
    const todayStr = new Date().toISOString().split('T')[0]

    const tasks = text.split(/ and | then |, /i).filter((t: string) => t.trim().length > 0).map((t: string) => {
      const lowerT = t.toLowerCase()
      const isWeekly = lowerT.includes('weekly') || lowerT.includes('every week') || lowerT.includes('every sat') || lowerT.includes('every sun') || lowerT.includes('every mon')

      let times_per_day = 1
      let recurring_hours: number | null = null
      const timesMatch = lowerT.match(/(\d+)\s*times\s*(a|per)\s*day/i) || lowerT.match(/twice\s*(a|per)?\s*day/i)
      if (timesMatch) {
        times_per_day = timesMatch[0].includes('twice') ? 2 : parseInt(timesMatch[1]) || 1
      }
      const everyHoursMatch = lowerT.match(/every\s+(\d+)\s*h(ours?)?/i)
      if (everyHoursMatch) {
        recurring_hours = parseInt(everyHoursMatch[1])
      }

      const isDaily = lowerT.includes('daily') || lowerT.includes('every day') || lowerT.includes('everyday') || lowerT.includes('a day') || lowerT.includes('per day') || times_per_day > 1 || recurring_hours !== null

      // Extract time: "10:30", "3pm", "15:00", "9am"
      let deadline: string | null = null
      const hhmmMatch = t.match(/\b(\d{1,2}):(\d{2})\b/)
      const ampmMatch = t.match(/\b(\d{1,2})\s*(am|pm)\b/i)
      if (hhmmMatch) {
        const h = hhmmMatch[1].padStart(2, '0')
        const m = hhmmMatch[2].padStart(2, '0')
        deadline = `${todayStr}T${h}:${m}`
      } else if (ampmMatch) {
        let h = parseInt(ampmMatch[1])
        const isPM = ampmMatch[2].toLowerCase() === 'pm'
        if (isPM && h !== 12) h += 12
        if (!isPM && h === 12) h = 0
        deadline = `${todayStr}T${String(h).padStart(2, '0')}:00`
      }

      let name = t.replace(/i have to|need to|want to|maybe/gi, '').trim() || 'New Task'

      // Remove time expressions from name
      name = name.replace(/\b\d{1,2}:\d{2}\b/g, '').trim()
      name = name.replace(/\b\d{1,2}\s*(am|pm)\b/gi, '').trim()
      name = name.replace(/every\s+\d+\s*h(ours?)?/gi, '').trim()
      name = name.replace(/daily|every\s*day|everyday|every\s*week|weekly|every\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*|\d+\s*times\s*(a|per)\s*day|twice\s*(a|per)?\s*day/gi, '').trim()
      name = name.replace(/\b(at|by|before|after)\s*$/i, '').replace(/^(to|on|at|for)\s+/i, '').replace(/[\.,;\s]+$/, '').trim()
      name = name.charAt(0).toUpperCase() + name.slice(1)

      let demand_type = 'routine'
      let category = 'Personal'
      let difficulty = 2

      if (name.toLowerCase().includes('gym') || name.toLowerCase().includes('workout') || name.toLowerCase().includes('run')) {
        demand_type = 'physical'
        category = 'Exercise'
        difficulty = 3
      }

      let estimated_minutes = 30
      if (name.toLowerCase().includes('pill') || name.toLowerCase().includes('medicine') || name.toLowerCase().includes('lithium') || name.toLowerCase().includes('water') || name.toLowerCase().includes('text')) {
        estimated_minutes = 2
      } else if (name.toLowerCase().includes('gym') || name.toLowerCase().includes('workout')) {
        estimated_minutes = 60
      }

      const priority = deadline ? 1 : isDaily ? 2 : 3

      return {
        name,
        category,
        demand_type,
        difficulty,
        deadline,
        start_date: null,
        priority,
        notes: '',
        estimated_minutes,
        recurring: isDaily ? 'daily' : isWeekly ? 'weekly' : 'none',
        times_per_day,
        recurring_hours
      }
    })
    return { object: { tasks } } as any
  }

  // Schedule fallback — runs the greedy algorithm locally when AI is unavailable
  if (options.mode === 'schedule') {
    const taskList: Array<{ id: string; name: string; priority?: number; estimated_minutes?: number | null; done?: boolean }> = options.scheduleTasks ?? []

    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const overflowDate = tomorrow.toISOString().split('T')[0]

    // Start from current time; end of day is 23:30
    const nowMin = today.getHours() * 60 + today.getMinutes()
    const endOfDayMin = 23 * 60 + 30
    const fmt = (min: number) =>
      `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`

    const toSchedule = taskList
      .filter(t => !t.done)
      .sort((a, b) => {
        const pa = a.priority ?? 3
        const pb = b.priority ?? 3
        if (pa !== pb) return pa - pb
        return (a.estimated_minutes ?? 30) - (b.estimated_minutes ?? 30)
      })

    const scheduled: { id: string; start_date: string; deadline: string }[] = []
    const overflow:  { id: string; deadline: string }[] = []
    let cursor = nowMin

    for (const task of toSchedule) {
      const dur = task.estimated_minutes ?? 30
      if (cursor + dur <= endOfDayMin) {
        scheduled.push({
          id: task.id,
          start_date: `${todayStr}T${fmt(cursor)}`,
          deadline:   `${todayStr}T${fmt(cursor + dur)}`,
        })
        cursor += dur
      } else {
        overflow.push({ id: task.id, deadline: `${overflowDate}T09:00` })
      }
    }

    const message = scheduled.length
      ? `Scheduled ${scheduled.length} task${scheduled.length !== 1 ? 's' : ''} from ${fmt(nowMin)}. Moved ${overflow.length} to ${overflowDate}.`
      : `Nothing fits today. All ${overflow.length} tasks moved to ${overflowDate}.`

    return { object: { scheduled, overflow, message } } as any
  }

  if (options.mode === 'triage') {
    return { object: { canSkip: [], urgent: [], question: null } } as any
  }

  if (options.mode === 'chill-snooze') {
    const taskList: any[] = options.tasks ?? []
    const now = Date.now()
    const in48h = now + 172800000
    const HEALTH = /pill|medication|medicine|vitamin|supplement|therapy|doctor|medical|lamictal|lithium/i
    const canPostpone = taskList
      .filter(t => !t.done && !HEALTH.test(t.name ?? '') && (t.priority ?? 3) > 1 && (!t.deadline || new Date(t.deadline).getTime() > in48h))
      .slice(0, 4)
      .map(t => ({ id: t.id ?? '', name: t.name, reason: 'No urgent deadline this week' }))
    return { object: { canPostpone, question: null, questionTaskName: null, questionTaskId: null } } as any
  }

  return { object: {
    verdict: 'balanced',
    trend: 'AI is currently in offline mode.',
    advice: 'Your workload looks manageable based on recent data.',
    suggestion: 'Keep maintaining your current pace.'
  }} as any
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
  const body = await req.json() as {
    text?: string
    mode: string
    categories?: string[]
    tasks?: Array<{
      id?: string
      name: string
      category?: string
      demand_type?: string
      estimated_minutes?: number | null
      priority?: number
      done?: boolean
      deadline?: string | null
      start_date?: string | null
    }>
    balanceMode?: string
    overflowDate?: string // "YYYY-MM-DD" — schedule mode
    currentTime?: string  // "HH:MM" — current wall-clock time
    history?: { role: 'assistant' | 'user'; text: string }[] // schedule_chat conversation
  }
  const { mode, tasks, balanceMode } = body
  const categories = body.categories ?? ['Work', 'Study', 'Personal', 'Exercise', 'Creative', 'Admin']
  const text = body.text ? sanitise(body.text) : ''

  if (mode === 'extract') {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const dayName = today.toLocaleDateString('en-US', { weekday: 'long' })

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
      jsonSchemaText: `{ "tasks": [{ "name": "string", "category": "string", "demand_type": "cognitive" | "emotional" | "creative" | "routine" | "physical", "difficulty": number (1-5), "deadline": "YYYY-MM-DDTHH:mm" or null, "start_date": "YYYY-MM-DDTHH:mm" or null, "priority": 1 | 2 | 3 | 4, "notes": "string", "estimated_minutes": number or null, "recurring": "none" | "daily" | "weekly", "times_per_day": number, "recurring_hours": number | null }], "clarification": { "question": "string", "taskName": "string", "options": [{ "label": "string", "recurring": "none" | "daily" | "weekly", "recurring_hours": number | null }] } | null }`,
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
7. **TIMES PER DAY / EVERY N HOURS**: If the task occurs multiple times a day (e.g. "3 times a day", "twice daily"), set 'times_per_day' to that number and 'recurring_hours' to null. If the user says "every X hours" (e.g. "every 8 hours", "every 4h", "every 2 hours"), set 'recurring_hours' to X and 'recurring' to "daily", and 'times_per_day' to 1. Otherwise 'recurring_hours' is null. Clean these phrases out of the task name.
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

  if (mode === 'analyze') {
    const taskList = tasks ?? []
    const totalMinutes = taskList.reduce((acc, t) => acc + (t.estimated_minutes ?? 30), 0)
    const hours = Math.round(totalMinutes / 60 * 10) / 10
    const pending = taskList.filter(t => !t.done).length
    const demandCounts = taskList.reduce<Record<string, number>>((acc, t) => {
      const dt = t.demand_type ?? 'routine'
      acc[dt] = (acc[dt] ?? 0) + 1
      return acc
    }, {})
    const dominant = Object.entries(demandCounts).sort((a, b) => b[1] - a[1])[0]

    return Response.json((await generateWithGemini({
      mode: 'analyze',
      jsonSchemaText: `{ "verdict": "overloaded" | "balanced" | "light", "trend": "string", "advice": "string", "suggestion": "string" }`,
      system: ETHICAL_SYSTEM_PROMPT,
      prompt: `Analyse this workload data and give a brief supportive assessment.

Balance mode: ${balanceMode ?? 'balanced'}
Total tasks: ${taskList.length} (${pending} pending)
Total estimated hours: ${hours}h
Dominant demand type: ${dominant ? `${dominant[0]} (${dominant[1]} tasks)` : 'none'}
Demand distribution: ${JSON.stringify(demandCounts)}`,
    })).object)
  }

  if (mode === 'weekly') {
    const taskList = tasks ?? []
    const totalMinutes = taskList.reduce((acc, t) => acc + (t.estimated_minutes ?? 30), 0)
    const hours = Math.round(totalMinutes / 60 * 10) / 10
    const done = taskList.filter(t => t.done).length
    const byType = taskList.reduce<Record<string, number>>((acc, t) => {
      const cat = t.category ?? 'other'
      acc[cat] = (acc[cat] ?? 0) + 1
      return acc
    }, {})

    return Response.json((await generateWithGemini({
      mode: 'weekly',
      jsonSchemaText: `{ "verdict": "overloaded" | "balanced" | "light", "trend": "string", "advice": "string", "suggestion": "string" }`,
      system: ETHICAL_SYSTEM_PROMPT,
      prompt: `Generate a weekly workload summary.

Balance mode: ${balanceMode ?? 'balanced'}
Total tasks this week: ${taskList.length}
Completed: ${done}/${taskList.length}
Estimated hours: ${hours}h
Task breakdown by category: ${JSON.stringify(byType)}

Give a trend observation, one piece of advice, and one specific actionable suggestion.`,
    })).object)
  }

  if (mode === 'breakdown') {
    return Response.json((await generateWithGemini({
      mode: 'extract', // Reuse the extract mock logic if it fails
      jsonSchemaText: `{ "tasks": [{ "name": "string", "category": "string", "demand_type": "cognitive" | "emotional" | "creative" | "routine" | "physical", "difficulty": number (1-5), "deadline": "YYYY-MM-DDTHH:mm" or null, "start_date": "YYYY-MM-DDTHH:mm" or null, "priority": 1 | 2 | 3 | 4, "notes": "string", "estimated_minutes": number or null, "recurring": "none" | "daily" | "weekly", "times_per_day": number }] }`,
      system: `You are a productivity expert for LoadLight. Your job is to break down a single, large, overwhelming task into 3 to 5 smaller, highly actionable sub-tasks.`,
      prompt: `Please break down this large task into smaller steps:

<user_input>
${text}
</user_input>

<user_categories>
${categories.join(', ')}
</user_categories>

RULES:
1. Generate exactly 3 to 5 smaller tasks that add up to the original goal.
2. Keep the original category if possible, or use the most relevant one from the list.
3. Make the estimated_minutes for each sub-task smaller (e.g., 10-30 mins).
4. Use sentence case for task names and start with a clear action verb.`,
    })).object)
  }

  if (mode === 'schedule_chat') {
    const taskList  = tasks ?? []
    const undoneTasks = taskList.filter(t => !t.done)
    const today     = new Date()
    const todayStr  = today.toISOString().split('T')[0]
    const totalMins  = undoneTasks.reduce((s, t) => s + (t.estimated_minutes ?? 30), 0)
    const history    = body.history ?? []

    // Build conversation context
    const userTurns = history.filter(m => m.role === 'user').length
    const forceReady = userTurns >= 3

    // Extract task names already discussed in assistant questions — never re-ask about these
    const taskNames = undoneTasks.map(t => t.name)
    const alreadyAsked = taskNames.filter(name =>
      history.some(m => m.role === 'assistant' && m.text.toLowerCase().includes(name.toLowerCase().slice(0, 10)))
    )

    // Pair questions with their answers for a clean summary
    const qaPairs: string[] = []
    for (let i = 0; i < history.length; i++) {
      if (history[i].role === 'assistant' && history[i + 1]?.role === 'user') {
        qaPairs.push(`Q: ${history[i].text}\nA: ${history[i + 1].text}`)
      }
    }
    const conversationSummary = qaPairs.join('\n---\n')
    const taskList_str = undoneTasks.map((t, i) => {
      const rec = (t as any).recurring
      const recLabel = rec && rec !== 'none' ? ` | ${rec}` : ''
      return `[${i}] "${t.name}" | ~${t.estimated_minutes ?? 30}min | priority ${t.priority ?? 3}${recLabel}`
    }).join('\n')

    const result = await generateWithGemini({
      mode: 'schedule_chat',
      jsonSchemaText: `{ "type": "question" | "ready", "question": "string (only if type=question)", "context": "string (only if type=ready)" }`,
      system: `You are a personal planning assistant. Ask specific, targeted questions about tasks you don't understand. Never repeat a question already answered.`,
      prompt: `Current time: ${body.currentTime ?? todayStr}. Task load: ~${Math.round(totalMins / 60 * 10) / 10}h. Today: ${todayStr}.

Tasks (recurring label shown if already known):
${taskList_str}

${conversationSummary ? `ALREADY ANSWERED — do NOT ask about these again:\n${conversationSummary}\n` : ''}
${text && userTurns === 0 ? `User context: "${text}"\n` : ''}

${forceReady
  ? 'Return type="ready" now with a 1-2 sentence context summary of what you learned.'
  : `BANNED from asking about: ${alreadyAsked.length > 0 ? alreadyAsked.map(n => `"${n}"`).join(', ') : 'nothing yet'}.

Find the next UNCLEAR task not yet discussed. Prioritise these two types of unclear:
1. RECURRENCE: tasks that sound like habits or routines (medications, exercise, meditation, hygiene) but have no recurring label — ask "Is '[task name]' something you do every day, every week, or just once?"
2. MEANING: project names, abbreviations, formal processes you genuinely don't understand — ask what it is.

Ask ONE question at a time. If all tasks are clear, return type="ready".
Response ${userTurns + 1} of max 3.`}`,
    })

    const obj = result.object as any
    if (obj?.type === 'ready' || forceReady) {
      return Response.json({ type: 'ready', context: obj?.context ?? conversationSummary })
    }
    const question = obj?.question
    if (question && typeof question === 'string') {
      return Response.json({ type: 'question', question })
    }
    // Fallback
    if (history.length === 0) {
      return Response.json({
        type: 'question',
        question: `You have ${undoneTasks.length} tasks (~${Math.round(totalMins / 60 * 10) / 10}h total). Which tasks absolutely must happen today?`
      })
    }
    return Response.json({ type: 'ready', context: conversationSummary })
  }

  if (mode === 'schedule') {
    const taskList = tasks ?? []
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const undoneTasks = taskList.filter(t => !t.done)

    const parseHHMM = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number)
      return h * 60 + (m ?? 0)
    }
    const fmt = (min: number) =>
      `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`

    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const endOfDayMin     = 23 * 60 + 30  // schedule up to 23:30
    const overflowDate    = body.overflowDate ?? tomorrow.toISOString().split('T')[0]
    // Use current real time as the start — no manual window needed
    const nowMin          = body.currentTime ? parseHHMM(body.currentTime) : 9 * 60
    const windowPassed    = nowMin >= endOfDayMin
    const scheduleDate    = windowPassed ? overflowDate : todayStr
    const effectiveStartMin = windowPassed ? 9 * 60 : nowMin
    const effectiveStartStr = fmt(effectiveStartMin)
    const schedulable = undoneTasks

    let scheduled: { id: string; name: string; start_date: string; deadline: string }[] = []
    let overflow:  { id: string; name: string; deadline: string; start_date?: string | null }[] = []
    let aiSucceeded = false

    // Pre-process: extract task-specific fixed times from user instruction text.
    // e.g. "lamictal is everyday 10:30 and 22:30" → lamictal tasks get pinned times.
    const taskTimeOverrides = new Map<string, string>() // task ID → "HH:MM"
    if (text) {
      // Normalize: semicolons to colons in time-like patterns (e.g. 22;30 → 22:30)
      const normalized = text.replace(/(\d{1,2});(\d{2})\b/g, '$1:$2').toLowerCase()
      const timeRegex = /\b(\d{1,2}):(\d{2})\b/g
      const allTimes: { time: string; idx: number }[] = []
      let tm
      while ((tm = timeRegex.exec(normalized)) !== null) {
        const h = parseInt(tm[1]), mn = parseInt(tm[2])
        if (h >= 0 && h <= 23 && mn >= 0 && mn <= 59)
          allTimes.push({ time: `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`, idx: tm.index })
      }
      if (allTimes.length > 0) {
        // For each task, find keywords (4+ chars) that appear in the instruction near a time
        type Match = { task: typeof schedulable[0]; kwIdx: number }
        const keywordGroups = new Map<string, Match[]>() // keyword → [matched tasks]
        for (const task of schedulable) {
          const words = task.name.toLowerCase().split(/[\s()\/]+/).filter(w => w.replace(/[^a-z]/g, '').length >= 4)
          for (const word of words) {
            const kwIdx = normalized.indexOf(word)
            if (kwIdx === -1) continue
            const nearby = allTimes.filter(t => Math.abs(t.idx - kwIdx) <= 80)
            if (nearby.length === 0) continue
            const existing = keywordGroups.get(word) ?? []
            existing.push({ task, kwIdx })
            keywordGroups.set(word, existing)
            break // one keyword match per task is enough
          }
        }
        // Assign times to matched tasks (sorted by name so (1/2) < (2/2))
        for (const matches of keywordGroups.values()) {
          const sorted = [...matches].sort((a, b) => a.task.name.localeCompare(b.task.name))
          const nearbyTimes = allTimes
            .filter(t => sorted.some(m => Math.abs(t.idx - m.kwIdx) <= 80))
            .map(t => t.time)
          sorted.forEach((m, i) => {
            if (i < nearbyTimes.length) taskTimeOverrides.set(m.task.id ?? '', nearbyTimes[i])
          })
        }
      }
    }

    // AI scheduling: use INDEX numbers not IDs so Gemini can never produce an ID mismatch
    try {
      const aiResult = await generateWithGemini({
        mode: 'schedule_ai',
        jsonSchemaText: `{ "today": [{ "index": number, "start": "HH:MM", "end": "HH:MM" }], "overflow": [{ "index": number }] }`,
        system: `You are a smart daily scheduler. Output ONLY valid JSON matching the schema. Never use task names or IDs in output — use the integer index only.`,
        prompt: `Schedule the user's tasks for ${scheduleDate}.
Current time: ${effectiveStartStr}. Schedule starting from ${effectiveStartStr} (never before this time).
Only put a task in "overflow" if it would need to start after 23:30.

Tasks — reference ONLY by the [index] number:
${schedulable.map((t, i) => {
  // Check override from user instruction first, then stored deadline
  const overrideTime = taskTimeOverrides.get(t.id ?? '')
  if (overrideTime) {
    return `[${i}] "${t.name}" | ${t.estimated_minutes ?? 5}min | FIXED TIME: schedule at exactly ${overrideTime}`
  }
  const dTime = t.deadline?.includes('T') ? t.deadline.split('T')[1] : null
  // Only treat deadline as fixed if not a schedule artifact (no start_date set today)
  const isScheduleArtifact = t.start_date?.startsWith(scheduleDate)
  if (dTime && t.deadline!.split('T')[0] === scheduleDate && !dTime.startsWith('09:00') && !isScheduleArtifact) {
    return `[${i}] "${t.name}" | ${t.estimated_minutes ?? 5}min | FIXED TIME: schedule at exactly ${dTime.slice(0, 5)}`
  }
  return `[${i}] "${t.name}" | ${t.estimated_minutes ?? 30}min | priority ${t.priority ?? 3}`
}).join('\n')}
${text ? `\nUser notes: "${text}"` : ''}

Rules:
1. FIXED TIME tasks MUST be scheduled at their exact listed time. Do NOT move them.
2. Sort flexible tasks by priority ascending (1=most urgent). Fill gaps around fixed tasks.
3. Start times must be >= ${effectiveStartStr}. Never schedule before this.
4. "start" and "end" are 24-hour HH:MM strings (e.g. "09:22", "14:30").
5. Every task must appear in exactly one list. Include ALL ${schedulable.length} tasks.`,
      })

      const aiData = aiResult.object as { today?: { index: number; start: string; end: string }[]; overflow?: { index: number }[] }
      const used = new Set<number>()

      if (Array.isArray(aiData?.today)) {
        for (const item of aiData.today) {
          const idx = Number(item.index)
          if (Number.isInteger(idx) && idx >= 0 && idx < schedulable.length && !used.has(idx) && item.start && item.end) {
            used.add(idx)
            scheduled.push({
              id:         schedulable[idx].id ?? '',
              name:       schedulable[idx].name,
              start_date: `${scheduleDate}T${item.start}`,
              deadline:   `${scheduleDate}T${item.end}`,
            })
          }
        }
      }
      if (Array.isArray(aiData?.overflow)) {
        for (const item of aiData.overflow) {
          const idx = Number(item.index)
          if (Number.isInteger(idx) && idx >= 0 && idx < schedulable.length && !used.has(idx)) {
            used.add(idx)
            overflow.push({ id: schedulable[idx].id ?? '', name: schedulable[idx].name, deadline: `${overflowDate}T09:00` })
          }
        }
      }
      // Safety: any schedulable task AI missed goes to overflow
      schedulable.forEach((t, i) => {
        if (!used.has(i)) overflow.push({ id: t.id ?? '', name: t.name, deadline: `${overflowDate}T09:00` })
      })

      // Validate: all scheduled times must be on or after effectiveStartMin
      const timesValid = scheduled.every(s => {
        const st = parseHHMM(s.start_date.split('T')[1] ?? '00:00')
        return st >= effectiveStartMin - 5
      })
      aiSucceeded = used.size > 0 && timesValid
      if (!timesValid) { scheduled = []; overflow = [] }
    } catch { /* fall through */ }

    // Greedy fallback — pinned tasks at their exact time, flexible tasks fill the gaps
    if (!aiSucceeded) {
      // Pinned = has a specific time on scheduleDate (not 09:00 artifact), OR has a user instruction override
      const getPinnedTime = (t: typeof schedulable[0]): number | null => {
        const override = taskTimeOverrides.get(t.id ?? '')
        if (override) return parseHHMM(override)
        if (!t.deadline?.includes('T')) return null
        const [dDate, dTime] = t.deadline.split('T')
        if (dDate !== scheduleDate) return null
        if (!dTime || dTime.startsWith('09:00')) return null
        // Don't treat deadline as fixed if it's a schedule artifact from a prior run
        if (t.start_date?.startsWith(scheduleDate)) return null
        return parseHHMM(dTime)
      }
      const isPinned = (t: typeof schedulable[0]) => getPinnedTime(t) !== null
      const pinnedTasks = schedulable
        .filter(isPinned)
        .sort((a, b) => getPinnedTime(a)! - getPinnedTime(b)!)
      const flexTasks = schedulable
        .filter(t => !isPinned(t))
        .sort((a, b) => {
          const pa = a.priority ?? 3, pb = b.priority ?? 3
          if (pa !== pb) return pa - pb
          return (a.estimated_minutes ?? 30) - (b.estimated_minutes ?? 30)
        })

      let cursor = effectiveStartMin
      let fi = 0

      // Interleave: fill gaps before each pinned task, then insert pinned task
      for (const pinned of pinnedTasks) {
        const pinnedMin = getPinnedTime(pinned)!
        const pinnedDur = pinned.estimated_minutes ?? 5
        // Fill flexible tasks before this pinned slot
        while (fi < flexTasks.length) {
          const dur = flexTasks[fi].estimated_minutes ?? 30
          if (cursor + dur <= pinnedMin) {
            scheduled.push({ id: flexTasks[fi].id ?? '', name: flexTasks[fi].name, start_date: `${scheduleDate}T${fmt(cursor)}`, deadline: `${scheduleDate}T${fmt(cursor + dur)}` })
            cursor += dur
            fi++
          } else break
        }
        // Jump to pinned time if we're still before it
        if (cursor < pinnedMin) cursor = pinnedMin
        scheduled.push({ id: pinned.id ?? '', name: pinned.name, start_date: `${scheduleDate}T${fmt(cursor)}`, deadline: `${scheduleDate}T${fmt(cursor + pinnedDur)}` })
        cursor += pinnedDur
      }

      // Fill remaining flexible tasks after all pinned tasks
      while (fi < flexTasks.length) {
        const task = flexTasks[fi]
        const dur = task.estimated_minutes ?? 30
        if (cursor + dur <= 24 * 60) {
          scheduled.push({ id: task.id ?? '', name: task.name, start_date: `${scheduleDate}T${fmt(cursor)}`, deadline: `${scheduleDate}T${fmt(cursor + dur)}` })
          cursor += dur
        } else {
          overflow.push({ id: task.id ?? '', name: task.name, deadline: `${overflowDate}T09:00`, start_date: null })
        }
        fi++
      }
    }

    // Deduplicate by task ID
    const seenIds = new Set<string>()
    const dedup = <T extends { id: string }>(arr: T[]) => arr.filter(item => {
      if (!item.id) return true
      if (seenIds.has(item.id)) return false
      seenIds.add(item.id)
      return true
    })
    scheduled = dedup(scheduled)
    overflow  = dedup(overflow)

    const message = scheduled.length
      ? `${scheduled.length} task${scheduled.length !== 1 ? 's' : ''} fit today. ${overflow.length > 0 ? `${overflow.length} moved to ${overflowDate}.` : ''}`
      : `Nothing fits today. All ${overflow.length} tasks moved to ${overflowDate}.`

    return Response.json({ scheduled, overflow, message })
  }

  if (mode === 'triage') {
    const taskList = tasks ?? []
    const undoneTasks = taskList.filter(t => !t.done)
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    if (undoneTasks.length === 0) {
      return Response.json({ canSkip: [], urgent: [], question: null })
    }

    return Response.json((await generateWithGemini({
      mode: 'triage',
      jsonSchemaText: `{ "canSkip": [{ "name": "string", "reason": "string" }], "urgent": [{ "name": "string", "reason": "string" }], "question": "string or null" }`,
      system: ETHICAL_SYSTEM_PROMPT,
      prompt: `The user has flagged feeling overwhelmed. Analyze their active task list to identify which tasks could be deferred today, and which are genuinely time-sensitive.

Today: ${todayStr}

Tasks:
${undoneTasks.map((t, i) => `[${i}] "${t.name}" | priority ${(t as any).priority ?? 3}/4 | difficulty ${(t as any).difficulty ?? 2}/5 | ~${t.estimated_minutes ?? 30}min | deadline: ${t.deadline ?? 'none'} | type: ${t.demand_type ?? 'routine'}`).join('\n')}

Instructions:
1. canSkip: tasks with no deadline, priority 3-4, or routine tasks with no time constraint. These can wait until tomorrow or later. Limit to the 3 best candidates.
2. urgent: tasks with a deadline today or within 24h, or priority 1 tasks. Limit to the 3 most pressing.
3. question: if ONE task's importance is genuinely ambiguous and a single yes/no question would clarify it, include that question. Otherwise null. Example: "Is the gym session fixed for today, or can it move to tomorrow?"
4. Reasons must be under 6 words. Use phrases like "no deadline", "due today", "can wait", "priority 1", "low effort".
5. Do not put the same task in both lists.
6. Tasks not in either list are implicitly medium — the user can judge those themselves.`,
    })).object)
  }

  if (mode === 'chill-snooze') {
    const taskList = tasks ?? []
    const activeTasks = taskList.filter(t => !t.done)
    const now = new Date()
    const taskSummary = activeTasks.map(t =>
      `- id:"${(t as any).id ?? ''}" name:"${t.name}" [cat:${t.category ?? 'Unknown'}, priority:${(t as any).priority ?? 3}/4, deadline:${t.deadline ?? 'none'}]`
    ).join('\n')

    if (activeTasks.length === 0) {
      return Response.json({ canPostpone: [], question: null, questionTaskName: null, questionTaskId: null })
    }

    return Response.json((await generateWithGemini({
      mode: 'chill-snooze',
      tasks: activeTasks,
      jsonSchemaText: `{ "canPostpone": [{ "id": "string", "name": "string", "reason": "string" }], "question": "string | null", "questionTaskName": "string | null", "questionTaskId": "string | null" }`,
      system: ETHICAL_SYSTEM_PROMPT,
      prompt: `The user is in Chill Guy mode (recovery-first, low-effort focus). Identify which tasks can safely be hidden for 24 hours.

CRITERIA for canPostpone — a task qualifies if ALL are true:
- No deadline within the next 48 hours (or no deadline at all)
- Not a health or safety task (no medications, medical appointments, emergencies)
- Priority 2, 3 or 4 (not priority 1 "must do today")
- Not already overdue

reason must be ≤ 8 casual words (e.g. "No deadline this week", "Can move to tomorrow easily", "Low priority — no rush", "Flexible deadline").

If ONE task's urgency is genuinely unclear (e.g. gym — is today's session mandatory?), set a short yes/no question and the matching questionTaskName/questionTaskId. Otherwise all three are null.

Limit canPostpone to the 4 best candidates. Do NOT include health/medication tasks.

Active tasks:
${taskSummary}

Today: ${now.toISOString().split('T')[0]}`,
    })).object)
  }

  return Response.json({ error: 'Unknown mode' }, { status: 400 })
}
