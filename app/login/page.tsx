"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2, Mail, Lock, Eye, EyeOff, MailCheck } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifyPending, setVerifyPending] = useState(false)

  function switchTab(next: 'signin' | 'signup') {
    setTab(next)
    setError(null)
    setVerifyPending(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      router.push('/dashboard')
      return
    }

    const supabase = createClient()

    if (tab === 'signup') {
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      })
      if (err) { setError(err.message); setLoading(false) }
      else { setVerifyPending(true); setLoading(false) }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) { setError(err.message); setLoading(false) }
      else router.push('/dashboard')
    }
  }

  return (
    <div className="aero-bg min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, type: 'spring', bounce: 0.25 }}
        className="glass-panel p-8 max-w-sm w-full"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <Image src="/logo.png" alt="LoadLight" width={80} height={80} className="logo-glow logo-float mb-4" />
          <h1 className="text-2xl font-black gradient-text">LoadLight</h1>
          <p className="text-sm text-slate-500 mt-1">Balance your load, lighten your mind</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-sky-50/70 rounded-2xl p-1 border border-sky-100/60 mb-6">
          {(['signin', 'signup'] as const).map(t => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`flex-1 py-2 rounded-xl text-sm font-black transition-all ${
                tab === t
                  ? 'bg-white shadow-sm text-sky-700'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'signin' ? 'Sign in' : 'Register'}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {verifyPending ? (
            <motion.div
              key="verify"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center py-4"
            >
              <MailCheck className="w-12 h-12 text-sky-500 mx-auto mb-3" />
              <h2 className="font-black text-slate-800 mb-2">Check your email</h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                We sent a verification link to <span className="font-bold text-slate-700">{email}</span>.
                Click it to activate your account, then come back and sign in.
              </p>
              <button
                onClick={() => switchTab('signin')}
                className="mt-5 glow-button font-black py-2.5 px-6 text-sm"
              >
                Back to sign in
              </button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Your email"
                  required
                  autoComplete="email"
                  className="w-full pl-11 pr-4 py-3.5 bg-white/60 rounded-2xl text-sm text-slate-700 placeholder:text-slate-400 border border-white/70 focus:outline-none focus:ring-2 focus:ring-sky-300 input-skeu"
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="password"
                  name="password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={tab === 'signup' ? 'Choose a password (min 6 chars)' : 'Password'}
                  required
                  minLength={tab === 'signup' ? 6 : undefined}
                  autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                  className="w-full pl-11 pr-11 py-3.5 bg-white/60 rounded-2xl text-sm text-slate-700 placeholder:text-slate-400 border border-white/70 focus:outline-none focus:ring-2 focus:ring-sky-300 input-skeu"
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="glow-button w-full text-white font-black py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {tab === 'signup' ? 'Create account' : 'Sign in'}
              </button>

              {!process.env.NEXT_PUBLIC_SUPABASE_URL && (
                <div className="text-center pt-1">
                  <Link href="/dashboard" className="text-xs text-slate-400 hover:text-slate-600">
                    Continue as guest (demo mode) →
                  </Link>
                </div>
              )}
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
