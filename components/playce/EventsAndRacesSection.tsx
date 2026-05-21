'use client'

import { useMemo } from 'react'
import {
  eventDetailsHref,
  eventsSearchHref,
  resolveDisplayEvents,
  shouldShowEventsSearchFallback,
  type DisplayEventRow,
} from '@/lib/events-display'
import type { TravelIntent } from '@/lib/playce-travel-intent-itinerary-prompt'

type EventsAndRacesSectionProps = {
  travelPurpose: TravelIntent
  location: {
    name: string
    country: string
    activity: string
    season: string
    upcomingEvents?: {
      name: string
      date: string
      website?: string
      isRecurring: boolean
    }[]
  }
  className?: string
  labelStyle?: React.CSSProperties
  /** Strip year from date line when true (Journey briefing). */
  formatDateLine?: (date: string) => string
  /** When set, skips resolveDisplayEvents (e.g. Matrix query-window filter). */
  eventsOverride?: DisplayEventRow[]
}

export function EventsAndRacesSection({
  travelPurpose,
  location,
  className = '',
  labelStyle,
  formatDateLine,
  eventsOverride,
}: EventsAndRacesSectionProps) {
  const events = useMemo(
    () => (eventsOverride !== undefined ? eventsOverride : resolveDisplayEvents(location)),
    [eventsOverride, location]
  )
  const showSearch = shouldShowEventsSearchFallback(travelPurpose, events.length)
  const searchHref = eventsSearchHref(location.activity, location.name, location.season)
  const mutedLabel = labelStyle ?? { color: 'rgba(255,255,255,0.3)' }

  return (
    <section className={className}>
      <p className="playce-section-label mb-5" style={mutedLabel}>
        EVENTS & RACES
      </p>

      {events.length > 0 ? (
        <div>
          {events.map((event, idx) => (
            <div
              key={`${event.name}-${idx}`}
              className="flex flex-col justify-between gap-3 border-b border-[var(--border)] py-[14px] last:border-b-0 sm:flex-row sm:items-start"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="text-[15px] font-medium"
                    style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                  >
                    {event.name}
                  </span>
                  {event.isRecurring ? (
                    <span
                      className="text-[10px]"
                      style={{
                        border: '1px solid var(--border)',
                        color: 'var(--text-muted)',
                        padding: '2px 7px',
                        borderRadius: 'var(--radius)',
                      }}
                    >
                      Annual
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                  {formatDateLine ? formatDateLine(event.date) : event.date} · {location.name}, {location.country}
                </p>
              </div>
              <a
                href={eventDetailsHref(event.name, location.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-[13px] no-underline"
                style={{ color: 'var(--brand-text)', fontFamily: 'var(--font-body)' }}
              >
                Details ↗
              </a>
            </div>
          ))}
        </div>
      ) : showSearch ? (
        <a
          href={searchHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] no-underline"
          style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
        >
          Search for events during your trip ↗
        </a>
      ) : null}
    </section>
  )
}
