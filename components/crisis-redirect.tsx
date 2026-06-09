/* eslint-disable react/no-unescaped-entities */
"use client"

import { Phone, MessageSquare, X } from "@/lib/icons"
import { ClassicIcon } from "@/lib/classic-icons"

interface CrisisRedirectProps {
  onDismiss: () => void
  onExitRestMode: () => void
}

// FR-4: Static crisis redirect — hardcoded, never AI-generated
export function CrisisRedirect({ onDismiss, onExitRestMode }: CrisisRedirectProps) {
  return (
    <div className="anim-overlay-in" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.45)' }}>
      <div className="vista-dialog anim-scale-in" style={{ maxWidth: 440, width: '100%', position: 'relative' }}>
        {/* Title bar */}
        <div className="vista-titlebar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 6px 12px' }}>
          <span style={{ fontWeight: 800, fontSize: 13 }}>Rest Mode</span>
          <button onClick={onDismiss} className="vista-close-btn" aria-label="Close" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X style={{ width: 11, height: 11, color: '#fff' }} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <ClassicIcon name="navheart" size={40} />
          </div>

          <h2 className="font-black" style={{ color: '#1a1a1a', fontSize: 18, textAlign: 'center', marginBottom: 6 }}>Rest Mode Activated</h2>
          <p style={{ color: '#3a5a7a', textAlign: 'center', marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
            You've marked yourself as overwhelmed. We've paused non-essential tasks to help you focus on recovery. Take a deep breath.
          </p>

          <p className="vista-label" style={{ textAlign: 'center', marginBottom: 8 }}>Professional Resources</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            <a href="tel:988" className="skeu-inset" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, textDecoration: 'none', borderRadius: 4 }}>
              <span className="aero-info" style={{ width: 34, height: 34, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Phone style={{ width: 18, height: 18, color: '#1a6ab8' }} />
              </span>
              <span>
                <p className="font-bold" style={{ color: '#1a1a1a', fontSize: 13 }}>988 Lifeline</p>
                <p style={{ color: '#5a7a9a', fontSize: 11 }}>Free, confidential support 24/7</p>
              </span>
            </a>

            <a href="sms:741741?body=HOME" className="skeu-inset" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, textDecoration: 'none', borderRadius: 4 }}>
              <span className="aero-success" style={{ width: 34, height: 34, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MessageSquare style={{ width: 18, height: 18, color: '#1a7a50' }} />
              </span>
              <span>
                <p className="font-bold" style={{ color: '#1a1a1a', fontSize: 13 }}>Crisis Text Line</p>
                <p style={{ color: '#5a7a9a', fontSize: 11 }}>Text HOME to 741741</p>
              </span>
            </a>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={onExitRestMode} className="glow-button" style={{ width: '100%', padding: '10px', fontSize: 13, textAlign: 'center' }}>
              Exit Rest Mode &amp; Return to Tasks
            </button>
            <button onClick={onDismiss} className="vista-btn-secondary" style={{ width: '100%', padding: '8px', fontSize: 13 }}>
              Stay in Rest Mode (Close)
            </button>
            <p style={{ textAlign: 'center', color: '#7a9ab8', fontSize: 11, fontWeight: 700, marginTop: 6, lineHeight: 1.5 }}>
              LoadLight tracks tasks, not mental health. Please reach out to a professional if you need support.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
