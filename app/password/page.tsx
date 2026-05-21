'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { playcePrimaryCtaStyle } from '@/lib/playce-confirm-helpers'

export default function PasswordPage() {
  const [input, setValue] = useState('')
  const [error, setError] = useState(false)
  const router = useRouter()

  const handleSubmit = async () => {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input }),
    })

    if (res.ok) {
      router.push('/')
    } else {
      setError(true)
      setValue('')
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '32px',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: '14px',
          color: 'var(--text-primary)',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
        }}
      >
        Playce
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          width: '280px',
        }}
      >
        <input
          type="password"
          value={input}
          onChange={(e) => {
            setValue(e.target.value)
            setError(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Enter access code"
          autoFocus
          style={{
            background: 'transparent',
            border: `1px solid ${error ? 'rgba(220,80,80,0.5)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: '14px',
            padding: '12px 16px',
            outline: 'none',
            width: '100%',
            letterSpacing: '0.02em',
          }}
        />

        {error && (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              color: 'rgba(220,80,80,0.7)',
              textAlign: 'center',
            }}
          >
            Incorrect code — try again.
          </p>
        )}

        <button
          onClick={handleSubmit}
          style={{
            ...playcePrimaryCtaStyle,
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            padding: '12px',
          }}
        >
          Enter →
        </button>
      </div>

      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '11px',
          color: 'var(--text-muted)',
          textAlign: 'center',
          maxWidth: '240px',
          lineHeight: 1.6,
        }}
      >
        This is a private demo.
      </p>
    </div>
  )
}
