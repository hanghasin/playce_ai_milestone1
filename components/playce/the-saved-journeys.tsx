'use client'

import type { MatrixLocationData } from '@/lib/playce-location-types'
import type { RefineProfile } from '@/components/playce/the-refine'
import type { SavedJourneyAdvisorSnapshot } from '@/lib/journey-advisor-session'

const fontBody = 'var(--font-body)'
const fontDisplay = 'var(--font-display)'

export interface SavedJourneyEntry {
  savedAt: string
  query?: string
  location: MatrixLocationData
  refine: RefineProfile
  /** Latest advisor itinerary + chat when user tapped Save this journey. */
  advisorSnapshot?: SavedJourneyAdvisorSnapshot
}

interface TheSavedJourneysProps {
  items: SavedJourneyEntry[]
  onBack: () => void
  onRestore: (item: SavedJourneyEntry) => void
  onDelete: (index: number) => void
}

export function TheSavedJourneys({ items, onBack, onRestore, onDelete }: TheSavedJourneysProps) {
  return (
    <div className="min-h-screen px-5 md:px-10 py-16" style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <div className="max-w-[1000px] mx-auto">
        <button
          type="button"
          onClick={onBack}
          className="border-0 bg-transparent p-0 cursor-pointer mb-8"
          style={{ fontFamily: fontBody, fontSize: 13, color: 'var(--text-secondary)' }}
        >
          ← Back
        </button>

        <h1
          style={{
            fontFamily: fontDisplay,
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: 'var(--text-primary)',
            lineHeight: 1.05,
            marginBottom: 6,
          }}
        >
          Saved journeys
        </h1>
        <p style={{ fontFamily: fontBody, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 26 }}>
          {items.length} saved
        </p>

        {items.length === 0 ? (
          <p style={{ fontFamily: fontBody, fontSize: 14, color: 'var(--text-secondary)' }}>
            No saved journeys yet.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div
                key={`${item.location.name}-${item.savedAt}-${idx}`}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 py-4"
                style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
              >
                <div>
                  <p style={{ fontFamily: fontDisplay, fontWeight: 700, letterSpacing: '-0.03em', fontSize: 28, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                    {item.location.name}
                  </p>
                  <p style={{ fontFamily: fontBody, fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {item.location.country} · {item.location.activity}
                    {item.advisorSnapshot?.durationDays
                      ? ` · ${item.advisorSnapshot.durationDays} days`
                      : ''}
                    {' · '}
                    {new Date(item.savedAt).toLocaleString()}
                  </p>
                  {item.query ? (
                    <p style={{ fontFamily: fontBody, fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      Query: {item.query}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onDelete(idx)}
                    className="border-0 cursor-pointer px-4 py-2.5"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 500,
                      letterSpacing: '0.02em',
                      fontSize: 13,
                      color: 'var(--text-muted)',
                      background: 'transparent',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 5,
                    }}
                    aria-label={`Remove ${item.location.name} from saved journeys`}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => onRestore(item)}
                    className="playce-btn playce-btn--primary px-6 py-2.5"
                    style={{ fontWeight: 500 }}
                  >
                    Restore →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
