"use client"

import { useState } from "react"
import { saveTaskSteps, type TaskStep } from "@/lib/data/tasks"
import { suggestedSteps } from "@/lib/utils/taskSteps"

export function TaskSteps({ id, name, steps, done }: { id: string; name: string; steps: TaskStep[]; done: boolean }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [undo, setUndo] = useState<{ before: TaskStep[]; after: TaskStep[] } | null>(null)

  async function preview() {
    setBusy(true)
    setUndo(null)
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'breakdown', text: name }),
      })
      if (!response.ok) throw new Error()
      const data = await response.json() as { tasks: { name: string }[]; source: string }
      setDraft(data.tasks.map(step => step.name).join('\n'))
      setMessage(data.source === 'ai' ? 'Suggested steps' : 'Local checklist')
    } catch {
      setDraft(suggestedSteps(name).join('\n'))
      setMessage('Local checklist')
    } finally { setBusy(false) }
  }

  async function save(previous: TaskStep[], next: TaskStep[], offerUndo = false) {
    setBusy(true)
    try {
      await saveTaskSteps(id, previous, next)
      setUndo(offerUndo ? { before: previous, after: next } : null)
      setDraft(null)
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save these steps.')
    } finally { setBusy(false) }
  }

  const names = draft?.split('\n').map(line => line.trim()).filter(Boolean) ?? []
  return (
    <div className="mt-1 text-xs text-slate-700">
      {steps.map((step, index) => (
        <label key={index} className="flex items-center gap-2 py-1">
          <input type="checkbox" checked={step.done} disabled={busy || done}
            onChange={() => save(steps, steps.map((item, i) => i === index ? { ...item, done: !item.done } : item))} />
          <span className={step.done ? 'line-through' : ''}>{step.name}</span>
        </label>
      ))}
      {message && <p role="status">{message}</p>}
      {draft !== null ? (
        <div className="space-y-1.5 mt-2">
          <label className="block">Steps for {name} (one per line)
            <textarea className="input-skeu block w-full mt-1 rounded-lg px-2 py-1.5" rows={4} maxLength={4000}
              value={draft} onChange={event => setDraft(event.target.value)} />
          </label>
          <button className="vista-btn-secondary px-3 py-1" disabled={busy || !names.length}
            onClick={() => save(steps, names.map(name => ({ name, done: false })), true)}>Save steps</button>
          <button className="px-3 py-1" disabled={busy} onClick={() => { setDraft(null); setMessage('') }}>Cancel</button>
        </div>
      ) : !done && steps.length === 0 ? (
        <button className="text-sky-800 underline py-1" aria-label={`Break down ${name}`} disabled={busy} onClick={preview}>
          {busy ? 'Loading steps…' : 'Break down'}
        </button>
      ) : null}
      {undo && !done && <button className="underline py-1" disabled={busy} onClick={() => save(undo.after, undo.before)}>Undo added steps</button>}
    </div>
  )
}
