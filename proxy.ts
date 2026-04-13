import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED = ['/dashboard', '/tasks', '/settings', '/categories', '/onboarding']
const AUTH_ONLY  = ['/login', '/signup']

export async function proxy(request: NextRequest) {
  // Demo mode — Supabase not configured, pass everything through
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return NextResponse.next()
  }

  try {
    const response = NextResponse.next({ request })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // Refresh session — MUST be called before checking user
    const { data: { user } } = await supabase.auth.getUser()

    const { pathname } = request.nextUrl

    const isProtected = PROTECTED.some(p => pathname.startsWith(p))
    const isAuthOnly  = AUTH_ONLY.some(p => pathname.startsWith(p))

    if (isProtected && !user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    if (isAuthOnly && user) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    return response
  } catch {
    // If anything fails (misconfigured Supabase, network error), pass through
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    // Exclude static assets, API routes, and auth callback (needs to run before session exists)
    '/((?!_next/static|_next/image|favicon.ico|api/|auth/).*)',
  ],
}
