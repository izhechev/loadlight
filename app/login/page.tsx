"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Lock, Mail } from "@/lib/icons"

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
    <div className="aero-bg min-h-screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div
        className="glass-panel anim-scale-in"
        style={{ padding: 32, maxWidth: 360, width: '100%' }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <Image src="/logo.png" alt="LoadLight" width={72} height={72} className="logo-glow logo-float" style={{ marginBottom: 12 }} />
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#1a3a6a', marginBottom: 4 }}>LoadLight</h1>
          <p style={{ fontSize: 12, color: '#5a7a9a', fontWeight: 600 }}>Balance your load, lighten your mind</p>
        </div>

        {/* Tabs — Vista-style selector */}
        <div
          style={{
            display: 'flex',
            backgroundColor: '#dce8f4',
            backgroundImage: 'linear-gradient(to bottom, #eef4fa, #d0e4f0)',
            borderRadius: 6,
            padding: 3,
            border: '1px solid #9ab8d0',
            marginBottom: 20,
          }}
        >
          {(['signin', 'signup'] as const).map(t => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              style={{
                flex: 1,
                padding: '6px 0',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                border: tab === t ? '1px solid #6a9fc8' : '1px solid transparent',
                backgroundColor: tab === t ? '#ffffff' : 'transparent',
                backgroundImage: tab === t ? 'linear-gradient(to bottom, #ffffff, #e8f2fa)' : 'none',
                color: tab === t ? '#1a3a6a' : '#5a7a9a',
                boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.90)' : 'none',
              }}
            >
              {t === 'signin' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {verifyPending ? (
          <div className="anim-fade-in" style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✉️</div>
            <h2 style={{ fontWeight: 900, color: '#1a1a1a', marginBottom: 8, fontSize: 16 }}>Check your email</h2>
            <p style={{ fontSize: 13, color: '#4a6a8a', lineHeight: 1.6 }}>
              We sent a verification link to <strong style={{ color: '#1a1a1a' }}>{email}</strong>.
              Click it to activate your account, then come back and sign in.
            </p>
            <button
              onClick={() => switchTab('signin')}
              className="glow-button"
              style={{ marginTop: 20, padding: '8px 24px', fontSize: 13, fontWeight: 900 }}
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#7a9ab8', display: 'flex' }}><Mail style={{ width: 14, height: 14 }} /></span>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Your email"
                required
                autoComplete="email"
                className="input-skeu"
                style={{ width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontSize: 13, borderRadius: 4 }}
              />
            </div>

            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#7a9ab8', display: 'flex' }}><Lock style={{ width: 14, height: 14 }} /></span>
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
                className="input-skeu"
                style={{ width: '100%', paddingLeft: 34, paddingRight: 40, paddingTop: 10, paddingBottom: 10, fontSize: 13, borderRadius: 4 }}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#7a9ab8', fontSize: 13, fontWeight: 700 }}
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>

            {error && (
              <div className="aero-danger" style={{ padding: '8px 12px', borderRadius: 4, fontSize: 12 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="glow-button"
              style={{ width: '100%', padding: '10px', fontSize: 14, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.6 : 1, borderRadius: 4, marginTop: 4 }}
            >
              {loading && <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.40)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
              {tab === 'signup' ? 'Create Account' : 'Sign In'}
            </button>

            {!process.env.NEXT_PUBLIC_SUPABASE_URL && (
              <div style={{ textAlign: 'center', paddingTop: 4 }}>
                <Link href="/dashboard" style={{ fontSize: 11, color: '#5a7a9a', textDecoration: 'underline', fontWeight: 600 }}>
                  Continue as guest (demo mode) →
                </Link>
              </div>
            )}
          </form>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
