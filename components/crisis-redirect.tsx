"use client"

import { motion } from "framer-motion"
import { PhoneCall, MessageSquare, Leaf, Heart, X } from "lucide-react"

interface CrisisRedirectProps {
  onDismiss: () => void
  onExitRestMode: () => void
}

// FR-4: Static crisis redirect — hardcoded, never AI-generated
export function CrisisRedirect({ onDismiss, onExitRestMode }: CrisisRedirectProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", bounce: 0.25 }}
        className="glass-panel-strong p-8 max-w-md w-full relative overflow-hidden bg-white/90 border border-rose-200 shadow-2xl"
      >
        <button 
          onClick={onDismiss}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors bg-white/50 p-2 rounded-full hover:bg-white/80"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="absolute inset-0 bg-gradient-to-br from-rose-100/50 to-pink-50/50 pointer-events-none" />
        
        <div className="relative mt-2">
          <div className="w-16 h-16 bg-gradient-to-br from-pink-400 to-rose-500 rounded-full flex items-center justify-center mb-6 shadow-md mx-auto border border-rose-200">
            <Heart className="w-8 h-8 text-white" />
          </div>

          <h2 className="text-2xl font-black text-slate-800 text-center mb-2">Rest Mode Activated</h2>
          <p className="text-slate-600 text-center mb-6 font-medium leading-relaxed">
            You've marked yourself as overwhelmed. We've paused non-essential tasks to help you focus on recovery. Take a deep breath.
          </p>

          <div className="space-y-3 mb-8">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center mb-2">Professional Resources</p>
            <a href="tel:988" className="flex items-center gap-4 p-4 rounded-2xl bg-white/80 border border-white/80 hover:bg-white transition-colors skeu-inset group">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <PhoneCall className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">988 Lifeline</p>
                <p className="text-xs text-slate-500 font-medium">Free, confidential support 24/7</p>
              </div>
            </a>
            
            <a href="sms:741741?body=HOME" className="flex items-center gap-4 p-4 rounded-2xl bg-white/80 border border-white/80 hover:bg-white transition-colors skeu-inset group">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <MessageSquare className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">Crisis Text Line</p>
                <p className="text-xs text-slate-500 font-medium">Text HOME to 741741</p>
              </div>
            </a>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={onExitRestMode}
              className="bg-gradient-to-r from-emerald-400 to-teal-500 hover:brightness-110 active:brightness-90 transition-all w-full text-white font-black py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-md"
            >
              Exit Rest Mode & Return to Tasks
            </button>
            <button
              onClick={onDismiss}
              className="w-full text-slate-500 hover:text-slate-700 font-bold py-2 rounded-2xl text-sm transition-colors"
            >
              Stay in Rest Mode (Close)
            </button>
            <p className="text-[11px] text-center text-slate-400 font-bold mt-2 leading-relaxed">
              LoadLight tracks tasks, not mental health. Please reach out to a professional if you need support.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}