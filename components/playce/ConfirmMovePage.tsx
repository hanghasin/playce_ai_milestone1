'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Image from 'next/image'
import {
  ArrowRight,
  Cable,
  Flower2,
  IdCard,
  Info,
  Mountain,
  Plane,
  Shield,
  Star,
  ThermometerSun,
  Users,
  Waves,
  Calendar,
  Clock,
  Footprints,
  Wallet,
} from 'lucide-react'
import { IconMapPin, IconRoute } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import type { RefineProfile } from '@/components/playce/the-refine'
import type { MatrixLocationData } from '@/lib/playce-location-types'
import { EventsAndRacesSection } from '@/components/playce/EventsAndRacesSection'
import { WaysToExperienceSection } from '@/components/playce/WaysToExperienceSection'
import {
  buildConfirmHeroMetaLine,
  buildDestinationHandoffSlug,
  dailyBudgetDisplayForTier,
  formatBestSeasonDisplay,
  formatUsdInteger,
  gaugeArcDash,
  getConfirmVibeThird,
  getTrainingSectionCTA,
  getTrainingSectionTitle,
  isHeroImageUrl,
  parseDailyBudgetUsdRange,
  playcePrimaryCtaStyle,
  safetyFeelingLabel,
  scrubActivityZones,
  shortDescriptionFallback,
  sentenceCase,
  socialOpennessLabel,
  travelerDensityDisplay,
  typicalWeatherFallback,
  type ConfirmVibeThirdVariant,
  visaRequirementsGoogleHref,
} from '@/lib/playce-confirm-helpers'
import { travelPurposeFromTripRole } from '@/lib/experience-cards'
import type { DisplayEventRow } from '@/lib/events-display'

const PAD = 'px-5 md:px-12'
const BRAND = '#C17D3C'
const BRAND_TEXT = '#E8A86A'

export type WhyThisSpotLine = { icon: string; text: string; boldPhrase?: string }

export type ConfirmDynamic = {
  tripDays: number
  airportLine: string
  pricing: { daily: string }
  itinerary: Array<{ day: number; title: string; activities: string[] }>
  whyThisSpotLines: WhyThisSpotLine[]
  prepSectionBlurb: string | null
  primaryStayArea?: string
}

export function ConfirmMovePage({
  location: loc,
  refine,
  dynamicContent,
  vibeTags,
  eventsOverride,
  onBack,
  onToggleShortlist,
  onOpenSavedJourneys,
  onOpenShortlist,
  savedJourneyCount,
  shortlistCount,
  isShortlisted,
}: {
  location: MatrixLocationData
  refine: RefineProfile
  dynamicContent: ConfirmDynamic
  vibeTags: string[]
  eventsOverride?: DisplayEventRow[]
  onBack: () => void
  onToggleShortlist: () => void
  onOpenSavedJourneys: () => void
  onOpenShortlist: () => void
  savedJourneyCount: number
  shortlistCount: number
  isShortlisted: boolean
}) {
  const router = useRouter()
  const [suggestedItineraryExpanded, setSuggestedItineraryExpanded] = useState(false)

  const slug = buildDestinationHandoffSlug(loc)
  const activityType = loc.activity

  const shortDescription = (loc.shortDescription?.trim() || shortDescriptionFallback(loc, refine)).slice(0, 600)
  const typicalWeather = (loc.typicalWeather?.trim() || typicalWeatherFallback(loc)).slice(0, 120)
  const heuristicBudget =
    refine.budgetRange === 'LUXE' ? '$400+' : refine.budgetRange === 'MID-RANGE' ? '$150-300' : '$70-140'
  const dailyBudgetStr = dailyBudgetDisplayForTier(loc, refine.budgetRange, heuristicBudget).slice(0, 80)
  const durationDays = dynamicContent.tripDays
  const confirmHeroMetaLine = buildConfirmHeroMetaLine(loc, refine, durationDays, dailyBudgetStr)
  const budgetEstimateDisplay = useMemo(() => {
    const range = parseDailyBudgetUsdRange(dailyBudgetStr)
    if (!range) {
      return {
        primary: dailyBudgetStr,
        secondary: `${durationDays} days · total depends on your daily spend band`,
      }
    }
    const totalMin = range.min * durationDays
    const totalMax = range.max * durationDays
    return {
      primary: `$${formatUsdInteger(totalMin)}\u2013${formatUsdInteger(totalMax)} total`,
      secondary: `~$${formatUsdInteger(range.min)}\u2013${formatUsdInteger(range.max)} / day · ${durationDays} days`,
    }
  }, [dailyBudgetStr, durationDays])
  const bestSeason = formatBestSeasonDisplay(loc.bestSeason, sentenceCase(loc.season)).slice(0, 120)
  const visaHref = visaRequirementsGoogleHref(loc.country)
  const airport = dynamicContent.airportLine
  const nightSafety = loc.nightSafety ?? 60
  const communityDensity = loc.communityDensity ?? 55
  const infrastructureScore = loc.infrastructureScore ?? 60

  const activityZonesText = scrubActivityZones(loc.activityZones, loc)
  const trainingTitle = getTrainingSectionTitle(activityType)
  const trainingCta = getTrainingSectionCTA(loc, refine.budgetRange)
  const watchingMode = refine.tripRole === 'WATCHING'
  const travelPurpose = travelPurposeFromTripRole(refine.tripRole)
  const experienceMapQuery = [loc.primaryTitle || loc.name, loc.country].filter(Boolean).join(', ')

  const vibeThird = getConfirmVibeThird(activityType, infrastructureScore, communityDensity)
  const travelerDensity = travelerDensityDisplay(communityDensity, infrastructureScore)

  const soloPct = Math.min(100, Math.max(0, loc.soloIndex))
  const womenPct = Math.min(100, Math.max(0, loc.womenFriendly))

  const navigateToPlanningJourney = () => {
    const handoff = {
      v: 1 as const,
      destinationId: slug,
      location: loc,
      refine,
      generationNonce: Date.now(),
    }
    try {
      sessionStorage.setItem('playce-journey-handoff', JSON.stringify(handoff))
    } catch {
      /* ignore */
    }
    try {
      localStorage.setItem(`playce_journey_${slug}`, JSON.stringify(handoff))
    } catch {
      /* ignore quota / private mode */
    }
    router.push(`/journey/${slug}`)
  }

  const handlePrimaryConfirm = navigateToPlanningJourney

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* SECTION 1 HERO */}
      <section className="relative w-full min-h-[520px]">
        <div className="absolute inset-0">
          {!isHeroImageUrl(loc.image) ? null : (
            <Image
              src={loc.image.trim()}
              alt=""
              fill
              className="object-cover object-center"
              sizes="100vw"
              priority
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          )}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.88) 100%)',
            }}
          />
        </div>

        <nav
          className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 md:px-12 py-4"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <button type="button" onClick={onBack} className="playce-btn px-5 py-3">
            Back
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenSavedJourneys}
              className="group relative cursor-pointer border-0 bg-transparent p-0"
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
            <button
              type="button"
              onClick={onOpenShortlist}
              className="group relative cursor-pointer border-0 bg-transparent p-0"
              aria-label="Saved Destinations"
              title="Saved Destinations"
            >
              <span className="relative inline-flex size-[18px] items-center justify-center shrink-0" aria-hidden>
                <IconMapPin
                  size={18}
                  stroke={1.5}
                  className="text-white/40 transition-colors group-hover:text-white/55"
                />
                {shortlistCount > 0 ? (
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
          </div>
        </nav>

        {loc.photographerName ? (
          <p
            className="absolute z-10 text-[10px]"
            style={{
              bottom: 12,
              right: 16,
              color: 'rgba(255,255,255,0.22)',
              fontFamily: 'var(--font-body)',
            }}
          >
            Photo by{' '}
            {loc.photographerLink ? (
              <a href={loc.photographerLink} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
                {loc.photographerName}
              </a>
            ) : (
              loc.photographerName
            )}
          </p>
        ) : null}

        <div
          className="relative z-10 flex min-h-[520px] flex-col justify-end pb-10 pt-28 md:pb-14"
          style={{ paddingLeft: 'max(1.25rem, env(safe-area-inset-left))', paddingRight: 'max(1.25rem, env(safe-area-inset-right))' }}
        >
          <div className={`mx-auto w-full max-w-[1200px] ${PAD}`}>
            <p
              className="mb-[10px] text-[10px] uppercase tracking-[0.16em]"
              style={{ fontFamily: 'var(--font-body)', color: 'rgba(255,255,255,0.4)' }}
            >
              CONFIRM THIS MOVE
            </p>
            <h1
              className="mb-3 font-serif font-normal text-[42px] leading-none text-white md:text-[72px]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {loc.name}
            </h1>
            <p className="mb-3 text-[15px]" style={{ fontFamily: 'var(--font-body)', color: 'rgba(255,255,255,0.6)' }}>
              {confirmHeroMetaLine}
            </p>
            <div className="mb-5 flex flex-wrap gap-2">
              {vibeTags.map((tag) => (
                <span
                  key={tag}
                  className="px-[10px] py-1 text-[12px]"
                  style={{
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: 'rgba(255,255,255,0.6)',
                    borderRadius: 'var(--radius)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {tag}
                </span>
              ))}
              {soloPct >= 75 ? (
                <span
                  className="px-[10px] py-1 text-[12px]"
                  style={{
                    background: 'rgba(193,125,60,0.12)',
                    border: `1px solid ${BRAND}`,
                    color: BRAND_TEXT,
                    borderRadius: 'var(--radius)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  Solo-safe
                </span>
              ) : null}
            </div>
            <p
              className="mb-7 max-w-[440px] text-[15px] leading-[1.65]"
              style={{ fontFamily: 'var(--font-body)', color: 'rgba(255,255,255,0.65)' }}
            >
              {shortDescription}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handlePrimaryConfirm}
                className="inline-flex cursor-pointer items-center gap-2 border-0 transition-opacity hover:opacity-95"
                style={playcePrimaryCtaStyle}
              >
                Confirm this move{' '}
                <ArrowRight className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* VIBE INDEX */}
      <section
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}
        className={`py-10 ${PAD}`}
      >
        <div className="mx-auto max-w-[1200px]">
          <div className="flex items-center gap-2">
            <p className="playce-section-label" style={{ color: 'rgba(255,255,255,0.35)' }}>
              VIBE INDEX
            </p>
            <span className="group relative cursor-default" aria-label="About vibe index">
              <Info size={11} className="text-zinc-500" />
              <span
                className="pointer-events-none absolute left-0 top-6 z-20 w-[260px] opacity-0 transition-opacity group-hover:opacity-100"
                style={{
                  background: '#1a1a1a',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 'var(--radius)',
                  padding: '10px 14px',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.5)',
                  lineHeight: 1.6,
                  fontFamily: 'var(--font-body)',
                }}
              >
                Scores are AI-estimated based on destination characteristics and traveler patterns. They reflect general
                tendencies, not real-time conditions. Always verify with current travel advisories.
              </span>
            </span>
          </div>

          <div className="mt-6 flex flex-col items-stretch gap-10 lg:flex-row lg:items-center">
            <div className="flex shrink-0 justify-center gap-8">
              <Gauge label="Solo-friendly" percent={soloPct} />
              <Gauge label="Women-friendly" percent={womenPct} />
            </div>
            <div
              className="hidden w-px shrink-0 bg-[var(--border)] lg:block lg:self-center"
              style={{ height: 120, marginLeft: 40, marginRight: 40 }}
              aria-hidden
            />
            <div className="grid min-w-0 flex-1 grid-cols-2 content-start" style={{ rowGap: 24, columnGap: 32 }}>
              <VibeIndicator
                icon={<Shield strokeWidth={1.5} size={18} />}
                label="Safety feeling"
                value={safetyFeelingLabel(nightSafety)}
              />
              <VibeIndicator
                icon={<Users strokeWidth={1.5} size={18} />}
                label="Social openness"
                value={socialOpennessLabel(communityDensity)}
              />
              <VibeIndicator
                icon={confirmVibeThirdIcon(vibeThird.variant)}
                label={vibeThird.label}
                value={vibeThird.value}
              />
              <VibeIndicator
                icon={<Footprints strokeWidth={1.5} size={18} />}
                label="Traveler density"
                value={travelerDensity.value}
                hint={travelerDensity.hint}
              />
            </div>
          </div>

          <p className="text-[11px]" style={{ marginTop: 16, fontFamily: 'var(--font-body)', color: 'var(--text-muted)' }}>
            Indicative only. Not a guarantee of safety.
          </p>
        </div>
      </section>

      {/* FAST FACTS */}
      <section style={{ borderBottom: '1px solid var(--border)' }} className={`bg-[var(--bg)] py-10 ${PAD}`}>
        <div className="mx-auto max-w-[1200px]">
          <p className="playce-section-label mb-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
            FAST FACTS
          </p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            <Fact icon={<Plane size={20} className="stroke-zinc-500" />} label="Nearest airport" value={airport} />
            <div>
              <div className="flex items-center gap-2">
                <IdCard size={20} className="stroke-zinc-500" />
              </div>
              <p className="mt-2.5 text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                Visa
              </p>
              <a
                href={visaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block text-[14px] leading-snug no-underline"
                style={{ color: 'var(--brand-text)', fontFamily: 'var(--font-body)' }}
              >
                Check requirements →
              </a>
              <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                Rules vary by passport — verify before booking.
              </p>
            </div>
            <Fact icon={<Calendar size={20} className="stroke-zinc-500" />} label="Best season" value={bestSeason} />
            <Fact icon={<Clock size={20} className="stroke-zinc-500" />} label="Ideal trip length" value={`${dynamicContent.tripDays} days`} />
            <div>
              <div className="flex items-center gap-2">
                <Wallet size={20} className="stroke-zinc-500" />
              </div>
              <p className="mt-2.5 text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                BUDGET ESTIMATE
              </p>
              <p className="mt-1 text-[14px] leading-snug" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
                {budgetEstimateDisplay.primary}
              </p>
              <p className="text-[12px] leading-snug" style={{ marginTop: 3, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                {budgetEstimateDisplay.secondary}
              </p>
            </div>
            <Fact icon={<ThermometerSun size={20} className="stroke-zinc-500" />} label="Typical weather" value={typicalWeather} />
          </div>
          <p
            className="text-[11px] leading-relaxed italic"
            style={{ marginTop: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
          >
            Estimates cover accommodation, food, local transport, and activity costs. Flights not included.
          </p>
        </div>
      </section>

      {/* EVENTS */}
      <section style={{ background: 'var(--bg-secondary)' }} className={`pt-10 pb-4 ${PAD}`}>
        <div className="mx-auto max-w-[1200px]">
          <EventsAndRacesSection travelPurpose={travelPurpose} location={loc} eventsOverride={eventsOverride} />
        </div>
      </section>

      {/* TRAINING & ACTIVITIES (not shown for Watching — Events & Races covers spectator links) */}
      {!watchingMode ? (
        <section style={{ borderBottom: '1px solid var(--border)' }} className={`bg-[var(--bg-secondary)] pt-4 pb-10 ${PAD}`}>
          <div className="mx-auto max-w-[1200px]">
            <p className="playce-section-label mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {trainingTitle}
            </p>
            <p
              className="mb-5 max-w-[640px] text-[14px] leading-[1.7]"
              style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
            >
              {dynamicContent.prepSectionBlurb || activityZonesText}
            </p>
            <a
              href={trainingCta.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 no-underline transition-colors playce-btn playce-btn-soft-border px-8 py-[10px]"
            >
              {trainingCta.label} ↗
            </a>
            <p className="mt-3 max-w-[520px] text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
              Playce links to third-party platforms. Verify availability and pricing directly with operators.
            </p>
          </div>
        </section>
      ) : null}

      {/* WAYS TO EXPERIENCE */}
      <section style={{ borderBottom: '1px solid var(--border)' }} className={`bg-[var(--bg)] py-10 ${PAD}`}>
        <div className="mx-auto max-w-[1200px]">
          <WaysToExperienceSection
            travelPurpose={travelPurpose}
            budget={refine.budgetRange}
            activityType={activityType}
            destinationName={loc.name}
            season={loc.season}
            mapQuery={experienceMapQuery}
          />
        </div>
      </section>

      {/* WHY THIS SPOT */}
      <section style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }} className={`py-10 ${PAD}`}>
        <div className="mx-auto max-w-[1200px]">
          <p className="playce-section-label mb-5" style={{ color: 'rgba(255,255,255,0.3)' }}>
            WHY THIS SPOT
          </p>
          <ul className="m-0 list-none p-0">
            {dynamicContent.whyThisSpotLines.map((row, idx) => (
              <li
                key={`${row.text.slice(0, 24)}-${idx}`}
                className="flex items-start gap-[14px] border-b border-[var(--border)] py-3"
              >
                <span className="shrink-0 pt-px text-[16px] leading-none" aria-hidden>
                  {row.icon}
                </span>
                <p
                  className="m-0 min-w-0 flex-1 text-[14px] leading-[1.5]"
                  style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
                >
                  <WhyThisSpotRichText text={row.text} boldPhrase={row.boldPhrase} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* SUGGESTED ITINERARY */}
      <section style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }} className={`py-10 ${PAD}`}>
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
            <p className="playce-section-label m-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
              SUGGESTED ITINERARY
            </p>
            <button
              type="button"
              onClick={() => setSuggestedItineraryExpanded((v) => !v)}
              className="cursor-pointer border-0 bg-transparent p-0 text-[13px] transition-opacity hover:opacity-90"
              style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
            >
              {suggestedItineraryExpanded ? 'Hide itinerary ↑' : 'View full itinerary →'}
            </button>
          </div>

          <div
            className="overflow-hidden transition-[max-height] duration-300 ease-out"
            style={{ maxHeight: suggestedItineraryExpanded ? 6000 : 120 }}
          >
            {!suggestedItineraryExpanded ? (
              <div
                style={{
                  maxHeight: 120,
                  overflow: 'hidden',
                  WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                  maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                }}
              >
                {dynamicContent.itinerary[0] ? (
                  <SuggestedItineraryDayPreview day={dynamicContent.itinerary[0]} />
                ) : (
                  <p className="text-[13px]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                    Itinerary preview not available.
                  </p>
                )}
              </div>
            ) : (
              <div className="pt-3">
                {dynamicContent.itinerary.map((day, dayIndex) => (
                  <div
                    key={day.day}
                    className="mb-6 flex gap-5 border-b border-white/[0.05] pb-6"
                    style={{ marginBottom: dayIndex === dynamicContent.itinerary.length - 1 ? 0 : 24 }}
                  >
                    <span
                      className="shrink-0 pt-[3px] font-mono text-[11px] tabular-nums"
                      style={{ color: 'var(--text-muted)', minWidth: 28 }}
                    >
                      {String(day.day).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="mb-2 font-serif text-base font-normal md:text-[16px]" style={{ color: 'var(--text-primary)' }}>
                        {day.title}
                      </h3>
                      {day.activities.map((act, i) => {
                        const bright = i === 0
                        return (
                          <div key={`${day.day}-${i}`} className="mb-1.5 flex items-start gap-2.5">
                            <span
                              className="mt-[6px] h-[3px] w-[3px] shrink-0 rounded-full"
                              style={{ background: 'rgba(255,255,255,0.2)' }}
                            />
                            <span
                              className="text-[13px] leading-[1.5]"
                              style={{
                                fontFamily: 'var(--font-body)',
                                color: bright ? 'var(--text-primary)' : 'var(--text-secondary)',
                              }}
                            >
                              {act}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
                <p className="mb-0 mt-2 text-[12px] italic" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                  Full plan available after you confirm.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* FOOTER CTA */}
      <footer className={`bg-[var(--bg)] py-10 ${PAD}`} style={{ borderTop: '1px solid var(--border)' }}>
        <div className="mx-auto max-w-[1200px]">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-serif text-2xl text-[var(--text-primary)]">Ready to go?</p>
              <p className="mt-1.5 text-[13px]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                Confirm this move and we&apos;ll build your full plan.
              </p>
            </div>
            <button
              type="button"
              onClick={handlePrimaryConfirm}
              className="inline-flex cursor-pointer items-center gap-2 border-0 hover:opacity-95"
              style={playcePrimaryCtaStyle}
            >
              Confirm this move <ArrowRight className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
            </button>
          </div>
          <div className="mt-8 flex flex-col justify-between gap-6 border-t border-white/[0.06] pt-6 md:flex-row md:items-start">
            <p className="max-w-[520px] text-[11px] leading-[1.6]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
              Vibe Index scores are indicative only and not a guarantee of personal safety. Playce provides this data for
              informational purposes and accepts no liability for travel decisions made based on these scores.
            </p>
            <button
              type="button"
              onClick={onToggleShortlist}
              className="cursor-pointer border-0 bg-transparent p-0 text-left text-[14px] md:text-right"
              title={
                isShortlisted
                  ? 'Remove from Saved destinations'
                  : 'Adds this destination to Saved destinations on the home screen'
              }
              style={{
                color: isShortlisted ? 'var(--brand-text)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                letterSpacing: '0.02em',
              }}
            >
              {isShortlisted ? 'Saved this destination ✓' : 'Save this destination'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

function WhyThisSpotRichText({ text, boldPhrase }: { text: string; boldPhrase?: string }) {
  const bp = boldPhrase?.trim()
  if (!bp) return <>{text}</>
  const idx = text.indexOf(bp)
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{bp}</strong>
      {text.slice(idx + bp.length)}
    </>
  )
}

function SuggestedItineraryDayPreview({ day }: { day: { day: number; title: string; activities: string[] } }) {
  const previewActs = day.activities.slice(0, 2)
  return (
    <div className="flex gap-5 pb-2">
      <span
        className="shrink-0 pt-[3px] font-mono text-[11px] tabular-nums"
        style={{ color: 'var(--text-muted)', minWidth: 28 }}
      >
        {String(day.day).padStart(2, '0')}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="mb-2 font-serif text-base font-normal md:text-[16px]" style={{ color: 'var(--text-primary)' }}>
          {day.title}
        </h3>
        {previewActs.map((act, i) => (
          <div key={`${day.day}-p-${i}`} className="mb-1.5 flex items-start gap-2.5">
            <span className="mt-[6px] h-[3px] w-[3px] shrink-0 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
            <span className="text-[13px] leading-[1.5]" style={{ fontFamily: 'var(--font-body)', color: 'var(--text-secondary)' }}>
              {act}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function confirmVibeThirdIcon(variant: ConfirmVibeThirdVariant) {
  switch (variant) {
    case 'route_running':
      return <IconRoute size={18} stroke={1.25} className="shrink-0" />
    case 'waves_water':
      return <Waves size={18} strokeWidth={1.5} className="shrink-0" />
    case 'flower_wellness':
      return <Flower2 size={18} strokeWidth={1.5} className="shrink-0" />
    case 'mountain_alpine':
      return <Mountain size={18} strokeWidth={1.5} className="shrink-0" />
    case 'carabiner_climbing':
      return <Cable size={18} strokeWidth={1.5} className="shrink-0" />
    default:
      return <Star size={18} strokeWidth={1.5} className="shrink-0" />
  }
}

function Gauge({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <svg width={80} height={80} viewBox="0 0 80 80" className="pointer-events-none absolute inset-0 -rotate-90">
          <circle cx={40} cy={40} r={35} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
          <circle
            cx={40}
            cy={40}
            r={35}
            fill="none"
            stroke="#C17D3C"
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={gaugeArcDash(percent)}
          />
        </svg>
        <span
          className="relative z-10 text-[18px] font-medium tabular-nums"
          style={{ color: BRAND_TEXT, fontFamily: 'var(--font-body)' }}
        >
          {Math.round(percent)}
        </span>
      </div>
      <span className="mt-2 text-center text-[11px]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
        {label}
      </span>
    </div>
  )
}

function VibeIndicator({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="flex min-w-0 flex-col items-start">
      <div className="flex items-center shrink-0" style={{ color: 'var(--text-muted)' }}>
        {icon}
      </div>
      <p className="mb-1 mt-[10px] text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
        {label}
      </p>
      <p className="text-[15px] font-medium leading-snug" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">{icon}</div>
      <p className="mt-2.5 text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
        {label}
      </p>
      <p className="mt-1 text-[14px] leading-snug" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
        {value}
      </p>
    </div>
  )
}

