import { generateObject } from 'ai'
import { z } from 'zod'

export const runtime = 'edge'

// Direct Gemini API call using simple fetch
async function generateWithGemini(options: any) {
  const apiKey = process.env.GOOGLE_API_KEY
  // Fall back to a rock-solid, stable model
  const model = "gemini-2.0-flash" 
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
          response_mime_type: "application/json"
        }
      })
    })

    const data = await response.json()
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text
    
    if (textContent) {
      return { object: JSON.parse(textContent) }
    }
  } catch (err) {
    console.error('Gemini direct fetch error:', err)
  }

  // Smart Mock Fallback if API fails
  if (options.mode === 'extract') {
    // Correctly extract the text from the <user_input> tag
    const text = options.prompt.match(/<user_input>([\s\S]*?)<\/user_input>/)?.[1] || ''
    const tasks = text.split(/ and | then |, /i).map((t: string) => ({
      name: t.replace(/i have to|need to|want to|maybe/gi, '').trim() || 'New Task',
      category: 'Personal',
      demand_type: 'routine',
      difficulty: 2,
      deadline: null,
      estimated_minutes: 30,
      recurring: t.toLowerCase().includes('daily') ? 'daily' : t.toLowerCase().includes('weekly') ? 'weekly' : 'none'
    }))
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

const TaskSchema = z.object({
  tasks: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      demand_type: z.enum(['cognitive', 'emotional', 'creative', 'routine', 'physical']),
      difficulty: z.number().int().min(1).max(5),
      deadline: z.string().nullable(),
      estimated_minutes: z.number().nullable(),
      recurring: z.enum(['none', 'daily', 'weekly']),
    })
  ),
})

const AnalysisSchema = z.object({
  verdict: z.enum(['overloaded', 'balanced', 'light']),
  trend: z.string(),
  advice: z.string(),
  suggestion: z.string(),
})

export async function POST(req: Request) {
  const body = await req.json() as {
    text?: string
    mode: string
    categories?: string[]
    tasks?: Array<{ category?: string; demand_type?: string; estimated_minutes?: number; name: string; done?: boolean; deadline?: string }>
    balanceMode?: string
  }
  const { mode, tasks, balanceMode } = body
  const categories = body.categories ?? ['Work', 'Study', 'Personal', 'Creative', 'Admin']
  const text = body.text ? sanitise(body.text) : ''

  if (mode === 'extract') {
    return Response.json((await generateWithGemini({
      mode: 'extract',
      jsonSchemaText: `{ "tasks": [{ "name": "string", "category": "string", "demand_type": "cognitive" | "emotional" | "creative" | "routine" | "physical", "difficulty": number (1-5), "deadline": "YYYY-MM-DD" or null, "estimated_minutes": number or null, "recurring": "none" | "daily" | "weekly" }] }`,
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
5. **ESTIMATES**: Assign a realistic 'estimated_minutes'. (e.g., gym = 60, dishes = 15).
6. **RECURRING**: If the user explicitly mentions "daily", "every day", "each morning", set recurring to "daily". For "weekly", "every week", set "weekly". Otherwise, "none".
</rules>

<examples>
Input: "hit the gym daily, then call mom and study math"
Thinking Process:
- "hit the gym daily" -> Task: "Hit the gym" (Physical, Daily, ~60m)
- "call mom" -> Task: "Call mom" (Emotional, None, ~20m)
- "study math" -> Task: "Study math" (Cognitive, None, ~90m)
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

  return Response.json({ error: 'Unknown mode' }, { status: 400 })
}
