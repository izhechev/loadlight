"use client"

import { useEffect, useRef, type ReactNode } from 'react'

export function TaskClarificationDialog({ question, children, onSkip, busy }: {
  question: string
  children: ReactNode
  onSkip: () => void
  busy?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const popup = dialog.current
    if (!popup) return
    popup.showModal()
    return () => popup.close()
  }, [])

  return (
    <dialog ref={dialog} aria-labelledby="task-clarification-heading" aria-describedby="task-clarification-question"
      onCancel={event => { event.preventDefault(); if (!busy) onSkip() }}
      className="vista-dialog fixed inset-0 m-auto w-[min(28rem,calc(100%-2rem))] p-5 backdrop:bg-black/50">
      <h2 id="task-clarification-heading" className="text-lg font-bold mb-2">Clarify this task</h2>
      <p id="task-clarification-question" className="text-sm mb-4">{question}</p>
      {children}
      <button type="button" disabled={busy} onClick={onSkip} className="vista-btn-secondary mt-3 px-3 py-2 text-sm">Keep as entered</button>
    </dialog>
  )
}
