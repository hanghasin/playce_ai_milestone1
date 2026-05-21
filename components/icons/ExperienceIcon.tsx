import type { ExperienceCardIcon } from '@/lib/experience-cards'

const baseStyle = {
  width: 16,
  height: 16,
  stroke: 'var(--text-muted)',
  fill: 'none',
  strokeWidth: 1.5,
  flexShrink: 0,
} as const

export function ExperienceIcon({ type }: { type: ExperienceCardIcon }) {
  if (type === 'bed') {
    return (
      <svg style={baseStyle} viewBox="0 0 24 24" aria-hidden>
        <path d="M2 20v-8a2 2 0 012-2h16a2 2 0 012 2v8" />
        <path d="M2 14h20M7 14V8a1 1 0 011-1h8a1 1 0 011 1v6" />
      </svg>
    )
  }

  if (type === 'compass') {
    return (
      <svg style={baseStyle} viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <path d="M16.2 7.8l-4.6 4.6-4.6-4.6 4.6 4.6 4.6 4.6" />
      </svg>
    )
  }

  if (type === 'flag') {
    return (
      <svg style={baseStyle} viewBox="0 0 24 24" aria-hidden>
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    )
  }

  if (type === 'ticket') {
    return (
      <svg style={baseStyle} viewBox="0 0 24 24" aria-hidden>
        <path d="M2 9a3 3 0 010 6v2a2 2 0 002 2h16a2 2 0 002-2v-2a3 3 0 010-6V7a2 2 0 00-2-2H4a2 2 0 00-2 2v2z" />
      </svg>
    )
  }

  if (type === 'map-pin') {
    return (
      <svg style={baseStyle} viewBox="0 0 24 24" aria-hidden>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    )
  }

  return null
}
