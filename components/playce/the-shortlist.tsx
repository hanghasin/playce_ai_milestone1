'use client'

import Image from 'next/image'
import type { MatrixLocationData } from '@/lib/playce-location-types'
import { resolveCardLocationLabel } from '@/lib/resolve-card-location-label'

const fontBody = 'var(--font-body)'
const fontDisplay = 'var(--font-display)'

interface TheShortlistProps {
  items: MatrixLocationData[]
  onBack: () => void
  onBackToExplore: () => void
  onSelectLocation: (location: MatrixLocationData) => void
  onRemove: (location: MatrixLocationData) => void
}

function sentenceCase(value: string): string {
  const lower = value.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function formatSeason(season?: string): string {
  if (!season) return ''
  return season
    .replace(/[—–-]/g, '·')
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => sentenceCase(s))
    .join(' · ')
}

function vibeTokens(vibe?: string): string[] {
  if (!vibe) return []
  return vibe
    .split(/[,|·/]/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 3)
}

export function TheShortlist({ items, onBack, onBackToExplore, onSelectLocation, onRemove }: TheShortlistProps) {
  return (
    <div
      className="min-h-screen px-5 md:px-10 py-16"
      style={{ background: 'var(--bg)', minHeight: '100vh' }}
    >
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-10 pr-16 md:pr-24">
          <button
            type="button"
            onClick={onBack}
            className="border-0 bg-transparent p-0 cursor-pointer"
            style={{ fontFamily: fontBody, fontSize: 13, color: 'rgba(255,255,255,0.45)' }}
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={onBackToExplore}
            className="border-0 bg-transparent p-0 cursor-pointer text-[13px] tracking-[0.12em] uppercase"
            style={{ fontFamily: fontBody, fontWeight: 500, color: 'rgba(255,255,255,0.55)' }}
          >
            Explore
          </button>
        </div>
        <h1
          className="mb-2"
          style={{ fontFamily: fontDisplay, fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, color: 'var(--text-primary)' }}
        >
          Saved destinations
        </h1>
        <p style={{ fontFamily: fontBody, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
          {items.length} places saved
        </p>

        {items.length === 0 ? (
          <div className="min-h-[50vh] flex flex-col items-center justify-center text-center">
            <p style={{ fontFamily: fontBody, fontSize: 16, color: 'var(--text-muted)', marginBottom: 16 }}>
              Nothing saved yet.
            </p>
            <button
              type="button"
              onClick={onBackToExplore}
              className="border-0 bg-transparent p-0 cursor-pointer"
              style={{ fontFamily: fontBody, fontSize: 14, color: '#C17D3C' }}
            >
              ← Explore destinations
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mt-10">
              {items.map((location, idx) => {
                const tags = vibeTokens(location.vibe)
                const cardLocationLabel = resolveCardLocationLabel(location)
                const seasonContextLine = `${formatSeason(location.season)} · ${cardLocationLabel}`
                return (
                  <div key={`${location.name}-${location.country}-${idx}`} className="relative min-h-[540px] overflow-hidden" style={{ borderRadius: 5 }}>
                    <button
                      type="button"
                      onClick={() => onSelectLocation(location)}
                      className="absolute inset-0 w-full h-full cursor-pointer text-left"
                      aria-label={`Open ${location.name}`}
                    >
                      <div className="absolute inset-0" style={{ background: 'var(--bg-secondary)' }} />
                      {/^https:\/\/images\.unsplash\.com\//i.test(location.image?.trim() ?? '') ? (
                        <Image
                          src={location.image.trim()}
                          alt={location.name}
                          fill
                          className="object-cover object-center"
                          sizes="(max-width: 768px) 100vw, 33vw"
                        />
                      ) : (
                        <div
                          className="absolute inset-0"
                          style={{
                            background:
                              'linear-gradient(145deg, rgba(30,35,45,0.95) 0%, rgba(18,22,28,1) 100%)',
                          }}
                        />
                      )}
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.25) 70%, rgba(0,0,0,0.15) 100%)' }} />
                      <div
                        className="absolute top-0 left-0 right-0 pointer-events-none"
                        style={{
                          height: 80,
                          background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)',
                        }}
                      />
                      <div
                        className="absolute top-4 left-4 right-4"
                        style={{
                          fontFamily: fontBody,
                          fontWeight: 500,
                          fontSize: 11,
                          color: 'rgba(255,255,255,0.65)',
                          letterSpacing: '0.04em',
                          textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                        }}
                      >
                        {cardLocationLabel}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
                        <h3 style={{ fontFamily: fontDisplay, fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1.05, marginBottom: 4, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                          {location.name}
                        </h3>
                        <p style={{ fontFamily: fontBody, fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 10, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                          {seasonContextLine}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              style={{
                                fontFamily: fontBody,
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                padding: '3px 10px',
                                borderRadius: 5,
                                background: 'transparent',
                                textShadow: '0 1px 4px rgba(0,0,0,0.9)',
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(location)}
                      className="absolute z-20 flex items-center justify-center"
                      style={{
                        top: 10,
                        right: 10,
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        border: 'none',
                        background: 'rgba(0,0,0,0.4)',
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                      aria-label={`Remove ${location.name}`}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="text-center" style={{ marginTop: 40 }}>
              <button
                type="button"
                onClick={onBackToExplore}
                className="border-0 bg-transparent p-0 transition-colors duration-150 cursor-pointer"
                style={{ fontFamily: fontBody, fontSize: 13, color: 'var(--text-muted)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-muted)'
                }}
              >
                Continue exploring →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
