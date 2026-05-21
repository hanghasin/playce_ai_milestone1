'use client'

import { useMemo } from 'react'
import { ConfirmMovePage, type ConfirmDynamic } from '@/components/playce/ConfirmMovePage'
import type { RefineProfile } from '@/components/playce/the-refine'
import type { MatrixLocationData, LocalTransportDetail } from '@/lib/playce-location-types'
import { airportFallbackInstruction, primaryAirportsLine } from '@/lib/playce-airport-hints'
import { normalizeMatrixLocation } from '@/lib/normalize-matrix-location'
import { activityNeedsHeavyGearRental } from '@/lib/playce-gear-checklist'
import { dailyBudgetDisplayForTier } from '@/lib/playce-confirm-helpers'
import { mergeLocalTransportForLocation } from '@/lib/playce-local-transport'
import { resolveRefineProfile } from '@/lib/playce-default-refine'

interface LocationData {
  name: string
  country: string
  activity: string
  season: string
  difficulty: string
  vibe: string
  image: string
  womenFriendly: number
  soloIndex: number
  nightSafety?: number
  harassmentRisk?: number
  communityDensity?: number
  infrastructureScore?: number
  soloQuotes?: string[]
  hasExplicitActivity?: boolean
  activityZones?: string
  logistics: string[]
  nearestAirport?: string
  visaRequirements?: string
  budgetTier?: 'ESSENTIAL' | 'MID-RANGE' | 'LUXE'
  budgetEssential?: string
  budgetMidrange?: string
  budgetLuxe?: string
  budgetNeighborhood?: string
  midrangeNeighborhood?: string
  luxeNeighborhood?: string
  dailyBudget?: string
  optimalDurationDays?: number
  stayRecommendation?: {
    name: string
    type: string
    nightlyPrice?: string
  }
  transportOptions?: {
    name: string
    description: string
    type: 'PUBLIC' | 'APP' | 'RENTAL' | 'WALKING'
  }[]
  localTransport?: LocalTransportDetail[]
  mustTryExperiences?: { name: string; status?: string; risk?: string }[]
  facilities: { name: string; available: boolean }[]
  conditions: {
    temp: string
    waves?: string
    snow?: string
    visibility?: string
  }
  upcomingEvents?: {
    name: string
    date: string
    description: string
    website: string
    isRecurring: boolean
  }[]
  primaryTitle?: string
  locationLabel?: string
  tripRhythm?: {
    morning: string
    afternoon: string
    evening: string
    night: string
  }
  whyThisSpotLines?: { icon: string; text: string; boldPhrase?: string }[]
  bestSeason?: string
  vibeTags?: string[]
}

function airportLineForLocation(location: LocationData): string {
  const fromCard = location.nearestAirport?.trim()
  if (fromCard && !/^main airport\b/i.test(fromCard)) return fromCard
  return primaryAirportsLine(location.name, location.country) || airportFallbackInstruction(location.name, location.country)
}

function raceLikeLocation(location: LocationData): boolean {
  const act = location.activity.toLowerCase()
  const events = (location.upcomingEvents ?? []).map((e) => e.name).join(' ')
  const blob = `${act} ${events}`.toLowerCase()
  return /\b(marathon|half[\s-]marathon|ultra|triathlon|10\s*km|gran fondo|sportive)\b/.test(blob)
}

function buildAccommodationOpsRationale(location: LocationData, refine: RefineProfile): string {
  const act = location.activity.toLowerCase()
  const ctx = `${location.name} ${location.country}`.toLowerCase()
  const riverCity = /\b(bangkok|thailand|chao|phraya|river)\b/.test(ctx) || /\b(river|riverside|waterfront)\b/.test(act)

  if (refine.tripRole === 'COMPETITOR') {
    if (raceLikeLocation(location)) {
      return `Stay near the official start or corral cluster, or an expo-adjacent hub with reliable early-morning transit — cuts corral stress and surprise road closures. ${riverCity ? 'On loop or bridge-heavy courses, validate river-crossing access the night before — not a leisure cruise detour on race eve.' : 'Lock one meet point for crew and bag drop — zero morning improvisation.'}`
    }
    return `Base near accreditation and kit rules (not generic downtown sightseeing): minimise walk time to staging, protect sleep, keep drop bags and warm-up loops predictable.`
  }
  if (refine.tripRole === 'WATCHING') {
    return `Balance start/finish access with transit that survives closures — scout vantage or cheer belts the evening before; pre-load reunion coordinates and purposeful downtime pockets between checkpoints.`
  }
  // ACTIVE_TRAVEL / practice
  if (/\b(surf|ski|climb|kayak)\b/.test(act)) {
    return `Stay one transfer away from launch trailhead or beach break — dawn sessions punish wrong-side commutes.`
  }
  if (/\b(run|marathon|yoga|walk)\b/.test(act)) {
    return `Prioritise quiet recovery sleep and safe pre-dawn exits to main training corridors — minimise taxi roulette before key sessions.`
  }
  return `Anchor on short walks to primary training geography and predictable late-night returns — logistics before aesthetics.`
}

/** Competitor week when there is no parsed marathon/half hook — still bans "foundation training" fluff. */
function buildGenericCompetitorEventItinerary(
  tripDays: number,
  location: LocationData,
  checkInArea: string,
  airportLine: string
): Array<{ day: number; title: string; activities: string[] }> {
  const eventName = location.upcomingEvents?.[0]?.name?.trim() || 'Scheduled competition'
  const packet = 'Registration / packet pickup — confirm window, ID, kit rules'
  const recon = 'Course or start-area recon — note closures, toilets, warm-up lane'
  const carbSleep = 'Carb load + hard lights-out — treat sleep as equipment'
  const raceBlock = `${eventName} — full protocol: staging, nutrition, pacing, finish routine`
  const recover = 'Flush walk + mobility — no junk miles; rehydrate and refuel'

  if (tripDays <= 1) {
    return [{ day: 1, title: 'Competition window', activities: [`Arrive — ${airportLine}`, packet, raceBlock] }]
  }
  if (tripDays === 2) {
    return [
      { day: 1, title: 'Arrival & admin', activities: [`Arrive — ${airportLine}`, `Check in — ${checkInArea}`, packet] },
      { day: 2, title: 'Event & travel', activities: [raceBlock, recover, `Depart — ${airportLine}`] },
    ]
  }
  if (tripDays === 3) {
    return [
      { day: 1, title: 'Arrival & entry', activities: [`Arrive — ${airportLine}`, `Check in — ${checkInArea}`, packet] },
      { day: 2, title: 'Pre-event lock-in', activities: ['Easy shakeout — controlled', recon, carbSleep] },
      { day: 3, title: 'Race & recovery', activities: [raceBlock, recover, `Depart — ${airportLine}`] },
    ]
  }

  let out: Array<{ day: number; title: string; activities: string[] }> = [
    { day: 1, title: 'Arrival & athlete admin', activities: [`Arrive — ${airportLine}`, `Check in — ${checkInArea}`, packet] },
    { day: 2, title: 'Recon & fueling', activities: [recon, 'Drop bag + timing rehearsal', carbSleep] },
    {
      day: 3,
      title: 'Race / main event',
      activities: [raceBlock, 'Finish routine — dry kit, calories, short walk'],
    },
    { day: 4, title: 'Recovery & departure', activities: [recover, 'Pack gear', `Depart — ${airportLine}`] },
  ]

  let ins = 4
  while (out.length < tripDays) {
    out.splice(out.length - 1, 0, {
      day: ins,
      title: 'Buffer — feet & logistics',
      activities: ['Sleep and hydration priority', 'Organise accreditation / transport proofs only — no hard training'],
    })
    ins++
    for (let i = 0; i < out.length; i++) out[i].day = i + 1
  }
  while (out.length > tripDays) {
    out.pop()
    for (let i = 0; i < out.length; i++) out[i].day = i + 1
  }
  return out
}

function scrubExperienceTitle(name: string, location: LocationData): string {
  if (!name) return name
  if (!/race route preview|main airport for/i.test(name)) return name
  return concreteTrainingFocusHeading(location)
}

function concreteTrainingFocusHeading(location: LocationData): string {
  const ctx = `${location.name} ${location.country}`.toLowerCase()
  if (/new york|nyc|manhattan|brooklyn|queens/.test(ctx))
    return 'Course-touch tempo — Central Park loop or East River Greenway'
  if (/boston/.test(ctx) && /usa|united states|massachusetts/.test(ctx))
    return 'Strength session — Charles River paths / gentle Newton hills preview'
  if (/chicago/.test(ctx) && /usa|united states|illinois/.test(ctx))
    return 'Wind-aware repeats — authorised Lakefront Trail segment'
  return 'Key segments from the official course map — no placeholder labels'
}

function buildRaceWeekCompetitorItinerary(
  tripDays: number,
  location: LocationData,
  checkInArea: string,
  airportLine: string
): Array<{ day: number; title: string; activities: string[] }> {
  const ctx = `${location.name} ${location.country}`.toLowerCase()
  const raceEvent = location.upcomingEvents?.[0]?.name ?? location.activity
  const nyc = /new york|nyc|manhattan|brooklyn|queens/.test(ctx)

  const expo = nyc
    ? 'Expo & bib — Jacob K. Javits Center (book your entry window)'
    : 'Official expo & bib — confirm hours on the organiser site'
  const shakeout = nyc
    ? 'Easy shakeout — Central Park Reservoir or Bridle Path'
    : 'Easy shakeout — riverfront or large park loop near stay'
  const recon = nyc
    ? 'Recon — Queensboro Bridge approach + First Avenue rhythm (only where legally permitted)'
    : 'Course recon on published map segments — obey traffic and closures'
  const carbLoad = 'Pre-race dinner — early reservation; lights-out discipline'
  const raceMorning = `Race morning — ${raceEvent}: corral, pacing, and nutrition plan`
  const raceFinish = 'Finish routine — dry clothes, calories, short walk; no bonus miles'
  const recovery = nyc
    ? 'Flush walk — Hudson River Greenway or West Side Hwy pedestrian sections'
    : 'Light movement — easy walk and mobility; hydrate'

  if (tripDays <= 1) {
    return [{ day: 1, title: 'Race window', activities: [`Arrive — ${airportLine}`, `Check in — ${checkInArea}`, raceMorning] }]
  }
  if (tripDays === 2) {
    return [
      { day: 1, title: 'Arrival & bib', activities: [`Arrive — ${airportLine}`, `Check in — ${checkInArea}`, expo] },
      { day: 2, title: 'Race & travel', activities: [raceMorning, raceFinish, `Depart — ${airportLine}`] },
    ]
  }
  if (tripDays === 3) {
    return [
      { day: 1, title: 'Arrival & expo', activities: [`Arrive — ${airportLine}`, `Check in — ${checkInArea}`, expo] },
      { day: 2, title: 'Race day', activities: [shakeout, raceMorning, raceFinish] },
      { day: 3, title: 'Recovery & depart', activities: [recovery, 'Pack medals & gear', `Depart — ${airportLine}`] },
    ]
  }
  if (tripDays === 4) {
    return [
      { day: 1, title: 'Arrival & race admin', activities: [`Arrive — ${airportLine}`, `Check in — ${checkInArea}`, expo] },
      { day: 2, title: 'Shakeout & recon', activities: [shakeout, recon, carbLoad] },
      { day: 3, title: 'Race day', activities: [raceMorning, raceFinish, 'Spectator/meet plan if traveling with crew'] },
      { day: 4, title: 'Recovery & departure', activities: [recovery, 'Pack out; download photos', `Depart — ${airportLine}`] },
    ]
  }
  // 5+ days: full arc with separate departure buffer
  const out: Array<{ day: number; title: string; activities: string[] }> = [
    { day: 1, title: 'Arrival & athlete check-in', activities: [`Arrive — ${airportLine}`, `Check in — ${checkInArea}`, expo] },
    { day: 2, title: 'Course recon & prep', activities: [recon, 'Kit check; anti-chafe & pacing rehearsal', carbLoad] },
    { day: 3, title: 'Race day', activities: [raceMorning, raceFinish, 'Logistics: bags, medal, meet point'] },
    { day: 4, title: 'Recovery & departure prep', activities: [recovery, 'Soft sports massage or pool if booked', 'Start packing'] },
    { day: 5, title: 'Departure', activities: ['Final coffee or easy stroll', `Depart — ${airportLine}`] },
  ]
  let d = 6
  while (out.length < tripDays) {
    out.splice(out.length - 1, 0, {
      day: d,
      title: 'Buffer / easy tourism',
      activities: ['Optional easy walk; keep legs fresh', 'Hydration and sleep priority'],
    })
    d++
    for (let i = 0; i < out.length; i++) out[i].day = i + 1
  }
  while (out.length > tripDays) {
    out.pop()
    for (let i = 0; i < out.length; i++) out[i].day = i + 1
  }
  return out
}


function buildRaceWeekSupportingItinerary(
  tripDays: number,
  location: LocationData,
  checkInArea: string,
  airportLine: string
): Array<{ day: number; title: string; activities: string[] }> {
  const raceEvent = location.upcomingEvents?.[0]?.name ?? location.activity

  if (tripDays <= 2) {
    return [
      {
        day: 1,
        title: 'Arrive together',
        activities: [
          `Arrive — ${airportLine}`,
          `Check in — ${checkInArea}`,
          `Easy city stroll — racer turns in early; you handle snacks + alarms`,
        ],
      },
      {
        day: 2,
        title: 'Race day — support choreography',
        activities: [
          `Early — start precinct for ${raceEvent} with closure buffer`,
          `Cheer-pocket hops + purposeful downtime near the corridor while they are on-course`,
          `Finish precinct — reunion plan before crowded cell zones`,
          'Evening — light celebration focused on calories and sleep for the athlete',
          `Depart — ${airportLine}`,
        ],
      },
    ]
  }

  if (tripDays === 3) {
    return [
      {
        day: 1,
        title: 'Pre-event — settling in',
        activities: [`Arrive — ${airportLine}`, `Check in — ${checkInArea}`, `Explore calmly together — racer protects legs and sleep`],
      },
      {
        day: 2,
        title: `Event day (${raceEvent})`,
        activities: [
          `Morning — gear handoff near start belts; hydrate them, not distractions`,
          'Mid-day — leapfrog cheer points + cafes or quiet errands between sightings',
          'Finish — reunion + easy food before the adrenaline crash',
          'Evening — short toast; early bed window for athlete recovery',
        ],
      },
      {
        day: 3,
        title: 'Post-event — decompress',
        activities: ['Slow brunch, easy pacing for tired legs', 'Optional light wandering — mobility over mileage', `Depart — ${airportLine}`],
      },
    ]
  }

  const out: Array<{ day: number; title: string; activities: string[] }> = [
    {
      day: 1,
      title: 'Pre-event arrivals',
      activities: [`Arrive — ${airportLine}`, `Check in — ${checkInArea}`, 'Lay out race-morning timelines + contingency meet points'],
    },
    {
      day: 2,
      title: 'Pre-event buffer',
      activities: [
        'Any bib/expo tasks still open — supporter runs the queue errands',
        'Transit drill: scout two cheer hops from official maps — avoid improvised detours race morning',
        'Quiet dinner together — racer sleep priority',
      ],
    },
    {
      day: 3,
      title: `Race day — ${raceEvent}`,
      activities: [
        'Start precinct — arrival cushion for road closures',
        'On-course hops + intentional downtime pockets while waiting',
        'Finish belt reunion then controlled food + fluids before celebration',
      ],
    },
    {
      day: 4,
      title: 'Post-event unwind',
      activities: ['Recovery-forward morning — massages optional, caffeine for you', `Depart — ${airportLine}`],
    },
  ]
  let d = 5
  while (out.length < tripDays) {
    out.splice(out.length - 1, 0, {
      day: d,
      title: 'Easy together day',
      activities: ['Short walks — athlete sets pace', 'Hydration-forward meals — no heroic tourism'],
    })
    d++
    for (let i = 0; i < out.length; i++) out[i].day = i + 1
  }
  while (out.length > tripDays) {
    out.pop()
    for (let i = 0; i < out.length; i++) out[i].day = i + 1
  }
  return out
}

interface TheMatrixProps {
  location: LocationData
  refine: RefineProfile
  timeframeQuery?: string
  isShortlisted: boolean
  onBack: () => void
  onToggleShortlist: () => void
  onOpenSavedJourneys: () => void
  onOpenShortlist: () => void
  savedJourneyCount: number
  shortlistCount: number
}

function siteThirdOr(siteTertiary: string, sitePrimary: string): string {
  return siteTertiary || sitePrimary
}

function buildTierMidDayActivities(
  budgetRange: RefineProfile['budgetRange'],
  sport: string,
  sitePrimary: string,
  siteSecondary: string,
  siteTertiary: string
): string[][] {
  const midTier: string[][] = [
    [`Morning ${sport} fundamentals clinic`, `Progressive drills — ${sitePrimary}`, 'Coach debrief + nutrition prep'],
    [`${siteSecondary} — technique focus`, 'Video analysis with local instructor', 'Recovery stretch and mobility protocol'],
    [`Advanced ${sport} session with local guide`, `${siteTertiary}`, 'Performance notes and next-day strategy'],
    [`Rest morning + cultural visit in ${sitePrimary}`, `Afternoon ${sport} light session`, 'Local market and evening recon'],
    [`Early ${sport} session — priority corridor`, `${sitePrimary} — push limits`, 'Coach feedback and recovery'],
    [`Technical drills — ${sport} precision work`, `${siteSecondary}`, 'Ice bath + progressive overload planning'],
    [`Guided ${sport} tour with local expert`, `${siteTertiary} — afternoon block`, 'Cultural dinner at local district'],
    [`High-output ${sport} session — performance targets`, `${sitePrimary} — aggressive push`, 'Mental prep and route study'],
    [`Competition-pace ${sport} simulation`, `${siteSecondary}`, 'Gear check and skills assessment'],
    [`Full-day immersion — ${sport} at priority sites`, `${siteTertiary}`, 'Video debrief and plan refinement'],
    [`Peak challenge session`, `${sitePrimary} — summit effort`, 'Celebration dinner at local restaurant'],
    [`Sunrise ${sport} session`, `${siteSecondary} — final form`, 'Sunset wind-down and reflection'],
  ]

  if (budgetRange === 'MID-RANGE') return midTier

  if (budgetRange === 'ESSENTIAL') {
    return [
      [`Free morning corridor — ${sitePrimary}`, 'Self-guided drills on public pitches', 'Budget eats + hydrate early'],
      [`${siteSecondary} — independent technique block`, 'Phone film + solo review', 'Mobility using hotel / park benches'],
      [
        `Public transit day pass — scout ${siteThirdOr(siteTertiary, sitePrimary)}`,
        `Economy stay loop near ${sport}`,
        'Early night — sleep as gear',
      ],
      ['Low-cost neighbourhood walk', `Light ${sport} touch — repeat free loop`, 'Street-food dinner + electrolytes'],
      [`Dawn loop — ${sitePrimary}`, 'DIY intervals without paid coaching', 'Grocery haul for ride snacks'],
      [`Skill reps — ${sport} on public turf`, `${siteSecondary} — chalk your own checkpoints`, 'Free recovery: stretch + hose-down'],
      ['Self-guided map study', `Afternoon jog — ${siteTertiary}`, 'Cook-at-hostel meal'],
      [`Tempo pushes — ${sitePrimary}`, 'Bus or metro only — skip premium transfers', 'Plan next day via official free maps'],
      [`Solo rehearsal — ${siteSecondary}`, 'Borrow community courts / beaches when allowed', 'Pack-out gear tonight'],
      [
        'Long easy day on foot + bike-share if cheap',
        `${siteThirdOr(siteTertiary, sitePrimary)} repeat miles`,
        'Picnic supper',
      ],
      [`Threshold session — ${sitePrimary}`, 'Skip paid add-ons; use public lockers', 'Split a simple celebratory plate'],
      [`Final free-loop ${sport}`, `${siteSecondary} — selfie checkpoints only`, 'Sleep ahead of departure'],
    ]
  }

  return [
    [`Private chauffeur to premium ${sport} venue`, `Coached rehearsal — ${sitePrimary}`, 'Concierge-booked recovery'],
    [`${siteSecondary} — pro eye on technique`, 'Film review in-suite', 'Luxury spa / contrast therapy'],
    [
      `Private transfer window — ${siteTertiary}`,
      'White-glove rental fitting',
      'Sommelier-adjacent dinner (skip tourist traps)',
    ],
    ['Sleep-in + concierge breakfast', `Private ${sport} slot — low crowd window`, 'Chef-led tasting menu'],
    [`VIP lane access — ${sitePrimary}`, '1:1 pacing consult', 'Private driver home'],
    [`Precision lab block — ${sport}`, `${siteSecondary} with named coach`, 'Hotel ice bath suite'],
    ['Curated insider route', `${siteTertiary} — behind-the-scenes where available`, 'Members lounge wind-down'],
    [`Performance tuning — ${sitePrimary}`, 'Data upload with coach', 'Premium rest day provisioning'],
    [`Race-simulation — ${sport}`, `${siteSecondary} private pacing`, 'High-end logistics dry-run'],
    [`Signature venue immersion`, `${siteTertiary}`, 'Private airport lounge buffer later'],
    [`Summit intensity — ${sitePrimary}`, 'Butler-arranged calorie window', 'Top-table dinner reservation'],
    [`Final sunrise — ${siteSecondary}`, 'Private packing assist', 'Chauffeured departure'],
  ]
}

function buildFallbackWhyThisSpotLines(
  location: LocationData,
  refine: RefineProfile
): { icon: string; text: string; boldPhrase?: string }[] {
  const name = location.name
  const act = location.activity
  const country = location.country
  const seasonLine = location.bestSeason?.trim() || location.season
  const diff = sentenceCase(location.difficulty)
  const airport = location.nearestAirport?.trim()
  const lines: { icon: string; text: string; boldPhrase?: string }[] = []

  // 1 — grading / destination type
  lines.push({
    icon: '📍',
    text: `${name} is a ${diff.toLowerCase()}-graded ${act.toLowerCase()} destination in ${country}.`,
    boldPhrase: `${diff.toLowerCase()}-graded`,
  })

  // 2 — season / timing
  lines.push({
    icon: '📅',
    text: `Best conditions window for ${name} runs ${seasonLine} — plan your dates around this to avoid off-season closures or poor conditions.`,
    boldPhrase: seasonLine,
  })

  // 3 — skill / terrain
  lines.push({
    icon: '🏄',
    text: `This pick is rated ${diff} — intermediate skill or above is recommended before committing to ${name}.`,
    boldPhrase: diff,
  })

  // 4 — access or event
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

  return lines
}

function generateDynamicContent(location: LocationData, refineInput: RefineProfile) {
  const refine = resolveRefineProfile(refineInput)
  const { skillLevel, budgetRange } = refine
  const tripDays = refine.duration
    ? (durationToDays[refine.duration] ?? 8)
    : Math.min(Math.max(location.optimalDurationDays ?? 5, 2), 14)

  const airportLine = airportLineForLocation(location)
  const raceLike = raceLikeLocation(location)
  const racing = raceLike && refine.tripRole === 'COMPETITOR'
  const watchingRaceWeek = raceLike && refine.tripRole === 'WATCHING'
  const gearHeavyRental = activityNeedsHeavyGearRental(location.activity)

  const stayAreas = generateStayAreas(location, budgetRange)

  const femaleFriendlyTips = {
    safety:
      location.womenFriendly >= 80
        ? `${location.name} has strong solo-traveler safety signals and active local communities.`
        : location.womenFriendly >= 60
          ? `${location.name} is generally suitable for solo travel with standard precautions.`
          : `${location.name} requires extra planning around late transport and neighborhood selection.`,
    community:
      skillLevel === 'BEGINNER' || skillLevel === 'INTERMEDIATE'
        ? `Prioritize beginner-friendly ${location.activity.toLowerCase()} operators and daytime sessions.`
        : `Advanced ${location.activity.toLowerCase()} groups and performance-focused coaching are available.`,
    accommodation: `Search by district using Booking.com or Airbnb (links below) — areas vary significantly in vibe and price.`,
  }

  // Keep accommodation reference for itinerary day-1 only
  const accommodation = { name: stayAreas[0]?.area ?? location.name, type: 'area' }

  const internationalAccess = [
    `Nearest airport: ${airportLine}`,
    `Visa — verify requirements for your passport before booking.`,
    `Trip length: ${tripDays} day${tripDays > 1 ? 's' : ''} optimal for ${location.activity.toLowerCase()} conditions.`,
  ]

  const localTransport: LocalTransportDetail[] = mergeLocalTransportForLocation({
    localTransport: location.localTransport,
    transportOptions: location.transportOptions,
    name: location.name,
    country: location.country,
  })

  const experiencesRaw =
    location.mustTryExperiences?.length
      ? location.mustTryExperiences
      : [
          {
            name: raceLike
              ? concreteTrainingFocusHeading(location)
              : `${location.name} core ${location.activity.toLowerCase()} zone`,
            status: 'Primary session',
            risk: 'Medium',
          },
          { name: `${location.country} landmark circuit`, status: 'Half-day add-on', risk: 'Low' },
          { name: 'Local guide-led route', status: 'Book 48h ahead', risk: 'Medium' },
        ]
  const experiences = experiencesRaw.map((e) => ({ ...e, name: scrubExperienceTitle(e.name, location) }))

  const diningDistricts = generateDiningDistricts(location)

  const heuristicDaily =
    budgetRange === 'LUXE' ? '$400+' : budgetRange === 'MID-RANGE' ? '$150-300' : '$70-140'
  const pricing = {
    daily: dailyBudgetDisplayForTier(location as MatrixLocationData, budgetRange, heuristicDaily),
    equipment: gearHeavyRental
      ? skillLevel === 'ELITE' || skillLevel === 'PRO'
        ? 'Ship or carry core kit; rent speciality items only for peak sessions'
        : `Priority: reserve ${location.activity.toLowerCase()} gear for your exact dates — walk-ins fail in high season`
      : 'Pack-first trip: shoes, layers, nutrition, recovery tools — avoid generic rentals unless you truly need hire gear',
    lessons:
      skillLevel === 'BEGINNER'
        ? 'Intro coaching sessions available'
        : skillLevel === 'INTERMEDIATE'
          ? 'Intermediate clinics and local guides available'
          : 'Advanced private coaching available',
  }

  const sport = location.activity.toLowerCase()
  const midDayThemes = [
    'Foundation Training',
    `${location.activity} Core Challenge`,
    'Advanced Technique Session',
    'Rest & Cultural Immersion',
    'Peak Performance Day',
    'Skill Refinement',
    'Local Expert Guide Day',
    'High Intensity Challenge',
    'Competition Simulation',
    'Technical Mastery',
    'Full Send — Peak Site',
    'Deep Field Immersion',
  ]
  const sitePrimary = experiences[0]?.name || concreteTrainingFocusHeading(location)
  const siteSecondary = experiences[1 % experiences.length]?.name || concreteTrainingFocusHeading(location)
  const siteTertiary = experiences[2 % experiences.length]?.name || concreteTrainingFocusHeading(location)
  const midDayActivities = buildTierMidDayActivities(refine.budgetRange, sport, sitePrimary, siteSecondary, siteTertiary)

  const itinerary = racing
    ? buildRaceWeekCompetitorItinerary(tripDays, location, accommodation.name, airportLine)
    : refine.tripRole === 'COMPETITOR'
      ? buildGenericCompetitorEventItinerary(tripDays, location, accommodation.name, airportLine)
      : watchingRaceWeek
        ? buildRaceWeekSupportingItinerary(tripDays, location, accommodation.name, airportLine)
          : Array.from({ length: tripDays }, (_, i) => {
            const day = i + 1
            if (day === 1) {
              return {
                day,
                title: 'Arrival & Setup',
                activities: [
                  `Arrive — ${airportLine}`,
                  `Check in — ${accommodation.name}`,
                  raceLike
                    ? `Easy orientation — ${concreteTrainingFocusHeading(location)}`
                    : `Light recon — key ${sport} corridors near stay`,
                ],
              }
            }
            if (day === tripDays) {
              return {
                day,
                title: 'Final Session & Departure',
                activities: [
                  `Final ${sport} block — ${sitePrimary}`,
                  'Recovery + gear pack-out',
                  `Depart — ${airportLine}`,
                ],
              }
            }
            const themeIndex = (day - 2) % midDayThemes.length
            return {
              day,
              title: midDayThemes[themeIndex],
              activities: midDayActivities[themeIndex % midDayActivities.length],
            }
          })

  const accommodationOpsLine = buildAccommodationOpsRationale(location, refine)
  const prepSectionBlurb =
    refine.tripRole === 'COMPETITOR'
      ? null
      : watchingRaceWeek
        ? 'Watching & supporting lens — vantage belts, ticketing, checkpoint hops, purposeful waits between sightings, reunion clarity — no training blocks for this traveller.'
        : null

  const whyThisSpotLines =
    location.whyThisSpotLines && location.whyThisSpotLines.length >= 4
      ? location.whyThisSpotLines.filter((row) => row?.text && row?.icon)
      : buildFallbackWhyThisSpotLines(location, refine)
  const safeWhyThisSpotLines =
    whyThisSpotLines.length >= 4 ? whyThisSpotLines : buildFallbackWhyThisSpotLines(location, refine)

  return {
    tripDays,
    airportLine,
    accommodationOpsLine,
    prepSectionBlurb,
    gearHeavyRental,
    primaryStayArea: stayAreas[0]?.area,
    femaleFriendlyTips,
    internationalAccess,
    localTransport,
    experiences,
    diningDistricts,
    stayAreas,
    pricing,
    itinerary,
    whyThisSpotLines: safeWhyThisSpotLines,
  }
}

function safeGenerateDynamicContent(location: LocationData, refineInput: RefineProfile) {
  try {
    return generateDynamicContent(location, refineInput)
  } catch (err) {
    console.error('[TheMatrix] dynamic content failed', err)
    const refine = resolveRefineProfile(refineInput)
    const tripDays = refine.duration ? (durationToDays[refine.duration] ?? 8) : 8
    return {
      tripDays,
      airportLine: airportLineForLocation(location),
      accommodationOpsLine: '',
      prepSectionBlurb: null,
      gearHeavyRental: false,
      primaryStayArea: location.name,
      femaleFriendlyTips: { safety: '', community: '', accommodation: '' },
      internationalAccess: [],
      localTransport: [],
      experiences: [],
      diningDistricts: [],
      stayAreas: [],
      pricing: { daily: '$150-300', equipment: '', lessons: '' },
      itinerary: [{ day: 1, title: 'Arrival', activities: [`Arrive — ${location.name}`] }],
      whyThisSpotLines: buildFallbackWhyThisSpotLines(location, refine),
    }
  }
}

function sentenceCase(str: string): string {
  if (!str) return str
  const lower = str.toLowerCase()
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
    year = year + 1
  }

  return { start, end, monthName: MONTHS[monthIndex], year }
}

function filterUpcomingEventsInWindow(
  events: LocationData['upcomingEvents'] | undefined,
  start: Date,
  end: Date
) {
  if (!events || events.length === 0) return []
  const now = new Date(start)
  return events
    .map((ev) => {
      if (!ev?.date) return null
      const range = parseEventDateRange(ev.date, now)
      if (!range) return null
      // Recurring races should map to the user's searched time window year.
      if (ev.isRecurring) {
        let guard = 0
        while (range.end < start && guard < 15) {
          guard += 1
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

function stripYearForDisplay(dateStr: string) {
  return sentenceCase(dateStr.replace(/\b(20\d{2})\b/g, '').trim())
}

function vibeTokens(vibe?: string): string[] {
  if (!vibe) return []
  return vibe
    .split(/[,|·/]/)
    .map((token) => sentenceCase(token.trim()))
    .filter(Boolean)
    .slice(0, 3)
}

function generateStayAreas(
  location: LocationData,
  budgetRange: string
): { area: string; vibe: string }[] {
  const ctx = `${location.name} ${location.country}`.toLowerCase()
  const act = location.activity.toLowerCase()

  if (/\bbali\b/.test(ctx)) {
    if (budgetRange === 'LUXE')
      return [
        { area: 'Seminyak', vibe: 'upscale dining & beach clubs' },
        { area: 'Uluwatu', vibe: 'cliff-top luxury & surf' },
        { area: 'Ubud', vibe: 'wellness & spiritual retreat' },
      ]
    if (budgetRange === 'MID-RANGE')
      return [
        { area: 'Seminyak', vibe: 'lifestyle & dining' },
        { area: 'Canggu', vibe: 'surf culture & cafes' },
        { area: 'Ubud', vibe: 'wellness & spiritual' },
      ]
    return [
      { area: 'Canggu', vibe: 'surf hostels & cafes' },
      { area: 'Kuta', vibe: 'budget-friendly & social' },
      { area: 'Ubud', vibe: 'quiet guesthouses' },
    ]
  }

  if (/chamonix|mont blanc/.test(ctx))
    return [
      { area: 'Chamonix centre', vibe: 'best access & dining' },
      { area: 'Argentière', vibe: 'off-piste & authentic' },
      { area: 'Les Houches', vibe: 'quieter & affordable' },
    ]

  if (/peniche|ericeira|portugal/.test(ctx))
    return [
      { area: 'Baleal', vibe: 'surf camp base' },
      { area: 'Peniche town', vibe: 'local fishing port' },
      { area: 'Ericeira', vibe: 'world surf reserve' },
    ]

  if (/\bbangkok\b|^krung/.test(ctx)) {
    if (budgetRange === 'LUXE')
      return [
        { area: 'Wireless / Lumphini', vibe: 'MRT+BTS; quieter nights for race sleep' },
        { area: 'Charoenkrung riverside', vibe: 'river crossings; early starts toward course side' },
        { area: 'Thong Lo–Ekkamai', vibe: 'dining + BTS spine for city-wide moves' },
      ]
    if (budgetRange === 'MID-RANGE')
      return [
        { area: 'Silom / Sathorn', vibe: 'Skytrain + metro mesh; corporate-quiet side streets' },
        { area: 'Asoke / Phrom Phong', vibe: 'BTS corridor — fast east–west hops' },
        { area: 'Old Town (Phra Nakhon edge)', vibe: 'river proximity; mind festival noise' },
      ]
    return [
      { area: 'Huai Khwang–Ratchada', vibe: 'value MRT belt; night-market energy' },
      { area: 'Victory Monument hub', vibe: 'central bus/BTS spokes' },
      { area: 'On Nut–Bang Chak', vibe: 'affordable BTS; longer hops to riverside starts' },
    ]
  }

  if (/new york|nyc|manhattan|brooklyn|queens/.test(ctx)) {
    if (budgetRange === 'LUXE')
      return [
        { area: 'Midtown Manhattan', vibe: 'expo & premium transit' },
        { area: 'Upper West Side', vibe: 'Central Park adjacency' },
        { area: 'Tribeca', vibe: 'quiet luxury & dining' },
      ]
    if (budgetRange === 'MID-RANGE')
      return [
        { area: 'Midtown Manhattan', vibe: 'Javits / subway hubs' },
        { area: 'Williamsburg, Brooklyn', vibe: 'start-line energy & cafes' },
        { area: 'Lower East Side', vibe: 'food & late trains' },
      ]
    return [
      { area: 'Long Island City, Queens', vibe: 'value & quick Manhattan access' },
      { area: 'Harlem', vibe: 'culture & park-north access' },
      { area: 'Greenpoint, Brooklyn', vibe: 'calmer nights & good eats' },
    ]
  }

  if (/chiang\s*mai|chang\s*mai/.test(ctx) && /thailand/.test(ctx))
    return [
      { area: 'Old City (moat)', vibe: 'compact core; dawn loops; watch scooter traffic' },
      { area: 'Nimman / Suthep foot', vibe: 'café density + mountain-road access' },
      { area: 'Night Bazaar belt', vibe: 'transit hub — noisier at night' },
    ]

  if (/phuket|samui|\bkoh\s|koh ph|koh sam|krabi|pattaya|hua hin/.test(ctx))
    return [
      { area: 'Beachfront strip', vibe: 'direct sea access' },
      { area: 'Old town', vibe: 'authentic & cheaper' },
      { area: 'Resort bay', vibe: 'full-service amenities' },
    ]

  if (/thailand/.test(ctx))
    return [
      { area: 'Near BTS/MRT interchange', vibe: 'urban transit spine' },
      { area: 'Riverside or Old Quarter edge', vibe: 'race or event access — check closure maps' },
      { area: 'Airport-rail corridor', vibe: 'early flight buffers' },
    ]

  // Generic fallback derived from activity type
  const isWater = /surf|dive|sail|snorkel|kayak/.test(act)
  const isMountain = /ski|climb|hike|trail|alpine/.test(act)

  if (isWater)
    return [
      { area: `${location.name} beachfront`, vibe: 'direct water access' },
      { area: 'Town centre', vibe: 'dining & local life' },
      ...(budgetRange === 'LUXE'
        ? [{ area: 'Resort zone', vibe: 'full-service & pool' }]
        : []),
    ]
  if (isMountain)
    return [
      { area: 'Resort base', vibe: 'ski-in/out & lifts' },
      { area: 'Village centre', vibe: 'character & dining' },
      ...(budgetRange === 'LUXE'
        ? [{ area: 'Upper slopes', vibe: 'premium & quiet' }]
        : []),
    ]

  return [
    { area: 'District near main train or metro hub', vibe: 'walkable & convenient' },
    { area: 'Edge neighbourhood with local dining', vibe: 'authentic character' },
  ]
}

function generateDiningDistricts(location: LocationData): { district: string; vibe: string }[] {
  const ctx = `${location.name} ${location.country}`.toLowerCase()

  if (/\bbali\b/.test(ctx))
    return [
      { district: 'Seminyak', vibe: 'upscale restaurants & beach clubs' },
      { district: 'Canggu', vibe: 'casual cafes & plant-based spots' },
      { district: 'Ubud', vibe: 'healthy bowls & organic cuisine' },
    ]

  if (/chamonix|mont blanc/.test(ctx))
    return [
      { district: 'Chamonix centre', vibe: 'brasseries & fondue' },
      { district: 'Les Houches', vibe: 'casual mountain fare' },
    ]

  if (/peniche|ericeira|portugal/.test(ctx))
    return [
      { district: 'Peniche market', vibe: 'fresh seafood & local pastéis' },
      { district: 'Ericeira town', vibe: 'surf cafes & tasca spots' },
    ]

  if (/thailand|phuket|samui|ko\s|koh/.test(ctx))
    return [
      { district: 'Night market', vibe: 'street food & atmosphere' },
      { district: 'Beach road', vibe: 'seafood shacks & sundowners' },
      { district: 'Old town', vibe: 'traditional cuisine & coffee' },
    ]

  if (/japan/.test(ctx))
    return [
      { district: 'Izakaya district', vibe: 'pub dining & yakitori' },
      { district: 'Station area', vibe: 'ramen, soba & convenience' },
      { district: 'Fish market', vibe: 'fresh sashimi & bowls' },
    ]

  return [
    { district: 'Town centre', vibe: 'widest variety & easy access' },
    { district: 'Market area', vibe: 'street food & local flavours' },
    { district: 'Waterfront', vibe: 'casual dining & sundowners' },
  ]
}

export function TheMatrix({
  location: rawLocation,
  refine,
  timeframeQuery,
  isShortlisted,
  onBack,
  onToggleShortlist,
  onOpenSavedJourneys,
  onOpenShortlist,
  savedJourneyCount,
  shortlistCount,
}: TheMatrixProps) {
  const location = useMemo(
    () => normalizeMatrixLocation(rawLocation as MatrixLocationData),
    [rawLocation]
  )

  const dynamicContent = useMemo(() => safeGenerateDynamicContent(location, refine), [location, refine])
  const vibes = useMemo(() => vibeTokens(location.vibe), [location.vibe])
  const queryWindow = useMemo(
    () => parseQueryTimeWindow(timeframeQuery, dynamicContent.tripDays),
    [timeframeQuery, dynamicContent.tripDays]
  )

  const matchingEvents = useMemo(
    () => filterUpcomingEventsInWindow(location.upcomingEvents, queryWindow.start, queryWindow.end),
    [location.upcomingEvents, queryWindow]
  )

  const vibeTags = useMemo(
    () => (location.vibeTags && location.vibeTags.length > 0 ? location.vibeTags : vibes),
    [location.vibeTags, vibes]
  )

  const displayEvents = useMemo(
    () =>
      matchingEvents.map((item) => {
        const ev = item!.ev
        return {
          name: ev.name,
          date: ev.date,
          isRecurring: ev.isRecurring,
          website: ev.website ?? '',
        }
      }),
    [matchingEvents]
  )

  const confirmDynamic: ConfirmDynamic = useMemo(
    () => ({
      tripDays: dynamicContent.tripDays,
      airportLine: dynamicContent.airportLine,
      pricing: dynamicContent.pricing,
      itinerary: dynamicContent.itinerary,
      whyThisSpotLines: dynamicContent.whyThisSpotLines,
      prepSectionBlurb: dynamicContent.prepSectionBlurb,
      primaryStayArea: dynamicContent.primaryStayArea,
    }),
    [dynamicContent]
  )

  return (
    <ConfirmMovePage
      location={location}
      refine={refine}
      dynamicContent={confirmDynamic}
      vibeTags={vibeTags}
      eventsOverride={displayEvents.length > 0 ? displayEvents : undefined}
      onBack={onBack}
      onToggleShortlist={onToggleShortlist}
      isShortlisted={isShortlisted}
      onOpenSavedJourneys={onOpenSavedJourneys}
      onOpenShortlist={onOpenShortlist}
      savedJourneyCount={savedJourneyCount}
      shortlistCount={shortlistCount}
    />
  )
}
