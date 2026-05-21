import type { RefineProfile } from '@/components/playce/the-refine'
import type {
  IntelligenceHubSnapshot,
  MissionBriefingDay,
  TripSummaryData,
} from '@/components/playce/JourneyMissionBriefingPanel'
import {
  eventDetailsHref,
  eventsSearchHref,
  resolveDisplayEvents,
  shouldShowEventsSearchFallback,
} from '@/lib/events-display'
import {
  getExperienceCards,
  refineBudgetToExperienceTier,
  type CardConfig,
} from '@/lib/experience-cards'
import { isRentGearLine, journeyPackToPdfGearRow, type JourneyPackLine } from '@/lib/journey-pack-lines'
import { sanitizePdfText } from '@/lib/pdf-text-sanitize'
import { itineraryCostDisplayText } from '@/lib/playce-itinerary-cost-display'
import { mergeLocalTransportForLocation } from '@/lib/playce-local-transport'
import type { MatrixLocationData } from '@/lib/playce-location-types'
import {
  airportFactLineForLocation,
  dailyBudgetDisplayForTier,
  formatBestSeasonDisplay,
  formatTripBudgetTotalEstimate,
  formatUsdInteger,
  getConfirmVibeThird,
  parseDailyBudgetUsdRange,
  resolveHeroMonthLabel,
  safetyFeelingLabel,
  scrubActivityZones,
  sentenceCase,
  socialOpennessLabel,
  travelerDensityDisplay,
  tripRhythmLeadCopy,
  typicalWeatherFallback,
  visaRequirementsGoogleHref,
} from '@/lib/playce-confirm-helpers'
import type { TravelIntent } from '@/lib/playce-travel-intent-itinerary-prompt'

export function parseActivityCoordinates(name: string): { cleanName: string; mapHref: string | null } {
  const match = name.match(/\(lat\s*([-\d.]+)\s*,\s*lon\s*([-\d.]+)\)/i)
  if (!match) return { cleanName: name.trim(), mapHref: null }
  const cleanName = name.replace(match[0], '').replace(/\s{2,}/g, ' ').trim()
  return { cleanName, mapHref: `https://www.google.com/maps?q=${match[1]},${match[2]}` }
}

function displayTypicalWeather(location: MatrixLocationData): string {
  const raw = location.typicalWeather?.trim()
  if (raw && !/water\s*temperature/i.test(raw)) return raw.slice(0, 120)
  const fallback = typicalWeatherFallback(location)
  if (/water\s*temperature/i.test(fallback)) {
    const seasonBit = location.season.split(/[·,]/)[0]?.trim() ?? 'Year-round'
    return `${seasonBit}: check live forecasts — humidity shifts daily.`.slice(0, 120)
  }
  return fallback.slice(0, 120)
}

function stripYearBriefing(dateStr: string): string {
  return sentenceCase(dateStr.replace(/\b(20\d{2})\b/g, '').trim())
}

export function buildJourneyHeroMetaLine(input: {
  durationDays: number
  budgetRange: string
  activity: string
  difficultyLabel: string
  month?: string | null
  tripRole?: 'ACTIVE_TRAVEL' | 'COMPETITOR' | 'WATCHING'
}): string {
  const roleSuffix =
    input.tripRole === 'WATCHING'
      ? ' · Watching & supporting'
      : input.tripRole === 'COMPETITOR'
        ? ' · Racing'
        : ''
  const activity = sentenceCase(input.activity?.trim() || 'Travel')
  const monthPart = input.month?.trim() ? `${input.month.trim()} · ` : ''
  return `${input.durationDays} days · ${monthPart}${sentenceCase(input.budgetRange ?? '')} · ${activity} · ${input.difficultyLabel}${roleSuffix}`
}

type WhyLine = { icon: string; text: string; boldPhrase?: string }

export function buildWhyThisSpotLines(
  location: MatrixLocationData,
  refine: { skillLevel: string }
): WhyLine[] {
  const fromLoc = location.whyThisSpotLines?.filter((row) => row.text?.trim()) ?? []
  if (fromLoc.length >= 4) {
    return fromLoc.map((row) => ({ icon: row.icon, text: row.text, boldPhrase: row.boldPhrase }))
  }

  const name = location.name
  const act = location.activity
  const country = location.country
  const seasonLine = location.bestSeason?.trim() || location.season
  const diff = sentenceCase(location.difficulty || refine.skillLevel)
  const airport = location.nearestAirport?.trim()
  const lines: WhyLine[] = [
    {
      icon: '📍',
      text: `${name} is a ${diff.toLowerCase()}-graded ${act.toLowerCase()} destination in ${country}.`,
      boldPhrase: `${diff.toLowerCase()}-graded`,
    },
    {
      icon: '📅',
      text: `Best conditions window for ${name} runs ${seasonLine} — plan your dates around this to avoid off-season closures or poor conditions.`,
      boldPhrase: seasonLine,
    },
    {
      icon: '🏄',
      text: `This pick is rated ${diff} — intermediate skill or above is recommended before committing to ${name}.`,
      boldPhrase: diff,
    },
  ]

  const ev = location.upcomingEvents?.[0]
  if (ev?.name?.trim()) {
    lines.push({
      icon: '🗓️',
      text: `${ev.name} (${ev.date}) is on the calendar — timing your trip around this event will affect accommodation availability and prices.`,
      boldPhrase: ev.name.trim(),
    })
  } else if (airport && airport.length > 3 && !/^main airport\b/i.test(airport)) {
    lines.push({
      icon: '✈️',
      text: `The nearest international gateway is ${airport} — factor transfer time into your first and last day schedule.`,
      boldPhrase: airport,
    })
  } else {
    lines.push({
      icon: '✈️',
      text: `Check international connections to ${country} before booking — transfer options and journey times vary significantly by origin.`,
      boldPhrase: `international connections to ${country}`,
    })
  }

  return lines.slice(0, 5)
}

export interface JourneyBriefingPdfActivity {
  time: string
  name: string
  mapHref: string | null
  subline: string | null
  cost: string | null
}

export interface JourneyBriefingPdfDay {
  day: number
  title: string
  activities: JourneyBriefingPdfActivity[]
}

export interface JourneyBriefingPdfContent {
  destinationName: string
  heroImageUrl: string | null
  heroMetaLine: string
  budgetPrimary: string
  budgetSecondary: string
  visaHref: string
  vibeIndex: {
    soloPct: number
    womenPct: number
    safetyFeeling: string
    socialOpenness: string
    thirdLabel: string
    thirdValue: string
    travelerDensity: string
    travelerDensityHint?: string
  }
  fastFacts: Array<{ label: string; value: string; href?: string }>
  budgetFootnote: string
  events: Array<{ name: string; dateLine: string; detailsHref: string; isRecurring: boolean }>
  eventsSearchHref: string | null
  whyThisSpot: WhyLine[]
  whyThisSpotFallback: string | null
  tripRhythmLead: string
  tripRhythmSlots: Array<{ label: string; text: string }>
  itinerary: JourneyBriefingPdfDay[]
  waysToExperience: CardConfig[]
  gearPack: Array<{ item: string; checked: boolean; action: string }>
  gearRent: Array<{ item: string; checked: boolean; action: string }>
  gettingAroundIntro: string
  gettingAroundRows: Array<{
    name: string
    typeLabel: string
    description: string
    cost: string
    appStore?: string
  }>
  intelligenceHub: IntelligenceHubSnapshot
  generatedAt: string
}

export function buildJourneyBriefingPdfContent(input: {
  location: MatrixLocationData
  refine: {
    budgetRange: RefineProfile['budgetRange']
    skillLevel: string
    durationDays?: number
    tripRole?: 'ACTIVE_TRAVEL' | 'COMPETITOR' | 'WATCHING'
  }
  tripSummary?: TripSummaryData | null
  itinerary: MissionBriefingDay[]
  gearItems: JourneyPackLine[]
  mergedHub: IntelligenceHubSnapshot
  travelPurpose: TravelIntent
  generatedAt?: string
}): JourneyBriefingPdfContent {
  const { location, refine, tripSummary, itinerary, gearItems, mergedHub, travelPurpose } = input

  const tripFactsDays =
    refine.durationDays != null && refine.durationDays > 0
      ? refine.durationDays
      : itinerary.length > 0
        ? itinerary.length
        : 5
  const difficultyLabel = sentenceCase((location.difficulty || refine.skillLevel || '').trim() || refine.skillLevel)

  const heroMonth = resolveHeroMonthLabel({
    season: location.season,
    bestSeason: location.bestSeason,
    eventDate: location.upcomingEvents?.[0]?.date,
  })

  const heroMetaLine = buildJourneyHeroMetaLine({
    durationDays: tripFactsDays,
    budgetRange: refine.budgetRange ?? '',
    activity: location.activity,
    difficultyLabel,
    month: heroMonth,
    tripRole: refine.tripRole,
  })

  const heuristicBudget =
    refine.budgetRange === 'LUXE' ? '$400+' : refine.budgetRange === 'MID-RANGE' ? '$150-300' : '$70-140'
  const dailyBudgetStr = dailyBudgetDisplayForTier(location, refine.budgetRange, heuristicBudget).slice(0, 80)
  const budgetPrimary =
    tripSummary?.totalBudget?.trim() ||
    formatTripBudgetTotalEstimate(location, refine.budgetRange, tripFactsDays, heuristicBudget)
  const budgetRange = parseDailyBudgetUsdRange(dailyBudgetStr)
  const budgetSecondary = budgetRange
    ? `~$${formatUsdInteger(budgetRange.min)}–${formatUsdInteger(budgetRange.max)} / day · ${tripFactsDays} days`
    : `${tripFactsDays} days · total depends on your daily spend band`

  const nightSafety = location.nightSafety ?? 60
  const communityDensity = location.communityDensity ?? 55
  const infrastructureScore = location.infrastructureScore ?? 60
  const vibeThird = getConfirmVibeThird(location.activity, infrastructureScore, communityDensity)
  const travelerDensity = travelerDensityDisplay(communityDensity, infrastructureScore)

  const events = resolveDisplayEvents(location)
  const showEventsSearch = shouldShowEventsSearchFallback(travelPurpose, events.length)

  const tripRhythm = location.tripRhythm
  const rhythmSlots = (
    [
      { key: 'morning' as const, label: 'Morning' },
      { key: 'afternoon' as const, label: 'Afternoon' },
      { key: 'evening' as const, label: 'Evening' },
      { key: 'night' as const, label: 'Night' },
    ] as const
  )
    .map(({ key, label }) => {
      const text = tripRhythm?.[key]?.trim()
      return text ? { label, text } : null
    })
    .filter(Boolean) as Array<{ label: string; text: string }>

  const mobilityRows = mergeLocalTransportForLocation({
    localTransport: location.localTransport,
    transportOptions: location.transportOptions,
    name: location.name,
    country: location.country,
  })

  const experienceMapQuery = [location.primaryTitle || location.name, location.country].filter(Boolean).join(', ')
  const waysToExperience = getExperienceCards(
    travelPurpose,
    refineBudgetToExperienceTier(refine.budgetRange),
    location.activity,
    location.name,
    location.season,
    experienceMapQuery
  )

  const packItems = gearItems.filter((line) => !isRentGearLine(line))
  const rentItems = gearItems.filter((line) => isRentGearLine(line))

  const pdfItinerary: JourneyBriefingPdfDay[] = itinerary.map((day) => ({
    day: day.day,
    title: day.title?.trim() ? day.title : `Day ${day.day}`,
    activities: (day.activities ?? []).map((activity) => {
      const { cleanName, mapHref } = parseActivityCoordinates(activity?.name ?? '')
      const subPieces = [activity.sportReason, activity.transport].filter(Boolean) as string[]
      return {
        time: activity?.time?.trim() ? activity.time : '—',
        name: cleanName || 'Activity',
        mapHref,
        subline: subPieces.length > 0 ? subPieces.join(' · ') : null,
        cost: itineraryCostDisplayText(cleanName, activity?.price) ?? null,
      }
    }),
  }))

  return {
    destinationName: location.name?.trim() || 'Your destination',
    heroImageUrl:
      location.image?.trim() && /^https:\/\/images\.unsplash\.com\//i.test(location.image.trim())
        ? location.image.trim()
        : null,
    heroMetaLine,
    budgetPrimary,
    budgetSecondary,
    visaHref: visaRequirementsGoogleHref(location.country),
    vibeIndex: {
      soloPct: Math.min(100, Math.max(0, location.soloIndex ?? 0)),
      womenPct: Math.min(100, Math.max(0, location.womenFriendly ?? 0)),
      safetyFeeling: safetyFeelingLabel(nightSafety),
      socialOpenness: socialOpennessLabel(communityDensity),
      thirdLabel: vibeThird.label,
      thirdValue: vibeThird.value,
      travelerDensity: travelerDensity.value,
      travelerDensityHint: travelerDensity.hint,
    },
    fastFacts: [
      { label: 'Nearest airport', value: airportFactLineForLocation(location) },
      { label: 'Visa', value: 'Check requirements →', href: visaRequirementsGoogleHref(location.country) },
      {
        label: 'Best season',
        value: formatBestSeasonDisplay(location.bestSeason, sentenceCase(location.season)).slice(0, 120) || '—',
      },
      { label: 'Ideal trip length', value: `${tripFactsDays} days` },
      { label: 'Budget estimate', value: `${budgetPrimary} — ${budgetSecondary}` },
      { label: 'Typical weather', value: displayTypicalWeather(location) },
    ],
    budgetFootnote:
      'Estimates cover accommodation, food, local transport, and activity costs. Flights not included.',
    events: events.map((event) => ({
      name: event.name,
      dateLine: `${stripYearBriefing(event.date)} · ${location.name}, ${location.country}`,
      detailsHref: eventDetailsHref(event.name, location.name),
      isRecurring: event.isRecurring,
    })),
    eventsSearchHref: showEventsSearch
      ? eventsSearchHref(location.activity, location.name, location.season)
      : null,
    whyThisSpot: buildWhyThisSpotLines(location, refine),
    whyThisSpotFallback: location.whyThisSpot?.trim() || null,
    tripRhythmLead: tripRhythmLeadCopy(location.activity),
    tripRhythmSlots: rhythmSlots,
    itinerary: pdfItinerary,
    waysToExperience,
    gearPack: packItems.map((line) => journeyPackToPdfGearRow(line)),
    gearRent: rentItems.map((line) => journeyPackToPdfGearRow(line)),
    gettingAroundIntro: scrubActivityZones(location.activityZones, location).trim(),
    gettingAroundRows: mobilityRows.map((option) => ({
      name: sanitizePdfText(option.name),
      typeLabel: sanitizePdfText(option.type.replace(/-/g, ' ').toUpperCase()),
      description: sanitizePdfText(option.description?.trim() || '—'),
      cost: sanitizePdfText(option.cost?.trim() || '—'),
      appStore: option.appStore?.trim() || undefined,
    })),
    intelligenceHub: mergedHub,
    generatedAt: input.generatedAt ?? new Date().toLocaleDateString(),
  }
}

/** Shared briefing content for Final Journey preview and PDF export. */
export const buildJourneyBriefingContent = buildJourneyBriefingPdfContent
