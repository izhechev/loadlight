"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { disableGuestMode, enableGuestMode } from "@/lib/data/tasks"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "@/lib/icons"
import styles from "./login.module.css"

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
      else {
        disableGuestMode()
        router.push('/dashboard')
      }
    }
  }

  return (
    <main className={`aero-bg ${styles.desktop}`}>
      <div className={styles.window}>
        <div className={styles.titleBar}>
          <Image src="/logo.png" alt="" width={26} height={26} />
          <span>LoadLight</span>
          <Link href="/" className={styles.homeLink}>
            <ArrowLeft aria-hidden="true" />
            Home
          </Link>
        </div>

        <div className={styles.body}>
          {verifyPending ? (
            <div className={styles.verify}>
              <h1>Check your email</h1>
              <p>
                We sent a verification link to <strong>{email}</strong>.
                Open it to activate your account, then sign in.
              </p>
              <button type="button" onClick={() => switchTab('signin')} className={styles.primary}>
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <h1>{tab === 'signup' ? 'Create an account' : 'Sign in'}</h1>
              <div className={styles.switcher} role="group" aria-label="Account options">
                <button type="button" aria-pressed={tab === 'signin'} onClick={() => switchTab('signin')}>
                  Sign in
                </button>
                <button type="button" aria-pressed={tab === 'signup'} onClick={() => switchTab('signup')}>
                  Create account
                </button>
              </div>

              <form onSubmit={handleSubmit} className={styles.form}>
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                  className="input-skeu"
                />

                <label htmlFor="password">Password</label>
                <div className={styles.password}>
                  <input
                    id="password"
                    name="password"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    required
                    minLength={tab === 'signup' ? 6 : undefined}
                    autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                    aria-describedby={tab === 'signup' ? 'password-hint' : undefined}
                    className="input-skeu"
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)} aria-controls="password">
                    {showPass ? 'Hide' : 'Show'}
                  </button>
                </div>
                {tab === 'signup' && <p id="password-hint" className={styles.hint}>Use at least 6 characters.</p>}

                {error && <p role="alert" className={styles.error}>{error}</p>}

                <button type="submit" disabled={loading} className={styles.primary}>
                  {loading
                    ? tab === 'signup' ? 'Creating account…' : 'Signing in…'
                    : tab === 'signup' ? 'Create account' : 'Sign in'}
                </button>
              </form>

              <div className={styles.guest}>
                <button type="button" onClick={() => { enableGuestMode(); router.push('/dashboard') }}>
                  Try without an account
                </button>
                <p>Guest tasks are saved on this device.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
