'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '32px',
      }}
    >
      <p
        style={{
          fontFamily: 'Georgia, serif',
          fontSize: '24px',
          color: '#ffffff',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
        }}
      >
        PLAYCE
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
            border: `1px solid ${error ? 'rgba(220,80,80,0.5)' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: '2px',
            color: '#ffffff',
            fontSize: '14px',
            padding: '12px 16px',
            outline: 'none',
            width: '100%',
            letterSpacing: '0.1em',
          }}
        />

        {error && (
          <p
            style={{
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
            background: '#C17D3C',
            border: 'none',
            borderRadius: '2px',
            color: '#1a0e00',
            fontSize: '13px',
            fontWeight: 600,
            padding: '12px',
            cursor: 'pointer',
            width: '100%',
            letterSpacing: '0.03em',
          }}
        >
          Enter →
        </button>
      </div>

      <p
        style={{
          fontSize: '11px',
          color: 'rgba(255,255,255,0.2)',
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
