'use client'

import { IconMapPin, IconRoute } from '@tabler/icons-react'

type PlayceTopNavProps = {
  onBack: () => void
  onOpenSavedJourneys?: () => void
  onOpenSavedDestinations?: () => void
  savedJourneyCount?: number
  savedDestinationCount?: number
}

export function PlayceTopNav({
  onBack,
  onOpenSavedJourneys,
  onOpenSavedDestinations,
  savedJourneyCount = 0,
  savedDestinationCount = 0,
}: PlayceTopNavProps) {
  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 52,
        background: 'rgba(10,10,10,0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        zIndex: 50,
      }}
    >
      <div className="flex items-center gap-4">
        <button type="button" onClick={onBack} className="playce-btn px-5 py-2">
          Back
        </button>
        <span
          className="text-sm uppercase text-zinc-200"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 400,
            letterSpacing: '0.25em',
          }}
        >
          PLAYCE
        </span>
      </div>
      <div className="flex items-center gap-2">
        {onOpenSavedJourneys ? (
          <button
            type="button"
            onClick={onOpenSavedJourneys}
            className="group relative cursor-pointer border-0 bg-transparent p-1"
            aria-label="Saved Journeys"
            title="Saved Journeys"
          >
            <span className="relative inline-flex size-[18px] items-center justify-center shrink-0" aria-hidden>
              <IconRoute
                size={18}
                stroke={1.5}
                className="text-white/40 transition-colors group-hover:text-white/55"
              />
              {savedJourneyCount > 0 ? (
                <span
                  className="absolute"
                  style={{
                    top: -2,
                    right: -2,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#C17D3C',
                  }}
                />
              ) : null}
            </span>
          </button>
        ) : null}
        {onOpenSavedDestinations ? (
          <button
            type="button"
            onClick={onOpenSavedDestinations}
            className="group relative cursor-pointer border-0 bg-transparent p-1"
            aria-label="Saved Destinations"
            title="Saved Destinations"
          >
            <span className="relative inline-flex size-[18px] items-center justify-center shrink-0" aria-hidden>
              <IconMapPin
                size={18}
                stroke={1.5}
                className="text-white/40 transition-colors group-hover:text-white/55"
              />
              {savedDestinationCount > 0 ? (
                <span
                  className="absolute"
                  style={{
                    top: -2,
                    right: -2,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#C17D3C',
                  }}
                />
              ) : null}
            </span>
          </button>
        ) : null}
      </div>
    </nav>
  )
}
