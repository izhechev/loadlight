"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { Brain, Loader2, CheckCircle, Trash2, Plus, Calendar, ArrowLeft, Zap, AlertTriangle, RefreshCw } from "lucide-react"
import { AppLayout } from "@/components/app-layout"
import { useCategoryStore, getCategoryClasses } from "@/lib/store/categoryStore"
import { useOverwhelmedStore } from "@/lib/store/overwhelmedStore"

type DemandType = 'cognitive' | 'emotional' | 'creative' | 'routine' | 'physical'

interface ExtractedTask {
  name: string
  category: string
  demand_type: DemandType
  difficulty: number
  deadline: string | null
  estimated_minutes: number | null
  recurring?: 'none' | 'daily' | 'weekly'
  times_per_day?: number
}

const DEMAND_COLORS: Record<DemandType, string> = {
  cognitive: 'bg-sky-100/90 text-sky-700',
  emotional: 'bg-pink-100/90 text-pink-700',
  creative: 'bg-purple-100/90 text-purple-700',
  routine: 'bg-blue-100/90 text-blue-700',
  physical: 'bg-teal-100/90 text-teal-700',
}

function difficultyLabel(d: number): string {
  return ['', 'Trivial', 'Easy', 'Moderate', 'Hard', 'Extreme'][d] ?? String(d)
}

function difficultyColor(d: number): string {
  if (d <= 1) return 'bg-green-100 text-green-700'
  if (d <= 2) return 'bg-lime-100 text-lime-700'
  if (d <= 3) return 'bg-yellow-100 text-yellow-700'
  if (d <= 4) return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}

export default function AddTaskPage() {
  const router = useRouter()
  const shouldReduceMotion = useReducedMotion()
  const { state: overwhelmedState } = useOverwhelmedStore()
  const { categories } = useCategoryStore()
  const [input, setInput] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [preview, setPreview] = useState<ExtractedTask[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Restore tasks from localStorage
  function getStoredTasks(): ExtractedTask[] {
    try { return JSON.parse(localStorage.getItem('loadlight-tasks') ?? '[]') as ExtractedTask[] } catch { return [] }
  }

  async function handleExtract() {
    if (!input.trim()) return
    setIsExtracting(true)
    setPreview(null)
    setError(null)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: input, 
          mode: 'extract',
          categories: categories.map(c => c.name) 
        }),
      })
      if (!res.ok) throw new Error('API error')
      const data = await res.json() as { tasks?: ExtractedTask[] }
      if (data.tasks?.length) {
        setPreview(data.tasks.map(t => ({ ...t, recurring: t.recurring || 'none' })))
      } else {
        throw new Error('No tasks extracted')
      }
    } catch {
      // NFR-8: fallback to manual entry
      setPreview([{
        name: input,
        life_domain: 'personal',
        demand_type: 'routine',
        difficulty: 2,
        deadline: null,
        estimated_minutes: 30,
        recurring: 'none',
        times_per_day: 1
      }])
      setError('AI unavailable — added as manual task. You can edit the details below.')
    } finally {
      setIsExtracting(false)
    }
  }

  function confirm() {
    if (!preview) return
    const existing = getStoredTasks()
    
    const finalTasks: any[] = []
    preview.forEach(t => {
      const times = t.times_per_day || 1
      if (times > 1) {
        for (let i = 1; i <= times; i++) {
          finalTasks.push({
            ...t,
            name: `${t.name} (${i}/${times})`,
            id: Math.random().toString(36).slice(2),
            done: false,
            createdAt: Date.now()
          })
        }
      } else {
        finalTasks.push({
          ...t,
          id: Math.random().toString(36).slice(2),
          done: false,
          createdAt: Date.now()
        })
      }
    })

    localStorage.setItem('loadlight-tasks', JSON.stringify([...existing, ...finalTasks]))
    setSaved(true)
    setTimeout(() => router.push('/tasks'), 800)
  }

  const mc = shouldReduceMotion ? { duration: 0 } : { duration: 0.22 }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="page-header flex items-center gap-3">
          <button onClick={() => router.back()} className="text-slate-500 hover:text-slate-800 transition-colors bg-white/50 p-2 rounded-full border border-sky-100/60 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-slate-800">Add Tasks</h1>
            <p className="text-sm text-slate-500 font-bold">Type naturally — AI extracts and classifies each task</p>
          </div>
        </div>

        {/* Input blocked in overwhelmed state */}
        {overwhelmedState === 'overwhelmed' ? (
          <div className="glass-panel p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto mb-3" />
            <h2 className="font-bold text-slate-700 mb-2">Rest Mode Active</h2>
            <p className="text-sm text-slate-500">Adding new tasks is limited during rest mode. Take a break first.</p>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={mc} className="glass-panel p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-sky-600" />
              <h2 className="font-bold text-slate-700">Natural Language Input</h2>
            </div>
            <textarea
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleExtract() }}
              placeholder={'"Finish the report by Friday, buy groceries, call mom, hit the gym"'}
              className="input-skeu w-full rounded-xl p-4 text-sm text-slate-800 placeholder:text-slate-400 resize-none focus:outline-none min-h-[100px]"
              rows={4}
            />
            {error && (
              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-3.5 h-3.5" /> {error}
              </p>
            )}
            <div className="flex justify-between items-center mt-3">
              <p className="text-xs text-slate-400 font-bold italic">Ctrl+Enter to extract</p>
              <button
                onClick={handleExtract}
                disabled={isExtracting || !input.trim()}
                className="glow-button font-black px-5 py-2 text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                {isExtracting ? 'Extracting...' : 'Extract Tasks'}
              </button>
            </div>
          </motion.div>
        )}

        {/* Preview */}
        <AnimatePresence>
          {preview && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={mc}
              className="glass-panel p-6"
            >
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                AI Extracted {preview.length} Task{preview.length !== 1 ? 's' : ''} — Review &amp; Confirm
              </p>
              <div className="space-y-3">
                {preview.map((task, i) => {
                  const catName = (task.category || 'Personal').toLowerCase()
                  const cat = categories.find(c => c.name.toLowerCase() === catName || c.id === task.category)
                  const cls = getCategoryClasses(cat?.color ?? 'sky')
                  return (
                  <div key={i} className={`bg-white/50 rounded-2xl border border-sky-100/60 overflow-hidden ${cls.bg.replace('bg-', 'border-l-4 border-l-')}`}>
                    {/* Task row */}
                    <div className="flex items-center gap-3 p-4">
                      <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="flex-1 font-bold text-slate-800 text-sm">{task.name}</span>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${cls.bg} ${cls.text} badge-skeu shrink-0 border border-sky-100/50 shadow-sm`}>{cat?.emoji ?? '📌'} {task.category}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${DEMAND_COLORS[task.demand_type]} border border-sky-100/50 shadow-sm`}>{task.demand_type}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${difficultyColor(task.difficulty)} border border-white/5 shadow-sm`}>{difficultyLabel(task.difficulty)}</span>
                        {task.estimated_minutes && <span className="text-[10px] text-slate-400 font-bold">{task.estimated_minutes}m</span>}
                      </div>
                      <button onClick={() => setPreview(prev => prev?.filter((_, j) => j !== i) ?? null)} className="text-slate-500 hover:text-red-400 transition-colors ml-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {/* Deadline & Recurring row */}
                    <div className="px-4 pb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-sky-100/50 pt-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Deadline:</span>
                        <input
                          type="date"
                          value={task.deadline ?? ''}
                          onChange={e => setPreview(prev => prev?.map((t, j) => j === i ? { ...t, deadline: e.target.value || null } : t) ?? null)}
                          className="input-skeu text-[10px] rounded-lg px-2 py-1 text-slate-700 focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Repeat:</span>
                        <div className="flex bg-sky-50/70 rounded-lg p-0.5 border border-sky-100/60">
                          {(['none', 'daily', 'weekly'] as const).map(mode => (
                            <button
                              key={mode}
                              onClick={() => setPreview(prev => prev?.map((t, j) => j === i ? { ...t, recurring: mode } : t) ?? null)}
                              className={`text-[9px] px-2 py-0.5 rounded-md font-black transition-all ${
                                (task.recurring || 'none') === mode
                                  ? 'bg-white/90 text-sky-800 shadow-inner'
                                  : 'text-slate-500 hover:text-slate-700'
                              }`}
                            >
                              {mode.charAt(0).toUpperCase() + mode.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {task.recurring === 'daily' && (
                        <div className="flex items-center gap-2 ml-2">
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Times/day:</span>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={task.times_per_day || 1}
                            onChange={e => setPreview(prev => prev?.map((t, j) => j === i ? { ...t, times_per_day: parseInt(e.target.value) || 1 } : t) ?? null)}
                            className="input-skeu w-10 text-[10px] rounded-lg px-2 py-1 text-slate-700 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  )
                })}
              </div>
              <div className="flex gap-3 mt-5">
                {saved ? (
                  <div className="flex items-center gap-2 text-emerald-600 font-black text-sm">
                    <CheckCircle className="w-4 h-4" /> Saved! Redirecting…
                  </div>
                ) : (
                  <>
                    <button onClick={confirm} className="glow-button font-black px-6 py-2.5 text-sm flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Save {preview.length} Task{preview.length !== 1 ? 's' : ''}
                    </button>
                    <button onClick={() => { setPreview(null); setInput('') }} className="bg-white/50 border border-sky-100/60 text-slate-500 font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-white/80 hover:text-slate-700 transition-all">
                      Discard
                    </button>
                  </>
                )}
              </div>
              <p className="text-[10px] text-slate-500 font-bold mt-3 italic">🤖 AI-generated · all fields editable before saving</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  )
}
