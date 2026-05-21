'use client'

import { useMemo, useState, useCallback, useEffect } from 'react'
import {
  sanitizeUserIntentQueryForDisplay,
  truncateUserIntent,
} from '@/lib/sanitize-user-intent-display'
import { ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { MatrixLocationData } from '@/lib/playce-location-types'
import { resolveCardLocationLabel } from '@/lib/resolve-card-location-label'
import { buildDestinationHandoffSlug } from '@/lib/playce-confirm-helpers'
import { stripMonthBeforeAnnuallyForDisplay } from '@/lib/format-event-date-display'
import type { RefineProfile } from '@/components/playce/the-refine'
import { enrichLocationsWithImages } from '@/lib/enrich-locations-client'
import { isUnsplashImageUrl, locationNeedsImage } from '@/lib/location-image'

const fontBody = 'var(--font-body)'
const fontDisplay = 'var(--font-display)'
const cardLabelShadow = '0 1px 3px rgba(0,0,0,0.95), 0 2px 8px rgba(0,0,0,0.7)'

interface TheMatchProps {
  searchQuery: string
  intentSummary?: string
  detectedSkillLevel?: string | null
  recommendations?: MatrixLocationData[] | null
  tripDuration?: RefineProfile['duration']
  timeframeQuery?: string
  onBack: () => void
}

/** Short display label for a difficulty string. */
function difficultyLabel(difficulty?: string): string {
  const d = (difficulty ?? '').toLowerCase()
  if (d.includes('beginner')) return 'Beginner'
  if (d.includes('advanced') || d.includes('pro') || d.includes('expert') || d.includes('elite')) return 'Pro'
  return 'Intermediate'
}

/** Split vibe string into ≤3 tag tokens. */
function vibeTokens(vibe?: string): string[] {
  if (!vibe) return []
  return vibe
    .split(/[,|·\/]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3)
}

function cardDisplayTags(location: MatrixLocationData): string[] {
  const fromAi = (location.vibeTags ?? []).map((t) => t.trim()).filter(Boolean)
  if (fromAi.length > 0) return fromAi.slice(0, 3)
  return vibeTokens(location.vibe)
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

function sentenceCase(value: string): string {
  const lower = value.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

const durationToDays: Record<string, number> = {
  WEEKEND: 2,
  SHORT: 4,
  WEEK: 8,
  TWO_WEEKS: 14,
  OPEN: 21,
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const MONTH_ALIASES: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
}

function monthIndexFromText(text: string): number {
  const lower = text.toLowerCase()
  for (const [token, idx] of Object.entries(MONTH_ALIASES)) {
    if (new RegExp(`\\b${token}\\b`, 'i').test(lower)) return idx
  }
  return -1
}

function parseEventDateRange(dateStr: string, now: Date) {
  if (!dateStr) return null
  const s = dateStr.trim()
  const lower = s.toLowerCase()

  const yearMatch = s.match(/\b(20\d{2})\b/)
  const explicitYear = Boolean(yearMatch)
  let year = yearMatch ? Number(yearMatch[1]) : now.getFullYear()

  const monthIndex = monthIndexFromText(lower)
  if (monthIndex < 0) return null

  const dayRangeMatch = s.match(/\b(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\b/)
  let startDay = 15
  let endDay = 15
  if (dayRangeMatch) {
    startDay = Number(dayRangeMatch[1])
    endDay = dayRangeMatch[2] ? Number(dayRangeMatch[2]) : startDay
  } else {
    if (lower.includes('early')) {
      startDay = 5
      endDay = 10
    } else if (lower.includes('mid')) {
      startDay = 13
      endDay = 20
    } else if (lower.includes('late')) {
      startDay = 25
      endDay = 31
    }
  }

  let start = new Date(year, monthIndex, startDay, 0, 0, 0, 0)
  let end = new Date(year, monthIndex, endDay, 23, 59, 59, 999)

  if (!explicitYear && start < now) {
    start = new Date(year + 1, monthIndex, startDay, 0, 0, 0, 0)
    end = new Date(year + 1, monthIndex, endDay, 23, 59, 59, 999)
    year += 1
  }

  return { start, end, monthName: MONTHS[monthIndex], year }
}

function eventsOverlapWindow(
  events: MatrixLocationData['upcomingEvents'] | undefined,
  start: Date,
  end: Date
) {
  if (!events || events.length === 0) return []
  return events
    .map((ev) => {
      const range = ev.date ? parseEventDateRange(ev.date, start) : null
      if (!range) return null
      if (ev.isRecurring) {
        while (range.end < start) {
          range.start = new Date(
            range.start.getFullYear() + 1,
            range.start.getMonth(),
            range.start.getDate(),
            0,
            0,
            0,
            0
          )
          range.end = new Date(
            range.end.getFullYear() + 1,
            range.end.getMonth(),
            range.end.getDate(),
            23,
            59,
            59,
            999
          )
          range.year = range.start.getFullYear()
        }
      }
      const overlaps = range.start <= end && range.end >= start
      return overlaps ? { ev, range } : null
    })
    .filter(Boolean)
    .sort((a, b) => a!.range.start.getTime() - b!.range.start.getTime())
}

function parseQueryTimeWindow(query: string | undefined, fallbackDays: number) {
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  const q = (query || '').toLowerCase()
  const monthIndex = monthIndexFromText(q)
  const yearMatch = q.match(/\b(20\d{2})\b/)
  if (monthIndex >= 0) {
    const year = yearMatch ? Number(yearMatch[1]) : base.getFullYear()
    const start = new Date(year, monthIndex, 1, 0, 0, 0, 0)
    const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)
    return { start, end }
  }
  const end = new Date(base)
  end.setDate(end.getDate() + fallbackDays)
  return { start: base, end }
}

export function TheMatch({
  searchQuery,
  intentSummary: _intentSummary,
  detectedSkillLevel: _detectedSkillLevel,
  recommendations,
  tripDuration,
  timeframeQuery,
  onBack,
}: TheMatchProps) {
  const router = useRouter()
  const items = useMemo(() => recommendations ?? [], [recommendations])
  const [displayItems, setDisplayItems] = useState<MatrixLocationData[]>(items)
  const [imageSrcByCard, setImageSrcByCard] = useState<Record<string, string>>({})
  const showGrid = displayItems.length > 0

  useEffect(() => {
    setDisplayItems(items)
    setImageSrcByCard({})
  }, [items])

  useEffect(() => {
    if (!items.length || !items.some((loc) => locationNeedsImage(loc.image))) return

    let cancelled = false
    void (async () => {
      const enriched = await enrichLocationsWithImages(items)
      if (cancelled) return
      if (enriched.some((loc, i) => loc.image !== items[i]?.image)) {
        setDisplayItems(enriched)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [items])

  const resolveCardImageSrc = useCallback(
    (location: MatrixLocationData, cardKey: string): string => {
      const override = imageSrcByCard[cardKey]
      if (override && isUnsplashImageUrl(override)) return override
      if (isUnsplashImageUrl(location.image)) return location.image.trim()
      return ''
    },
    [imageSrcByCard]
  )

  const retryCardImage = useCallback((location: MatrixLocationData, cardKey: string) => {
    void (async () => {
      const [enriched] = await enrichLocationsWithImages([location])
      const url = enriched?.image?.trim()
      if (isUnsplashImageUrl(url)) {
        setImageSrcByCard((prev) => ({ ...prev, [cardKey]: url! }))
        setDisplayItems((prev) =>
          prev.map((loc) =>
            loc.name === location.name && loc.country === location.country ? { ...loc, image: url! } : loc
          )
        )
      }
    })()
  }, [])

  const openCalibration = useCallback(
    (location: MatrixLocationData) => {
      router.push(`/calibration/${buildDestinationHandoffSlug(location)}`)
    },
    [router]
  )

  const queryWindow = useMemo(() => {
    const tripDays = durationToDays[tripDuration ?? 'WEEK'] ?? 8
    return parseQueryTimeWindow(timeframeQuery || searchQuery, tripDays)
  }, [tripDuration, timeframeQuery, searchQuery])

  /** User-facing copy: original prompt only — never AI `intentSummary`. */
  const intentDisplayClean = useMemo(
    () => sanitizeUserIntentQueryForDisplay(searchQuery),
    [searchQuery]
  )
  const intentCenterLine = truncateUserIntent(intentDisplayClean, 50)

  const colClass =
    displayItems.length === 1
      ? 'grid-cols-1 max-w-md mx-auto w-full'
      : displayItems.length <= 3
        ? 'grid-cols-1 sm:grid-cols-3'
        : displayItems.length === 4
          ? 'grid-cols-2 sm:grid-cols-4'
          : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <header
        className="fixed top-0 left-0 right-0 z-50 px-6 py-4 md:px-8 md:py-5 pr-20 md:pr-28 flex items-center justify-between gap-4"
        style={{ borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="border-0 bg-transparent p-0 cursor-pointer text-left focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-white/40"
          aria-label="Back to home"
        >
          <span
            className="text-sm md:text-base text-zinc-300 uppercase"
            style={{ fontFamily: fontBody, fontWeight: 400, letterSpacing: '0.25em' }}
          >
            Playce
          </span>
        </button>

        <p
          className="text-[10px] text-zinc-500 tracking-[0.2em] uppercase hidden md:block max-w-[42vw] truncate text-right"
          style={{ fontFamily: fontBody }}
          title={intentDisplayClean || undefined}
        >
          {intentCenterLine}
        </p>
      </header>

      <div className="pt-24 md:pt-28 pb-16 px-5 md:px-10 max-w-[1600px] mx-auto">
        <div className="mb-10 md:mb-12 pr-2 md:pr-28 max-w-full">
          <p
            className="italic mb-2"
            style={{ fontFamily: fontBody, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}
          >
            Recommended for your intent
          </p>
          <h2
            className="leading-[1.05] mb-10 pr-0"
            style={{
              fontFamily: fontDisplay,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              fontSize: 'clamp(36px, 5vw, 52px)',
              color: 'var(--text-primary)',
              maxWidth: 'min(100%, calc(100vw - 5.5rem))',
            }}
          >
            {intentDisplayClean}
          </h2>
        </div>

        {!showGrid ? (
          <div
            className="flex flex-col items-center justify-center min-h-[36vh] py-12 px-4 text-center"
            style={{ border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: '5px' }}
          >
            <p className="text-zinc-400 text-sm max-w-md mb-6" style={{ fontFamily: fontBody }}>
              No destinations loaded yet. Go back and run a new intent prompt.
            </p>
            <button type="button" onClick={onBack} className="playce-btn px-8 py-3">
              Back home
            </button>
          </div>
        ) : null}

        {showGrid ? (
          <div className={`grid ${colClass} gap-3 md:gap-4`}>
            {displayItems.map((location, idx) => {
              const cardKey = `${location.name}-${location.country}-${idx}`
              const imgSrc = resolveCardImageSrc(location, cardKey)
              const showPhoto = Boolean(imgSrc)
              const tags = cardDisplayTags(location)
              const cardLocationLabel = resolveCardLocationLabel(location)
              const matchedEvents = eventsOverlapWindow(
                location.upcomingEvents,
                queryWindow.start,
                queryWindow.end
              ) as {
                ev: NonNullable<MatrixLocationData['upcomingEvents']>[number]
                range: { start: Date; end: Date; monthName: string; year: number }
              }[]
              const firstEvent = matchedEvents[0]
              const seasonMetadataLine = (
                firstEvent?.range.monthName ?? (location.season ? formatSeason(location.season) : '')
              ).trim()

              return (
                <div key={cardKey} className="space-y-3">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openCalibration(location)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openCalibration(location)
                      }
                    }}
                    className="group relative overflow-hidden w-full min-h-[540px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/40 text-left cursor-pointer"
                    style={{
                      borderRadius: '5px',
                      border: 'none',
                      background: 'var(--bg-secondary)',
                    }}
                    aria-label={`Explore ${location.primaryTitle || location.name}, ${location.country}`}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        background: 'var(--bg-secondary)',
                      }}
                    />

                    {showPhoto ? (
                      <img
                        src={imgSrc}
                        alt={location.primaryTitle || location.name}
                        loading={idx === 0 ? 'eager' : 'lazy'}
                        decoding="async"
                        className="absolute inset-0 z-[1] h-full w-full object-cover object-center transition-transform duration-400 ease-out group-hover:scale-[1.02]"
                        onError={() => retryCardImage(location, cardKey)}
                      />
                    ) : (
                      <div
                        className="absolute inset-0 z-[1]"
                        style={{
                          background:
                            'linear-gradient(145deg, rgba(30,35,45,0.95) 0%, rgba(18,22,28,0.98) 55%, rgba(12,14,18,1) 100%)',
                        }}
                        aria-hidden
                      />
                    )}

                    <div className="playce-match-card__scrim-bottom" aria-hidden />
                    <div className="playce-match-card__scrim-top" aria-hidden />

                    {location.photographerName && location.photographerLink ? (
                      <div
                        className="absolute z-20 pointer-events-none"
                        style={{ bottom: 12, right: 14, fontSize: 10, color: 'rgba(255,255,255,0.22)' }}
                      >
                        <span style={{ fontFamily: fontBody }}>
                          Photo by{' '}
                          <a
                            href={location.photographerLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="transition-colors duration-200 pointer-events-auto hover:underline"
                            style={{ color: 'rgba(255,255,255,0.22)', textDecoration: 'none' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {location.photographerName}
                          </a>
                        </span>
                      </div>
                    ) : null}

                    <div className="absolute top-4 left-4 right-4 z-10 pointer-events-none flex items-start justify-between gap-2">
                      <div>
                        <span
                          className="playce-match-card__geo-label leading-none"
                          style={{
                            fontFamily: fontBody,
                            fontWeight: 600,
                            fontSize: 11,
                            color: 'rgba(255,255,255,0.95)',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {cardLocationLabel}
                        </span>
                      </div>
                      {location.difficulty ? (
                        <span
                          className="shrink-0 leading-none"
                          style={{
                            fontFamily: fontBody,
                            fontWeight: 500,
                            fontSize: 10,
                            background: 'rgba(0,0,0,0.72)',
                            border: '1px solid rgba(255,255,255,0.35)',
                            color: 'rgba(255,255,255,0.95)',
                            padding: '3px 10px',
                            borderRadius: 5,
                            textShadow: cardLabelShadow,
                          }}
                        >
                          {difficultyLabel(location.difficulty)}
                        </span>
                      ) : null}
                    </div>

                    <div className="playce-match-card__content-panel absolute bottom-0 left-0 right-0 p-4 md:p-5 z-10 pointer-events-none min-h-[28%] flex flex-col justify-end">
                      <h3
                        className="playce-match-card__title mb-2 leading-[1.05]"
                        style={{
                          fontFamily: fontDisplay,
                          fontWeight: 700,
                          letterSpacing: '-0.03em',
                          fontSize: 36,
                          color: '#ffffff',
                        }}
                      >
                        {location.primaryTitle || location.name}
                      </h3>

                      {(seasonMetadataLine || firstEvent) ? (
                        <div className="flex flex-col gap-2 mb-3 mt-1" aria-label="Location metadata">
                          {seasonMetadataLine ? (
                            <span className="playce-match-card__month">{seasonMetadataLine}</span>
                          ) : null}
                          {firstEvent ? (
                            <p
                              className={`playce-match-card__event${seasonMetadataLine ? '' : ' !pt-0 !border-t-0'}`}
                            >
                              <span className="playce-match-card__event-name">{firstEvent.ev.name}</span>
                              <span className="playce-match-card__event-date">
                                {' '}
                                · {stripMonthBeforeAnnuallyForDisplay(firstEvent.ev.date)}
                              </span>
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {(tags.length > 0 || location.soloIndex >= 78) ? (
                        <div className="flex flex-wrap gap-1.5 mb-[14px]">
                          {location.soloIndex >= 78 && (
                            <span
                              className="text-[12px]"
                              style={{
                                fontFamily: fontBody,
                                background: 'rgba(193,125,60,0.15)',
                                border: '1px solid #C17D3C',
                                color: '#E8A86A',
                                padding: '3px 10px',
                                borderRadius: 5,
                                textShadow: '0 1px 4px rgba(0,0,0,0.9)',
                              }}
                            >
                              Solo-safe
                            </span>
                          )}
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[11px]"
                              style={{
                                fontFamily: fontBody,
                                color: 'rgba(255,255,255,0.95)',
                                border: '1px solid rgba(255,255,255,0.38)',
                                padding: '3px 10px',
                                borderRadius: 5,
                                background: 'rgba(0,0,0,0.78)',
                                textShadow: cardLabelShadow,
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div className="pointer-events-none mb-[48px] mt-[9px] md:mt-[5px] flex justify-end">
                        <span
                          className="inline-flex items-center gap-1.5 transition-colors duration-200 group-hover:bg-white/8"
                          style={{
                            fontFamily: fontBody,
                            border: '1px solid rgba(255,255,255,0.45)',
                            color: '#ffffff',
                            background: 'rgba(0,0,0,0.78)',
                            borderRadius: 5,
                            padding: '8px 18px',
                            fontSize: 12,
                            fontWeight: 500,
                            letterSpacing: '0.03em',
                            textShadow: cardLabelShadow,
                          }}
                        >
                          Explore <ArrowRight className="w-3 h-3 shrink-0" strokeWidth={1.8} aria-hidden />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
