"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { Loader2, Mail, Lock, Eye, EyeOff } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    // If Supabase not configured yet, skip to dashboard (demo mode)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      router.push('/dashboard')
      return
    }

    const supabase = createClient()

    if (isSignUp) {
      const { error: err } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } })
      if (err) { setError(err.message); setLoading(false) }
      else { setSuccess('Check your email to confirm your account!'); setLoading(false) }
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
        <div className="flex flex-col items-center mb-8">
          <Image src="/logo.png" alt="LoadLight" width={80} height={80} className="logo-glow logo-float mb-4" />
          <h1 className="text-2xl font-black gradient-text">LoadLight</h1>
          <p className="text-sm text-slate-500 mt-1">Balance your load, lighten your mind</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Your email"
              required
              className="w-full pl-11 pr-4 py-3.5 bg-white/60 rounded-2xl text-sm text-slate-700 placeholder:text-slate-400 border border-white/70 focus:outline-none focus:ring-2 focus:ring-sky-300 input-skeu"
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full pl-11 pr-11 py-3.5 bg-white/60 rounded-2xl text-sm text-slate-700 placeholder:text-slate-400 border border-white/70 focus:outline-none focus:ring-2 focus:ring-sky-300 input-skeu"
            />
            <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
          {success && <p className="text-sm text-emerald-600 bg-emerald-50 rounded-xl px-3 py-2">{success}</p>}

          <button
            type="submit"
            disabled={loading}
            className="glow-button w-full text-white font-black py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isSignUp ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="mt-5 text-center space-y-3">
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(null) }}
            className="text-sm text-sky-600 hover:text-sky-800 font-medium"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>

          {!process.env.NEXT_PUBLIC_SUPABASE_URL && (
            <div>
              <div className="border-t border-white/40 pt-3" />
              <Link href="/dashboard" className="text-xs text-slate-400 hover:text-slate-600">
                Continue as guest (demo mode) →
              </Link>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
