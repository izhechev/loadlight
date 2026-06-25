"use client"

import { useState } from "react"
import { X, EyeOff, Trash2, Plus, CheckCircle } from "@/lib/icons"
import { ClassicIcon } from "@/lib/classic-icons"
import type { BalanceResult, AddItem } from "@/lib/utils/balance"

interface BalancePopupProps {
  result: BalanceResult
  onHide: (id: string) => void
  onDelete: (id: string) => void
  onAdd: (item: AddItem) => void
  onClose: () => void
}

export function BalancePopup({ result, onHide, onDelete, onAdd, onClose }: BalancePopupProps) {
  const [acted, setActed] = useState<Set<string>>(new Set())
  const mark = (key: string) => setActed(prev => new Set([...prev, key]))

  const tooMuch = result.verdict === 'too_much'
  const icon = tooMuch ? 'warning' : 'chart'

  return (
    <div className="anim-overlay-in" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.45)' }}>
      <div className="vista-dialog anim-scale-in" style={{ maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Title bar */}
        <div className="vista-titlebar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 6px 12px' }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>Balance Check</span>
          <button onClick={onClose} className="vista-close-btn" aria-label="Close" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X style={{ width: 11, height: 11, color: '#fff' }} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          <div className="flex items-center gap-2 mb-2">
            <ClassicIcon name={icon} size={22} />
            <h2 className="font-black" style={{ color: '#1a1a1a', fontSize: 17 }}>{result.headline}</h2>
          </div>
          <p style={{ color: '#3a5a7a', fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>{result.reason}</p>

          {/* Too much -> hide / delete */}
          {tooMuch && result.remove.length > 0 && (
            <div className="space-y-2 mb-2">
              {result.remove.map(item => {
                const done = acted.has(item.id)
                return (
                  <div key={item.id} className="skeu-inset" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 4 }}>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate" style={{ color: '#1a1a1a' }}>{item.name}</p>
                      <p className="text-[11px] font-bold opacity-70" style={{ color: '#5a7a9a' }}>{item.reason}</p>
                    </div>
                    {done ? (
                      <span className="flex items-center gap-1 text-xs font-black" style={{ color: '#1a7a50' }}>
                        <CheckCircle className="w-4 h-4" /> Hidden
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => { onHide(item.id); mark(item.id) }}
                          className="vista-btn-secondary text-xs font-black px-3 py-1.5 flex items-center gap-1"
                        >
                          <EyeOff className="w-3.5 h-3.5" /> Hide for the week
                        </button>
                        <button
                          onClick={() => { onDelete(item.id); mark(item.id) }}
                          className="text-[11px] font-bold flex items-center gap-1 transition-colors"
                          style={{ color: '#a83232' }}
                          title="Delete permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
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
                const done = acted.has(key)
                return (
                  <div key={key} className="skeu-inset" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 4 }}>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate" style={{ color: '#1a1a1a' }}>{item.name}</p>
                      <p className="text-[11px] font-bold opacity-70" style={{ color: '#5a7a9a' }}>{item.category} · {item.reason}</p>
                    </div>
                    {done ? (
                      <span className="flex items-center gap-1 text-xs font-black shrink-0" style={{ color: '#1a7a50' }}>
                        <CheckCircle className="w-4 h-4" /> Added
                      </span>
                    ) : (
                      <button
                        onClick={() => { onAdd(item); mark(key) }}
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
            AI suggestions · task data only · you stay in control
          </p>

          <button onClick={onClose} className="vista-btn-secondary" style={{ width: '100%', padding: '8px', fontSize: 13, marginTop: 10 }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
