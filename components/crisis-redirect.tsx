"use client"

import { motion } from "framer-motion"
import { Heart, PhoneCall, MessageSquare, ExternalLink } from "lucide-react"

interface CrisisRedirectProps {
  onDismiss: () => void
}

// FR-4: Static crisis redirect — hardcoded, never AI-generated
export function CrisisRedirect({ onDismiss }: CrisisRedirectProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", bounce: 0.25 }}
        className="glass-panel p-8 max-w-md w-full relative overflow-hidden"
      >
        {/* Soft tint */}
        <div className="absolute inset-0 bg-gradient-to-br from-sky-50/80 to-teal-50/60 rounded-3xl pointer-events-none" />

        <div className="relative space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center shadow-md">
              <Heart className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-black text-slate-800 text-lg">You&apos;re doing your best.</h2>
              <p className="text-xs text-slate-500 mt-0.5">It&apos;s okay to ask for help.</p>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            LoadLight tracks tasks, not mental health. If you&apos;re struggling, please reach out to one of these free resources:
          </p>

          {/* Resources */}
          <div className="space-y-3">
            <a
              href="tel:988"
              className="flex items-center gap-4 bg-white/60 rounded-2xl p-4 border border-white/60 hover:bg-white/80 transition-colors group"
            >
              <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center shrink-0">
                <PhoneCall className="w-4 h-4 text-sky-600" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm group-hover:text-sky-700 transition-colors">988 Suicide &amp; Crisis Lifeline</p>
                <p className="text-xs text-slate-500">Call or text <strong>988</strong> — free, 24/7</p>
              </div>
            </a>

            <a
              href="sms:741741?body=HOME"
              className="flex items-center gap-4 bg-white/60 rounded-2xl p-4 border border-white/60 hover:bg-white/80 transition-colors group"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm group-hover:text-emerald-700 transition-colors">Crisis Text Line</p>
                <p className="text-xs text-slate-500">Text <strong>HOME</strong> to <strong>741741</strong></p>
              </div>
            </a>

            <a
              href="https://www.iasp.info/resources/Crisis_Centres/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-4 bg-white/60 rounded-2xl p-4 border border-white/60 hover:bg-white/80 transition-colors group"
            >
              <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                <ExternalLink className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm group-hover:text-purple-700 transition-colors">International Crisis Centres</p>
                <p className="text-xs text-slate-500">IASP directory — worldwide resources</p>
              </div>
            </a>
          </div>

          <p className="text-xs text-slate-400 text-center">
            This app is not a substitute for professional mental health support.
          </p>

          <button
            onClick={onDismiss}
            className="glow-button w-full text-white font-bold py-3 rounded-2xl text-sm"
          >
            I&apos;m okay, return to tasks
          </button>
        </div>
      </motion.div>
    </div>
  )
}
