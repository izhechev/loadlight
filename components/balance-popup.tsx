"use client"

import { useEffect, useRef, useState } from "react"
import { X, EyeOff, Trash2, Plus, CheckCircle } from "@/lib/icons"
import { ClassicIcon } from "@/lib/classic-icons"
import type { BalanceResult, AddItem } from "@/lib/utils/balance"

interface BalancePopupProps {
  result: BalanceResult
  onHide: (id: string) => Promise<void>
  onArchive: (id: string) => Promise<void>
  onAdd: (item: AddItem) => Promise<void>
  onClose: () => void
}

export function BalancePopup({ result, onHide, onArchive, onAdd, onClose }: BalancePopupProps) {
  const [acted, setActed] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previous = document.activeElement
    closeButton.current?.focus()
    return () => { if (previous instanceof HTMLElement) previous.focus() }
  }, [])

  async function apply(key: string, label: string, action: () => Promise<void>) {
    setError(false)
    setPending(true)
    try {
      await action()
      setActed(previous => ({ ...previous, [key]: label }))
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  const tooMuch = result.verdict === 'too_much'
  const icon = tooMuch ? 'warning' : 'chart'

  return (
    <div className="anim-overlay-in" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.45)' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="balance-result-heading" onKeyDown={event => { if (event.key === 'Escape') onClose() }} className="vista-dialog anim-scale-in" style={{ maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Title bar */}
        <div className="vista-titlebar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 6px 12px' }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>Balance Check</span>
          <button ref={closeButton} onClick={onClose} className="vista-close-btn" aria-label="Close" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X style={{ width: 11, height: 11, color: '#fff' }} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          <div className="flex items-center gap-2 mb-2">
            <ClassicIcon name={icon} size={22} />
            <h2 id="balance-result-heading" className="font-black" style={{ color: '#1a1a1a', fontSize: 17 }}>{result.headline}</h2>
          </div>
          <p style={{ color: '#3a5a7a', fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>{result.reason}</p>

          {tooMuch && result.remove.length > 0 && (
            <div className="space-y-2 mb-2">
              {result.remove.map(item => {
                const done = acted[item.id]
                return (
                  <div key={item.id} className="skeu-inset" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 4 }}>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate" style={{ color: '#1a1a1a' }}>{item.name}</p>
                      <p className="text-[11px] font-bold opacity-70" style={{ color: '#5a7a9a' }}>{item.reason}</p>
                    </div>
                    {done ? (
                      <span className="flex items-center gap-1 text-xs font-black" style={{ color: '#1a7a50' }}>
                        <CheckCircle className="w-4 h-4" /> {done}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => void apply(item.id, 'Hidden', () => onHide(item.id))}
                          disabled={pending}
                          className="vista-btn-secondary text-xs font-black px-3 py-1.5 flex items-center gap-1"
                        >
                          <EyeOff className="w-3.5 h-3.5" /> Hide for the week
                        </button>
                        <button
                          onClick={() => void apply(item.id, 'Moved to Removed', () => onArchive(item.id))}
                          disabled={pending}
                          className="text-[11px] font-bold flex items-center gap-1 transition-colors"
                          style={{ color: '#a83232' }}
                          title="You can restore the task from Removed"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Too little -> add */}
          {!tooMuch && result.add.length > 0 && (
            <div className="space-y-2 mb-2">
              {result.add.map((item, i) => {
                const key = `add-${i}-${item.name}`
                const done = acted[key]
                return (
                  <div key={key} className="skeu-inset" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 4 }}>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate" style={{ color: '#1a1a1a' }}>{item.name}</p>
                      <p className="text-[11px] font-bold opacity-70" style={{ color: '#5a7a9a' }}>{item.category} · {item.estimatedMinutes ?? 30} min · {item.reason}</p>
                    </div>
                    {done ? (
                      <span className="flex items-center gap-1 text-xs font-black shrink-0" style={{ color: '#1a7a50' }}>
                        <CheckCircle className="w-4 h-4" /> Added
                      </span>
                    ) : (
                      <button
                        onClick={() => void apply(key, 'Added', () => onAdd(item))}
                        disabled={pending}
                        className="glow-button text-xs font-black px-3 py-1.5 flex items-center gap-1 shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <p className="text-[11px] font-bold mt-3 italic" style={{ color: '#7a9ab8' }}>
            {result.source === 'groq' ? 'Groq suggestions' : result.source === 'gemini' ? 'Gemini suggestions' : 'Based on your task list'}
          </p>

          {error && <p role="alert" className="text-sm" style={{ color: '#a83232' }}>Couldn’t update the task. Close this and check your task list.</p>}

          <button onClick={onClose} className="vista-btn-secondary" style={{ width: '100%', padding: '8px', fontSize: 13, marginTop: 10 }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
