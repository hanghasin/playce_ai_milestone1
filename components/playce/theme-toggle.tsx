'use client'

import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    try {
      const stored = localStorage.getItem('playce_theme')
      const initial = stored === 'light' ? 'light' : 'dark'
      setTheme(initial)
      document.documentElement.setAttribute('data-theme', initial)
    } catch {
      setTheme('dark')
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('playce_theme', next)
  }

  return (
    <button
      onClick={toggle}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-muted)',
        fontSize: '14px',
        padding: '4px 8px',
        display: 'flex',
        alignItems: 'center',
      }}
      aria-label="Toggle theme"
      type="button"
    >
      {theme === 'dark' ? '◐' : '○'}
    </button>
  )
}
