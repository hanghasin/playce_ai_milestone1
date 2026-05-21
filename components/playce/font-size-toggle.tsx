'use client'

import { useEffect, useState } from 'react'

const SIZES = [14, 16, 18] as const
const STORAGE_KEY = 'playce_font_size'

export function FontSizeToggle() {
  const [size, setSize] = useState<number>(16)

  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(STORAGE_KEY))
      const initial = SIZES.includes(stored as (typeof SIZES)[number]) ? stored : 16
      setSize(initial)
      document.documentElement.style.fontSize = `${initial}px`
    } catch {
      document.documentElement.style.fontSize = '16px'
    }
  }, [])

  const cycle = () => {
    const idx = SIZES.indexOf(size as (typeof SIZES)[number])
    const next = SIZES[(idx + 1) % SIZES.length]
    setSize(next)
    document.documentElement.style.fontSize = `${next}px`
    try {
      localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label="Adjust font size"
      title="Font size"
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-muted)',
        fontSize: 13,
        padding: '4px 8px',
        fontFamily: 'var(--font-display)',
      }}
    >
      Aa
    </button>
  )
}
