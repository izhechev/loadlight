export const runtime = 'edge'

// Direct Gemini API call using simple fetch
async function generateWithGemini(options: any) {
  const apiKey = process.env.GOOGLE_API_KEY
  // gemma-3-4b-it: free-tier available, handles JSON well
  const model = "gemma-3-4b-it"
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
          temperature: 0.2
        }
      })
    })

    const data = await response.json()
    let textContent = data.candidates?.[0]?.content?.parts?.[0]?.text
    
    if (textContent) {
      // Clean up markdown code blocks if the model wrapped the JSON
      textContent = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      return { object: JSON.parse(textContent) }
    }
  } catch (err) {
    console.error('Gemini direct fetch error:', err)
  }

  // Smart Mock Fallback if API fails
  if (options.mode === 'extract') {
    // Correctly extract the text from the <user_input> tag
    const match = options.prompt.match(/<user_input>\s*([\s\S]*?)\s*<\/user_input>/)
    const text = match ? match[1] : ''
    const tasks = text.split(/ and | then |, /i).filter((t: string) => t.trim().length > 0).map((t: string) => {
      const lowerT = t.toLowerCase()
      const isWeekly = lowerT.includes('weekly') || lowerT.includes('every week') || lowerT.includes('every sat') || lowerT.includes('every sun') || lowerT.includes('every mon')
      
      let times_per_day = 1
      const timesMatch = lowerT.match(/(\d+)\s*times\s*(a|per)\s*day/i) || lowerT.match(/twice\s*(a|per)?\s*day/i)
      if (timesMatch) {
        times_per_day = timesMatch[0].includes('twice') ? 2 : parseInt(timesMatch[1]) || 1
      }
      
      const isDaily = lowerT.includes('daily') || lowerT.includes('every day') || lowerT.includes('everyday') || lowerT.includes('a day') || lowerT.includes('per day') || times_per_day > 1
      
      let name = t.replace(/i have to|need to|want to|maybe/gi, '').trim() || 'New Task'
      
      // Aggressive clean up of time phrases from name
      name = name.replace(/daily|every\s*day|everyday|every\s*week|weekly|every\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*|\d+\s*times\s*(a|per)\s*day|twice\s*(a|per)?\s*day/gi, '').trim()
      // Remove trailing punctuation or prepositions left behind
      name = name.replace(/^(to|on|at|for)\s+/i, '').replace(/[\.,;\s]+$/, '').trim()
      
      // Capitalize first letter
      name = name.charAt(0).toUpperCase() + name.slice(1)
      
      // Basic fallback categorization
      let demand_type = 'routine'
      let category = 'Personal'
      let difficulty = 2
      
      if (name.toLowerCase().includes('gym') || name.toLowerCase().includes('workout') || name.toLowerCase().includes('run')) {
        demand_type = 'physical'
        category = 'Exercise'
        difficulty = 3
      }
      
      let estimated_minutes = 30
      if (name.toLowerCase().includes('pill') || name.toLowerCase().includes('lithium') || name.toLowerCase().includes('water') || name.toLowerCase().includes('text')) {
        estimated_minutes = 2
      } else if (name.toLowerCase().includes('gym') || name.toLowerCase().includes('workout')) {
        estimated_minutes = 60
      }

      return {
        name,
        category,
        demand_type,
        difficulty,
        deadline: null,
        estimated_minutes,
        recurring: isDaily ? 'daily' : isWeekly ? 'weekly' : 'none',
        times_per_day
      }
    })
    return { object: { tasks } } as any
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
    tasks?: Array<{ category?: string; demand_type?: string; estimated_minutes?: number; name: string; done?: boolean; deadline?: string }>
    balanceMode?: string
  }
  const { mode, tasks, balanceMode } = body
  const categories = body.categories ?? ['Work', 'Study', 'Personal', 'Exercise', 'Creative', 'Admin']
  const text = body.text ? sanitise(body.text) : ''

  if (mode === 'extract') {
    return Response.json((await generateWithGemini({
      mode: 'extract',
      jsonSchemaText: `{ "tasks": [{ "name": "string", "category": "string", "demand_type": "cognitive" | "emotional" | "creative" | "routine" | "physical", "difficulty": number (1-5), "deadline": "YYYY-MM-DD" or null, "estimated_minutes": number or null, "recurring": "none" | "daily" | "weekly", "times_per_day": number }] }`,
      system: ETHICAL_SYSTEM_PROMPT,
      prompt: `<system_instruction>
You are an advanced, agentic task-extraction AI for LoadLight. Your goal is to deeply analyze the user's input, break it down logically, and map it strictly to the allowed categories and schemas.
</system_instruction>

<context>
The user has provided a raw text input containing one or more tasks. You must split them if they represent distinct actions.
</context>

<user_categories>
${categories.join(', ')}
</user_categories>

<rules>
1. **SPLIT**: Identify distinct actions. "I need to do laundry and also finish the math report" -> TWO tasks.
2. **CLEAN & NORMALIZE**: Remove filler ("I have to", "Need to", "Maybe", "I should"). Capitalize only the first letter (Sentence case). "wash the DISHES" -> "Wash the dishes".
3. **SMART CATEGORIZATION**: Map each task to the single MOST appropriate category from the <user_categories> list exactly as written.
4. **DEMAND TYPE**: Think about the core effort:
   - 'cognitive': Thinking, studying, complex problems.
   - 'emotional': Socializing, caregiving, resolving conflicts.
   - 'creative': Designing, writing, art.
   - 'physical': Exercise, going to the gym, heavy lifting, moving.
   - 'routine': Chores, cleaning, basic admin.
5. **ESTIMATES**: Assign a realistic 'estimated_minutes'. For quick tasks like taking pills, drinking water, or sending a quick text, use 1 or 2 minutes. For larger tasks, use realistic estimates (e.g., gym = 60, dishes = 15).
6. **RECURRING**: If the user explicitly mentions "daily", "every day", "each morning", set recurring to "daily". For "weekly", "every week", set "weekly". Otherwise, "none".
7. **TIMES PER DAY**: If the task occurs multiple times a day (e.g. "3 times a day", "twice daily"), set 'times_per_day' to that number (e.g., 3). Otherwise set it to 1. Clean this phrase out of the task name.
8. **INVENT TASKS**: If the user explicitly asks you to "give me a random task", "invent a task", or "suggest something to do", DO NOT extract their command. Instead, invent a realistic, actionable task for them (e.g., "Read 10 pages of a book", "Organize your desk").
</rules>

<examples>
Input: "hit the gym daily, take lithium 3 times a day"
Thinking Process:
- "hit the gym daily" -> Task: "Hit the gym" (Physical, Daily, 1 time a day, ~60m)
- "take lithium 3 times a day" -> Task: "Take lithium" (Routine, Daily, 3 times a day, ~1m)
</examples>

<user_input>
${text}
</user_input>

Analyze the <user_input> step-by-step and output the final JSON array.`,
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
      jsonSchemaText: `{ "tasks": [{ "name": "string", "category": "string", "demand_type": "cognitive" | "emotional" | "creative" | "routine" | "physical", "difficulty": number (1-5), "deadline": "YYYY-MM-DD" or null, "estimated_minutes": number or null, "recurring": "none" | "daily" | "weekly", "times_per_day": number }] }`,
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

  return Response.json({ error: 'Unknown mode' }, { status: 400 })
}
