'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { PDFDownloadLink } from '@react-pdf/renderer'
import type { RefineProfile } from '@/components/playce/the-refine'
import { JourneyPdfDocument } from '@/components/playce/JourneyPDF'
import {
  JourneyMissionBriefingPanel,
  type HubCategory,
  type HubLinkItem,
  type IntelligenceHubSnapshot,
  type TripSummaryData,
} from '@/components/playce/JourneyMissionBriefingPanel'
import type { PanelUpdate } from '@/lib/playce-strategic-advisor-schema'
import type { MatrixLocationData } from '@/lib/playce-location-types'
import { normalizeMatrixLocation } from '@/lib/normalize-matrix-location'
import { resolveCardLocationLabel } from '@/lib/resolve-card-location-label'
import {
  buildDestinationHandoffSlug,
  buildJourneyPdfFileName,
  playcePrimaryCtaStyle,
  playceSecondaryCtaStyle,
  scrubActivityZones,
} from '@/lib/playce-confirm-helpers'
import { PlayceTopNav } from '@/components/playce/playce-top-nav'
import {
  readBrowserTravelIntent,
  tripRoleToTravelIntent,
  type TravelIntent,
} from '@/lib/playce-travel-intent-itinerary-prompt'
import { enforceItineraryDayCount, parseRequestedTripDays, resolveTargetTripDays } from '@/lib/playce-trip-duration'
import {
  activityNeedsHeavyGearRental,
  buildSeedGearChecklist,
  mergeApiPackLinesIntoGear,
} from '@/lib/playce-gear-checklist'
import {
  gearItemsToStorageJson,
  gearRowsToJourneyPackLines,
  parseGearItemsFromStorage,
  type JourneyPackLine,
  JOURNEY_PACK_MAX_BRING,
  newPackLineId,
} from '@/lib/journey-pack-lines'
import { buildJourneyBriefingPdfContent } from '@/lib/journey-briefing-content'
import {
  clearJourneyAdvisorSession,
  loadJourneyAdvisorSession,
  saveJourneyAdvisorSession,
  type JourneyAdvisorSession,
  type SavedJourneyAdvisorSnapshot,
} from '@/lib/journey-advisor-session'

type LocationData = MatrixLocationData

interface TheJourneyProps {
  location: LocationData
  refine: RefineProfile
  generationNonce?: number
  destinationId?: string
  onBack: () => void
  onSave: (snapshot: SavedJourneyAdvisorSnapshot) => void
  onOpenSavedJourneys?: () => void
  onOpenSavedDestinations?: () => void
  savedJourneyCount?: number
  savedDestinationCount?: number
}

interface ChatMessage {
  role: 'ai' | 'user'
  content: string
  /** Do not repeat in chat bubble; renders inline unavailable row + shortcuts. */
  unavailable?: boolean
  /** First-paint client copy; day count is frozen once shown (never rewrite after user chat). */
  clientStaticOpener?: boolean
}

const CHAT_HISTORY_LIMIT = 24
const CHAT_UNAVAILABLE_MSG = 'Chat unavailable right now — try again in a moment.'
/** Sentinel string for advisor error bubbles (must match copy). */
const FRIENDLY_ADVISOR_ERROR = CHAT_UNAVAILABLE_MSG
const ADVISOR_QUICK_PROMPTS = ['Adjust rest days', 'Find gear checklist', 'Change accommodation area'] as const

const SPLIT_STORAGE_KEY = 'playce_split'
const SPLIT_STORAGE_LEGACY_KEY = 'playce_advisor_split'

type ChatTurn = { role: 'user' | 'assistant'; content: string }

function getOpeningMessage(
  location: Pick<LocationData, 'name'>,
  travelPurpose: TravelIntent,
  durationDays: number
): string {
  const dest = location?.name?.trim() || 'your destination'
  const daysLabel = durationDays > 0 ? `${durationDays}-day` : ''

  if (travelPurpose === 'competing') {
    return `Your ${daysLabel} plan for ${dest} is set. Ask me about the course, race day timing, or what to pack.`
  }
  if (travelPurpose === 'watching') {
    return `Your ${durationDays} days in ${dest} are planned. Ask me where to watch, how to get around, or what to do between sessions.`
  }
  return `Your ${daysLabel} trip to ${dest} is ready. Ask me anything about the plan.`
}

function readInitialAdvisorSession(
  destinationId: string | undefined,
  location: LocationData,
  generationNonce: number
): JourneyAdvisorSession | null {
  const destId = destinationId ?? buildDestinationHandoffSlug(location)
  return loadJourneyAdvisorSession(destId, generationNonce)
}

function readInitialSplitPct(): number {
  if (typeof window === 'undefined') return 35
  try {
    const rawNew = window.localStorage.getItem(SPLIT_STORAGE_KEY)
    if (rawNew) {
      const n = Number(rawNew)
      if (Number.isFinite(n)) return Math.max(28, Math.min(52, n))
    }
    const rawOld = window.localStorage.getItem(SPLIT_STORAGE_LEGACY_KEY)
    if (rawOld) {
      const n = Number(rawOld)
      if (Number.isFinite(n)) return Math.max(28, Math.min(52, n))
    }
  } catch {
    /* ignore */
  }
  return 35
}

/** Maps Playce UI chat messages to API turns; keeps the last `limit` turns only. */
function formatChatHistory(messages: ChatMessage[], limit = CHAT_HISTORY_LIMIT): ChatTurn[] {
  return messages
    .filter((m) => !m.unavailable && !(m.role === 'ai' && !m.content.trim()))
    .slice(-limit)
    .map((m) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.content,
    }))
}

interface PdfLink {
  label: string
  href: string
}

interface ItineraryActivity {
  time: string
  name: string
  price: string
  status: string
  transport?: string
  sportReason?: string
  pdfLinks?: PdfLink[]
}

interface ItineraryDay {
  day: number
  title: string
  activities: ItineraryActivity[]
}

const fontBody = 'var(--font-body)'
const fontDisplay = 'var(--font-display)'

function getAccommodationMeta(location: LocationData, budgetRange: RefineProfile['budgetRange']) {
  const ctx = `${location.name} ${location.country}`.toLowerCase()
  const isBaliSurf = /bali/i.test(ctx) && /surf/i.test(location.activity)
  if (budgetRange === 'LUXE') {
    return { name: isBaliSurf ? 'Uluwatu Surf Villas' : `${location.name} Grand Hotel`, price: '$450' }
  }
  // MID-RANGE: use location-specific name, never the generic "Local Boutique Hotel"
  if (budgetRange === 'MID-RANGE') {
    return { name: `${location.name} Boutique`, price: '$120' }
  }
  return { name: isBaliSurf ? 'Padang Padang Hostel' : `${location.name} Guesthouse`, price: '$55' }
}

/**
 * Returns country-accurate transport comparison sources for the seed market data.
 * Detects destination from location.name + location.country string.
 */
function getLocationTransportSources(
  location: LocationData,
  budgetRange: RefineProfile['budgetRange']
): { name: string; price: string; badge: 'Best Value' | 'Best Rate' | null }[] {
  const ctx = `${location.name} ${location.country}`.toLowerCase()
  const isLuxe = budgetRange === 'LUXE'

  // Switzerland
  if (/switzerland|suisse|schweiz|zermatt|zürich|zurich|geneva|bern|lausanne|interlaken|davos|verbier|st\.? moritz/i.test(ctx)) {
    return [
      { name: 'SBB Train', price: 'CHF 20–55', badge: 'Best Value' },
      { name: 'PostBus', price: 'CHF 12–30', badge: null },
      { name: 'Local taxi', price: 'CHF 50–120', badge: null },
    ]
  }
  // France
  if (/france|chamonix|paris|nice|bordeaux|marseille|lyon|méribel|val d.isère|alpe d.huez/i.test(ctx)) {
    return [
      { name: 'Uber', price: '€12–30', badge: 'Best Value' },
      { name: 'Bolt', price: '€10–25', badge: null },
      { name: 'SNCF / TGV rail', price: '€8–35', badge: null },
    ]
  }
  // Germany / Austria
  if (/germany|deutschland|austria|österreich|munich|münchen|berlin|innsbruck|salzburg/i.test(ctx)) {
    return [
      { name: 'Uber', price: '€12–28', badge: 'Best Value' },
      { name: 'Bolt', price: '€10–22', badge: null },
      { name: 'Deutsche Bahn / S-Bahn', price: '€4–18', badge: null },
    ]
  }
  // UK
  if (/united kingdom|uk\b|england|scotland|wales|london|edinburgh/i.test(ctx)) {
    return [
      { name: 'Uber', price: '£14–35', badge: 'Best Value' },
      { name: 'Black cab', price: '£20–50', badge: null },
      { name: 'National Rail', price: '£8–30', badge: null },
    ]
  }
  // Portugal
  if (/portugal|peniche|ericeira|lisbon|porto|algarve|nazaré|nazare/i.test(ctx)) {
    return [
      { name: 'Uber', price: '€8–20', badge: 'Best Value' },
      { name: 'Bolt', price: '€7–18', badge: null },
      { name: 'CP Rail', price: '€3–12', badge: null },
    ]
  }
  // Spain
  if (/spain|españa|madrid|barcelona|seville|bilbao|canary|lanzarote|fuerteventura|tenerife/i.test(ctx)) {
    return [
      { name: 'Uber', price: '€10–25', badge: 'Best Value' },
      { name: 'Cabify', price: '€9–22', badge: null },
      { name: 'RENFE rail', price: '€4–15', badge: null },
    ]
  }
  // Italy
  if (/italy|italia|rome|roma|milan|milano|florence|firenze|venice|venezia|amalfi|sicily/i.test(ctx)) {
    return [
      { name: 'Uber', price: '€12–30', badge: 'Best Value' },
      { name: 'Italo / Trenitalia', price: '€8–40', badge: null },
      { name: 'Local taxi meter', price: '€15–40', badge: null },
    ]
  }
  // Mexico
  if (/mexico|tulum|playa del carmen|cancún|cancun|oaxaca|guadalajara|mexico city|cdmx|puerto escondido/i.test(ctx)) {
    return [
      { name: 'Uber', price: '$8–25', badge: 'Best Value' },
      { name: 'Didi', price: '$7–20', badge: null },
      { name: 'ADO Bus', price: '$5–12', badge: null },
    ]
  }
  // Costa Rica
  if (/costa rica|nosara|tamarindo|jaco|manuel antonio|santa teresa/i.test(ctx)) {
    return [
      { name: 'Uber', price: '$15–45', badge: 'Best Value' },
      { name: 'Shared shuttle', price: '$25–55', badge: null },
      { name: 'TUASA Bus', price: '$3–8', badge: null },
    ]
  }
  // Colombia
  if (/colombia|medellín|medellin|bogotá|bogota|cartagena/i.test(ctx)) {
    return [
      { name: 'Uber', price: '$5–18', badge: 'Best Value' },
      { name: 'InDriver', price: '$4–15', badge: null },
      { name: 'SITP bus', price: '$0.80', badge: null },
    ]
  }
  // Indonesia
  if (/indonesia|bali|lombok|jakarta|java|flores/i.test(ctx)) {
    return isLuxe
      ? [
          { name: 'Grab', price: '$12–30', badge: 'Best Value' },
          { name: 'Villa transfer', price: '$40–80', badge: null },
          { name: 'Klook shuttle', price: '$18–35', badge: null },
        ]
      : [
          { name: 'Grab', price: '$5–15', badge: 'Best Value' },
          { name: 'Gojek', price: '$4–12', badge: null },
          { name: 'Kura-Kura Bus', price: '$8–15', badge: null },
        ]
  }
  // Thailand
  if (/thailand|koh samui|phuket|chiang mai|bangkok|ko lanta|koh tao|koh phangan/i.test(ctx)) {
    return [
      { name: 'Grab', price: '฿150–450', badge: 'Best Value' },
      { name: 'Songthaew shuttle', price: '฿50–150', badge: null },
      { name: 'Airport taxi', price: '฿300–600', badge: null },
    ]
  }
  // India
  if (/india|goa|rishikesh|mumbai|delhi|bangalore|kerala|varkala|hampi/i.test(ctx)) {
    return [
      { name: 'Ola', price: '₹150–400', badge: 'Best Value' },
      { name: 'Rapido', price: '₹80–250', badge: null },
      { name: 'Auto-rickshaw', price: '₹80–200', badge: null },
    ]
  }
  // Japan
  if (/japan|tokyo|osaka|kyoto|hokkaido|niseko|hakuba|nagano/i.test(ctx)) {
    return [
      { name: 'JR Train', price: '¥500–3,000', badge: 'Best Value' },
      { name: 'Airport limousine bus', price: '¥1,000–3,200', badge: null },
      { name: 'IC Card (Suica/Pasmo)', price: '¥220–800', badge: null },
    ]
  }
  // Philippines
  if (/philippines|palawan|siargao|cebu|boracay/i.test(ctx)) {
    return [
      { name: 'Grab', price: 'PHP 150–350', badge: 'Best Value' },
      { name: 'Tricycle', price: 'PHP 50–150', badge: null },
      { name: 'Habal-habal', price: 'PHP 80–200', badge: null },
    ]
  }
  // Vietnam
  if (/vietnam|hanoi|ho chi minh|saigon|da nang|hoi an|mui ne/i.test(ctx)) {
    return [
      { name: 'Grab', price: '$3–12', badge: 'Best Value' },
      { name: 'Xe ôm motorbike', price: '$2–8', badge: null },
      { name: 'Mai Linh taxi', price: '$5–15', badge: null },
    ]
  }
  // Morocco
  if (/morocco|maroc|marrakech|agadir|essaouira|taghazout/i.test(ctx)) {
    return [
      { name: 'Careem', price: 'MAD 25–60', badge: 'Best Value' },
      { name: 'Petit taxi', price: 'MAD 20–50', badge: null },
      { name: 'CTM Bus', price: 'MAD 15–35', badge: null },
    ]
  }
  // Sri Lanka
  if (/sri lanka|colombo|unawatuna|arugam bay|mirissa/i.test(ctx)) {
    return [
      { name: 'PickMe', price: 'LKR 300–800', badge: 'Best Value' },
      { name: 'Tuk-tuk', price: 'LKR 200–500', badge: null },
      { name: 'Intercity train', price: 'LKR 100–300', badge: null },
    ]
  }
  // USA / Canada
  if (/\busa\b|united states|hawaii|california|utah|colorado|canada|whistler|banff/i.test(ctx)) {
    return [
      { name: 'Uber', price: '$20–60', badge: 'Best Value' },
      { name: 'Lyft', price: '$18–55', badge: null },
      { name: 'Airport shuttle', price: '$15–35', badge: null },
    ]
  }
  // Australia / New Zealand
  if (/australia|new zealand|queenstown|sydney|melbourne|bali.*australia/i.test(ctx)) {
    return [
      { name: 'Uber', price: 'A$20–55', badge: 'Best Value' },
      { name: 'Local taxi', price: 'A$25–65', badge: null },
      { name: 'Airport bus', price: 'A$10–25', badge: null },
    ]
  }
  // Generic fallback — avoids any country-specific names
  return [
    { name: 'Rideshare app', price: '$8–25', badge: 'Best Value' },
    { name: 'Local taxi', price: '$12–35', badge: null },
    { name: 'Airport shuttle', price: '$15–40', badge: null },
  ]
}

function attachPdfLinksToItinerary(
  days: ItineraryDay[],
  location: LocationData,
  refine: RefineProfile
): ItineraryDay[] {
  const accom = getAccommodationMeta(location, refine.budgetRange)
  const geo = `${location.name}, ${location.country}`

  const bookingSearch = (q: string) =>
    `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(q)}`
  const maps = (q: string) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`

  const hotelLinks = (): PdfLink[] => [
    { label: accom.name, href: bookingSearch(`${accom.name} ${geo}`) },
    { label: 'Google Maps', href: maps(`${accom.name} ${geo}`) },
  ]

  return days.map((day) => ({
    ...day,
    activities: day.activities.map((act) => {
      const n = act.name
      let pdfLinks: PdfLink[] | undefined

      if (
        n.includes(accom.name) ||
        n.includes('Transfer to ') ||
        (n.includes('Check-in') && n.includes('Equipment'))
      ) {
        pdfLinks = hotelLinks()
      } else if (n.includes('Kaum')) {
        pdfLinks = [{ label: 'Kaum Restaurant', href: maps(`Kaum Restaurant ${geo}`) }]
      } else if (n.includes('Warung') && (n.includes('Dinner') || n.includes('Local'))) {
        pdfLinks = [{ label: 'Local dining', href: maps(`warung ${geo}`) }]
      } else if (n.includes('Single Fin')) {
        pdfLinks = [{ label: 'Single Fin', href: maps(`Single Fin Uluwatu`) }]
      } else if (n.includes('Beach Warung')) {
        pdfLinks = [{ label: 'Beach Warung', href: maps(`beach warung ${geo}`) }]
      } else if (n.includes('Temple')) {
        pdfLinks = [{ label: 'Uluwatu Temple', href: maps(`Uluwatu Temple Indonesia`) }]
      } else if (n.includes('The Lawn')) {
        pdfLinks = [{ label: 'The Lawn', href: maps(`The Lawn Canggu`) }]
      } else if (n.includes('Night Market')) {
        pdfLinks = [{ label: 'Night Market', href: maps(`night market ${geo}`) }]
      } else if (n.includes('Spa')) {
        pdfLinks = [{ label: 'Google Maps', href: maps(`spa wellness ${geo}`) }]
      } else if (n.includes('Market Exploration') || n.includes('Local Market')) {
        pdfLinks = [{ label: 'Google Maps', href: maps(`market ${geo}`) }]
      } else if (
        n.includes('Airport') &&
        (n.includes('Arrival') || n.includes('Transfer') || n.includes('Departure'))
      ) {
        pdfLinks = [{ label: 'Google Maps', href: maps(`${location.name} airport ${location.country}`) }]
      }

      return pdfLinks?.length ? { ...act, pdfLinks } : act
    }),
  }))
}

function buildLocalFallbackItinerary(
  days: number,
  location: LocationData,
  refine: RefineProfile
): ItineraryDay[] {
  const totalDays = Math.max(2, Math.min(days, 21))
  const sport = location.activity.toLowerCase()
  const accom = getAccommodationMeta(location, refine.budgetRange)
  const trip: ItineraryDay[] = []
  const raceLike =
    /\b(marathon|half\s*marathon|ultra|triathlon|duathlon|gran fondo|sportive|\brace\b)\b/i.test(sport)
  const isWatchingRace = raceLike && refine.tripRole === 'WATCHING'

  const hotelReasonCompetitor = `${accom.name} is picked for ${sport} week: close to packet pickup / shakeout routes and away from loud nightlife to protect sleep before the main effort.`
  const hotelReasonWatching = `${accom.name} situates you for event-week hops — vantage belts, cheer checkpoints, start/finish access — with transit-first moves when closures land.`

  if (isWatchingRace) {
    for (let i = 1; i <= totalDays; i += 1) {
      if (i === 1) {
        trip.push({
          day: i,
          title: 'Arrival — event footprint + settle-in',
          activities: [
            {
              time: '14:00',
              name: `Check-in at ${accom.name}`,
              price: accom.price,
              status: 'Plan',
              transport: `Transit from airport / station — skim official closure diagrams before peak crowd windows.`,
              sportReason: hotelReasonWatching,
            },
            {
              time: '15:45',
              name: `Course / venue orientation — ticketing, vantage tiers, official spectator or cheer map`,
              price: 'Free–$35',
              status: 'Plan',
              transport: `If crewing someone racing: soak queue time for bib or expo errands so they protect legs.`,
            },
            {
              time: '19:00',
              name: `Calm supper — early wind-down ahead of race-morning alarms`,
              price: '$20–42',
              status: 'Plan',
              transport: `Walk-distance dining — dodge hype bars near the corridor.`,
            },
          ],
        })
        continue
      }
      if (i === totalDays) {
        trip.push({
          day: i,
          title: 'Post-event softness + departure',
          activities: [
            {
              time: '10:00',
              name: `Brunch belt — electrolytes-first, chatter second`,
              price: '$18–38',
              status: 'Plan',
              transport: `Ride-hail staging one block off the medal photos.`,
            },
            {
              time: '13:30',
              name: `Check-out of ${accom.name}`,
              price: accom.price,
              status: 'Plan',
              transport: `Give airport rides buffer — tannoys linger.`,
            },
          ],
        })
        continue
      }
      if (i === 2 && totalDays >= 3) {
        trip.push({
          day: i,
          title: 'Cheer choreography dry-run',
          activities: [
            {
              time: '10:30',
              name: 'Transit rehearsal — midpoint cheer hops + sanctioned café pockets',
              price: '$5–25',
              status: 'Plan',
              transport: `Write down reunion texts before antennas choke.`,
            },
            {
              time: '15:00',
              name: 'Prep finish-area snack + warmth layer swap bag',
              price: '$10–22',
              status: 'Plan',
            },
            {
              time: '18:30',
              name: 'Screens-down supper — prioritize their sleep runway',
              price: '$20–42',
              status: 'Plan',
              sportReason:
                'Easy sleep beats hero tourism — whoever is racing tomorrow needs boring nights; pure spectators stay fresh for vantage sprints.',
            },
          ],
        })
        continue
      }
      trip.push({
        day: i,
        title: `Watching / support day — ${location.activity} timeline`,
        activities: [
          {
            time: '06:30',
            name: `Start belt logistics — hydration, nerves, contingency meet note`,
            price: 'Free',
            status: 'Plan',
            transport: `Arrive inflated with time — road bans surprise tourists.`,
          },
          {
            time: '11:15',
            name: 'Leapfrog cheer vantage + purposeful downtime corridors',
            price: '$8–26',
            status: 'Plan',
            transport: `Subway leaps > frantic rideshare surges.`,
          },
          {
            time: '16:30',
            name: `Finish precinct reunion — mellow celebration calorie window`,
            price: '$20–42',
            status: 'Plan',
          },
        ],
      })
    }
    return trip
  }

  if (raceLike && refine.tripRole === 'COMPETITOR') {
    for (let i = 1; i <= totalDays; i += 1) {
      if (i === 1) {
        trip.push({
          day: i,
          title: 'Arrival, expo, and fuel',
          activities: [
            {
              time: '13:00',
              name: `Check-in at ${accom.name}`,
              price: accom.price,
              status: 'Plan',
              transport: `Use rideshare or airport train — drop bags, then head straight to expo if open.`,
              sportReason: hotelReasonCompetitor,
            },
            {
              time: '15:30',
              name: `${location.activity} expo — bib, timing chip, and course brief`,
              price: 'Included',
              status: 'Plan',
              transport: 'Pack empty bag for giveaway tote; hydrate at the hall.',
            },
            {
              time: '19:00',
              name: 'High-carb dinner — low fiber, familiar foods only',
              price: '$22–40',
              status: 'Plan',
              transport: 'Walking distance preferred to keep legs fresh.',
              sportReason: 'Carb-loading window 24–36h pre-race; easy digest to reduce GI risk on course.',
            },
          ],
        })
        continue
      }
      if (i === totalDays - 1) {
        trip.push({
          day: i,
          title: 'Race eve — shut it down',
          activities: [
            {
              time: '10:00',
              name: `Easy 20–30 min shakeout jog + strides (${location.name})`,
              price: 'Free',
              status: 'Plan',
              transport: 'Flat loop near stay — no unexplored downhill bombs.',
            },
            {
              time: '16:00',
              name: 'Early pasta / rice plate — front-load fluids',
              price: '$18–35',
              status: 'Plan',
            },
            {
              time: '20:30',
              name: 'Lights out — corral call is early',
              price: '—',
              status: 'Plan',
              sportReason: 'Sleep is part of the taper: aim 8h in bed, phone on DND.',
            },
          ],
        })
        continue
      }
      if (i === totalDays) {
        trip.push({
          day: i,
          title: `Race day — ${location.activity} start to finish + recovery`,
          activities: [
            {
              time: '05:30',
              name: `Race morning — gear, nipple glide, corral transit to ${location.activity} start`,
              price: 'Free',
              status: 'Plan',
              transport: 'Pre-book rideshare pickup away from closed arteries; bring throwaway layers.',
              sportReason: 'Arrive with time for two bathroom passes and a 10 min easy warm-up.',
            },
            {
              time: '12:30',
              name: 'Finish festival + light protein — then easy walk back to hotel',
              price: '$15–25',
              status: 'Plan',
              transport: 'Follow volunteer chute flow; meet crew only in posted reunion zones.',
            },
            {
              time: '16:00',
              name: 'Compression, optional contrast shower, 20 min legs-up',
              price: '—',
              status: 'Plan',
              sportReason: 'Flush quad inflammation before travel — keep moving but no hard intervals.',
            },
            {
              time: '19:00',
              name: `Check-out prep / late bags at ${accom.name}`,
              price: accom.price,
              status: 'Plan',
              transport: 'Late shuttle to airport if red-eye — book with buffer.',
            },
          ],
        })
        continue
      }
      trip.push({
        day: i,
        title: `${location.activity} tune-up day ${i - 1}`,
        activities: [
          {
            time: '08:00',
            name: `Moderate ${sport} session — respect taper volume`,
            price: '$0–35',
            status: 'Plan',
            transport: 'Warm loop on course segments that are legal to preview.',
          },
          {
            time: '13:00',
            name: 'Mobility + optional sports physio window',
            price: '$40–90',
            status: 'Plan',
          },
          {
            time: '18:00',
            name: 'Early dinner — protein + complex carbs',
            price: '$20–38',
            status: 'Plan',
          },
        ],
      })
    }
    return trip
  }

  /* General active trip (non race-meta) */
  for (let i = 1; i <= totalDays; i += 1) {
    if (i === 1) {
      trip.push({
        day: i,
        title: 'Arrival and setup',
        activities: [
          {
            time: '09:00',
            name: `Arrive and transfer to ${accom.name}`,
            price: accom.price,
            status: 'Plan',
            transport: `Local rideshare or train — verify drop-off rules at the property.`,
            sportReason: `Base camp chosen for ${sport}: practical haul for boards/ bikes / kit and quick access to ${location.name} training pockets.`,
          },
          {
            time: '13:00',
            name: `${location.name} ${sport} orientation session`,
            price: '$40',
            status: 'Plan',
          },
          {
            time: '18:00',
            name: 'Early recovery dinner and gear prep',
            price: '$30',
            status: 'Plan',
          },
        ],
      })
      continue
    }
    if (i === totalDays) {
      trip.push({
        day: i,
        title: 'Final session and departure',
        activities: [
          {
            time: '07:00',
            name: `Final ${sport} session in ${location.name}`,
            price: '$45',
            status: 'Plan',
          },
          {
            time: '12:00',
            name: 'Pack-up and checkout',
            price: '$0',
            status: 'Plan',
          },
          {
            time: '16:00',
            name: 'Airport transfer and departure',
            price: '$25',
            status: 'Plan',
          },
        ],
      })
      continue
    }
    trip.push({
      day: i,
      title: `${location.activity} progression day ${i - 1}`,
      activities: [
        { time: '08:00', name: `${location.activity} technique block`, price: '$35', status: 'Plan' },
        { time: '13:00', name: `${location.name} local training route`, price: '$20', status: 'Plan' },
        { time: '17:30', name: 'Recovery, mobility, and planning', price: '$15', status: 'Plan' },
      ],
    })
  }

  return trip
}

type JourneyMarketCmp = {
  accommodation: {
    name: string
    sources: Array<{ name: string; price: string; badge: string | null }>
  }
  transport: {
    name: string
    sources: Array<{ name: string; price: string; badge: string | null }>
  }
}

function generateMarketComparison(location: LocationData, refine: RefineProfile): JourneyMarketCmp {
  const { budgetRange } = refine
  const accomMeta = getAccommodationMeta(location, budgetRange)

  const accommodation =
    budgetRange === 'LUXE'
      ? {
          name: accomMeta.name,
          sources: [
            { name: 'Direct', price: '$405', badge: 'Best Rate' as const },
            { name: 'Booking.com', price: '$450', badge: null },
            { name: 'Airbnb', price: '$480', badge: null },
          ],
        }
      : budgetRange === 'MID-RANGE'
        ? {
            name: accomMeta.name,
            sources: [
              { name: 'Direct', price: '$108', badge: 'Best Rate' as const },
              { name: 'Booking.com', price: '$120', badge: null },
              { name: 'Agoda', price: '$115', badge: null },
            ],
          }
        : {
            name: accomMeta.name,
            sources: [
              { name: 'Hostelworld', price: '$22', badge: 'Best Value' as const },
              { name: 'Booking.com', price: '$25', badge: null },
              { name: 'Direct', price: '$25', badge: null },
            ],
          }

  const transport = {
    name: budgetRange === 'LUXE' ? 'Airport Transfer' : 'Airport Shuttle',
    sources: getLocationTransportSources(location, budgetRange),
  }

  return { accommodation, transport }
}

function mergeMarketComparison(
  prev: JourneyMarketCmp,
  patch: NonNullable<PanelUpdate['marketComparison']>
): JourneyMarketCmp {
  const nextAccommodation = patch.accommodation
    ? {
        name: patch.accommodation.name ?? prev.accommodation.name,
        sources:
          patch.accommodation.sources !== undefined ? patch.accommodation.sources : prev.accommodation.sources,
      }
    : prev.accommodation

  const nextTransport = patch.transport
    ? {
        name: patch.transport.name ?? prev.transport.name,
        sources: patch.transport.sources !== undefined ? patch.transport.sources : prev.transport.sources,
      }
    : prev.transport

  return { accommodation: nextAccommodation, transport: nextTransport }
}

function emptyIntelHub(): IntelligenceHubSnapshot {
  return { experience: [], stay: [], dine: [] }
}

function mergeIntelLayers(
  seed: IntelligenceHubSnapshot,
  ai: IntelligenceHubSnapshot,
  user: IntelligenceHubSnapshot
): IntelligenceHubSnapshot {
  const mergeCat = (cat: keyof IntelligenceHubSnapshot): HubLinkItem[] => {
    const seen = new Set<string>()
    const out: HubLinkItem[] = []
    for (const layer of [user[cat], ai[cat], seed[cat]]) {
      for (const item of layer) {
        const key = item.href.trim().toLowerCase()
        if (!key || seen.has(key)) continue
        seen.add(key)
        out.push(item)
      }
    }
    return out
  }
  return {
    experience: mergeCat('experience'),
    stay: mergeCat('stay'),
    dine: mergeCat('dine'),
  }
}

function concatIntel(prev: IntelligenceHubSnapshot, delta: IntelligenceHubSnapshot): IntelligenceHubSnapshot {
  return {
    experience: [...delta.experience, ...prev.experience],
    stay: [...delta.stay, ...prev.stay],
    dine: [...delta.dine, ...prev.dine],
  }
}

function hubPatchToDelta(patch: NonNullable<PanelUpdate['intelligenceHub']>): IntelligenceHubSnapshot {
  const out = emptyIntelHub()
  ;(['experience', 'stay', 'dine'] as const).forEach((c, ci) => {
    const arr = patch[c]
    if (!arr?.length) return
    const t = Date.now()
    out[c] = arr.map((item, i) => ({
      id: `ai-${c}-${t}-${ci}-${i}`,
      label: item.label.trim(),
      href: /^https?:\/\//i.test(item.href.trim()) ? item.href.trim() : `https://${item.href.trim()}`,
    }))
  })
  return out
}

function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s\]>]+/gi
  const m = text.match(re)
  return m ? [...new Set(m)] : []
}

function labelFromUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return 'Shared link'
  }
}

function categorizeUserUrl(href: string): keyof IntelligenceHubSnapshot {
  const h = href.toLowerCase()
  if (/booking\.com|airbnb\.|hostelworld|agoda|hotels\.com|expedia/.test(h)) return 'stay'
  if (/tripadvisor|opentable|yelp\.|thefork|deliveroo|ubereats|square\.site/.test(h)) return 'dine'
  return 'experience'
}

function urlsToIntelHub(urls: string[]): IntelligenceHubSnapshot {
  const out = emptyIntelHub()
  for (const href of urls) {
    const cat = categorizeUserUrl(href)
    out[cat].push({
      id: `user-${href}`,
      label: labelFromUrl(href),
      href,
    })
  }
  return out
}

function buildSeedIntelligenceHub(location: LocationData, refine: RefineProfile): IntelligenceHubSnapshot {
  const loc = normalizeMatrixLocation(location as MatrixLocationData)
  const geoLine = resolveCardLocationLabel(loc)
  const cityForBooking = geoLine.split(',')[0]?.trim() || loc.name.trim()
  const mapsDest = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(geoLine)}`
  const bookingArea = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(cityForBooking)}`
  const airbnb = `https://www.airbnb.com/s/${encodeURIComponent(cityForBooking)}/homes`
  const hostelworld = `https://www.hostelworld.com/search?search_keywords=${encodeURIComponent(cityForBooking)}`

  const act = loc.activity.toLowerCase()
  const experience: HubLinkItem[] = [
    { id: 'seed-maps', label: `${cityForBooking} · Maps`, href: mapsDest },
  ]

  if (act.includes('climb') || act.includes('boulder')) {
    experience.push({
      id: 'seed-boulder',
      label: 'Bouldering gyms · Maps',
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`bouldering gym ${geoLine}`)}`,
    })
  }
  if (act.includes('surf')) {
    experience.push({
      id: 'seed-surf',
      label: 'Surf spots · Maps',
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`surf break ${geoLine}`)}`,
    })
  }
  if (act.includes('ski')) {
    experience.push({
      id: 'seed-ski',
      label: 'Resort · Maps',
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`ski resort ${geoLine}`)}`,
    })
  }
  if (act.includes('dive')) {
    experience.push({
      id: 'seed-dive',
      label: 'Dive ops · Maps',
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`scuba diving ${geoLine}`)}`,
    })
  }
  if (act.includes('marathon') || act.includes('run') || act.includes('race')) {
    experience.push({
      id: 'seed-race-expo',
      label: 'Race expo & start · Maps',
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`marathon expo ${geoLine}`)}`,
    })
  }

  const stay: HubLinkItem[] = [
    { id: 'seed-booking', label: 'Booking.com', href: bookingArea },
    { id: 'seed-airbnb', label: 'Airbnb', href: airbnb },
  ]
  if (refine.budgetRange !== 'LUXE' && refine.budgetRange !== 'MID-RANGE') {
    stay.push({ id: 'seed-hostelworld', label: 'Hostelworld', href: hostelworld })
  }

  const dine: HubLinkItem[] = [
    {
      id: 'seed-dine',
      label: `Dining · ${cityForBooking}`,
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`restaurants ${geoLine}`)}`,
    },
  ]
  if (refine.budgetRange === 'LUXE') {
    dine.push({
      id: 'seed-kaum',
      label: 'Kaum Restaurant · Maps',
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Kaum Restaurant ${geoLine}`)}`,
    })
  }

  return { experience, stay, dine }
}

const ADVISOR_FETCH_RETRIES = 3

function delayMs(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function AdvisorQuickPills({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {ADVISOR_QUICK_PROMPTS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPick(p)}
          className="cursor-pointer rounded-[2px] border px-3 py-[6px] text-[12px] transition-colors"
          style={{
            fontFamily: fontBody,
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
            background: 'transparent',
          }}
        >
          {p}
        </button>
      ))}
    </div>
  )
}

export function TheJourney({
  location: rawLocation,
  refine,
  generationNonce = 0,
  destinationId,
  onBack,
  onSave,
  onOpenSavedJourneys,
  onOpenSavedDestinations,
  savedJourneyCount = 0,
  savedDestinationCount = 0,
}: TheJourneyProps) {
  const location = useMemo(
    () => normalizeMatrixLocation(rawLocation as MatrixLocationData),
    [rawLocation]
  )
  const resolvedDestinationGearId = destinationId ?? buildDestinationHandoffSlug(location)
  const advisorSessionSnapshotRef = useRef<JourneyAdvisorSession | null | undefined>(undefined)
  if (advisorSessionSnapshotRef.current === undefined) {
    advisorSessionSnapshotRef.current = readInitialAdvisorSession(
      destinationId,
      location,
      generationNonce ?? 0
    )
  }
  const restoredAdvisorSession = advisorSessionSnapshotRef.current
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => restoredAdvisorSession?.messages ?? []
  )
  const [inputValue, setInputValue] = useState('')
  const [isAdvisorThinking, setIsAdvisorThinking] = useState(false)
  const [isGeneratingJourney, setIsGeneratingJourney] = useState(
    () => !(restoredAdvisorSession?.itinerary?.length)
  )
  const [advisorBootstrapKey, setAdvisorBootstrapKey] = useState(0)
  const [gearChecklist, setGearChecklist] = useState(() => buildSeedGearChecklist(location, refine))

  const packStorageKey = useMemo(
    () => `playce_gear_${resolvedDestinationGearId}`,
    [resolvedDestinationGearId]
  )
  const legacyPackStorageKey = useMemo(
    () => `playce-journey-pack-v1:${location.name}:${location.country}:${location.activity}`,
    [location.name, location.country, location.activity]
  )
  const userPackEditedRef = useRef(false)
  const skipInitialPackPersistRef = useRef(true)
  const [gearItems, setGearItems] = useState<JourneyPackLine[]>([])

  /** Same pack-list enrichment as Confirm (Matrix): seed from `buildSeedGearChecklist` + POST `/api/pack-checklist` when the Matrix would show Pack & Prep (explicit activity, not heavy rental). */
  useEffect(() => {
    const seed = buildSeedGearChecklist(location, refine)
    setGearChecklist(seed)

    const shouldFetchPackApi = Boolean(
      location.hasExplicitActivity && !activityNeedsHeavyGearRental(location.activity)
    )
    if (!shouldFetchPackApi) return

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/pack-checklist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: {
              name: location.name,
              country: location.country,
              activity: location.activity,
              season: location.season,
              difficulty: location.difficulty,
            },
            refine: {
              tripRole: refine.tripRole,
              budgetRange: refine.budgetRange,
              skillLevel: refine.skillLevel,
              duration: refine.duration,
            },
          }),
        })
        const data = (await res.json()) as { items?: string[] }
        const items = data.items
        if (cancelled || !Array.isArray(items) || items.length === 0) return
        setGearChecklist((prev) => mergeApiPackLinesIntoGear(prev, items))
      } catch {
        /* keep seed — matches Matrix when API fails */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [location, refine, generationNonce])

  useEffect(() => {
    userPackEditedRef.current = false
    skipInitialPackPersistRef.current = true
    try {
      let raw = localStorage.getItem(packStorageKey)
      if (!raw) {
        const legacy = localStorage.getItem(legacyPackStorageKey)
        if (legacy) {
          raw = legacy
          try {
            localStorage.setItem(packStorageKey, legacy)
          } catch {
            /* ignore quota */
          }
        }
      }
      const stored = parseGearItemsFromStorage(raw)
      if (stored) {
        setGearItems(stored)
        userPackEditedRef.current = true
        return
      }
    } catch {
      /* ignore */
    }
    setGearItems([])
  }, [packStorageKey, legacyPackStorageKey])

  useEffect(() => {
    if (userPackEditedRef.current) return
    const { pack, rent } = gearRowsToJourneyPackLines(gearChecklist)
    setGearItems([...pack, ...rent])
  }, [gearChecklist])

  useEffect(() => {
    try {
      if (skipInitialPackPersistRef.current) {
        skipInitialPackPersistRef.current = false
        return
      }
      localStorage.setItem(packStorageKey, gearItemsToStorageJson(gearItems))
    } catch {
      /* ignore */
    }
  }, [gearItems, packStorageKey])

  const toggleGearChecked = useCallback((id: string) => {
    userPackEditedRef.current = true
    setGearItems((prev) => prev.map((p) => (p.id === id ? { ...p, checked: !p.checked } : p)))
  }, [])

  const setGearItemAction = useCallback((id: string, action: 'Bring' | 'Rent') => {
    userPackEditedRef.current = true
    setGearItems((prev) => prev.map((p) => (p.id === id ? { ...p, action } : p)))
  }, [])

  const removeGearItem = useCallback((id: string) => {
    userPackEditedRef.current = true
    setGearItems((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const addGearItem = useCallback((text: string, action: 'Bring' | 'Rent') => {
    const t = text.trim()
    if (!t) return
    userPackEditedRef.current = true
    setGearItems((prev) => {
      if (prev.length >= JOURNEY_PACK_MAX_BRING) return prev
      return [...prev, { id: newPackLineId(), text: t, checked: false, action }]
    })
  }, [])

  const [initialAdvisorUnreachable, setInitialAdvisorUnreachable] = useState(false)

  const [contentVisible, setContentVisible] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const tripPlanScrollRef = useRef<HTMLDivElement>(null)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const [advisorSplit, setAdvisorSplit] = useState(() => readInitialSplitPct())
  const [isResizingSplit, setIsResizingSplit] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  const [itinerary, setItinerary] = useState<ItineraryDay[]>(
    () => (restoredAdvisorSession?.itinerary as ItineraryDay[] | undefined) ?? []
  )
  const [itineraryMotionKey, setItineraryMotionKey] = useState(0)
  /** User-requested day count from chat (e.g. "make it 6 days") until itinerary catches up. */
  const [advisorDurationOverride, setAdvisorDurationOverride] = useState<number | null>(
    () => restoredAdvisorSession?.advisorDurationOverride ?? null
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const locItin = (location as MatrixLocationData & { itinerary?: unknown }).itinerary
    console.log('Journey sections check:', {
      hasEvents: !!(location?.upcomingEvents?.length),
      hasRhythm: !!location?.tripRhythm,
      hasItinerary: !!(Array.isArray(locItin) && locItin.length > 0) || itinerary.length > 0,
      hasGear: gearItems.length > 0,
      hasTransport: !!(location?.localTransport?.length),
      hasWhyThisSpot: !!(location?.whyThisSpotLines?.length || location?.whyThisSpot),
    })
  }, [location, itinerary, gearItems])

  const [tripSummary, setTripSummary] = useState<TripSummaryData | null>(
    () => restoredAdvisorSession?.tripSummary ?? null
  )
  const itineraryRef = useRef<ItineraryDay[]>(
    (restoredAdvisorSession?.itinerary as ItineraryDay[] | undefined) ?? []
  )
  const messagesRef = useRef<ChatMessage[]>(restoredAdvisorSession?.messages ?? [])

  const [journeyPreviewOpen, setJourneyPreviewOpen] = useState(false)
  const [marketComparison, setMarketComparison] = useState<JourneyMarketCmp>(() =>
    generateMarketComparison(location as LocationData, refine)
  )
  const durationToDays: Record<string, number> = {
    WEEKEND: 2,
    SHORT: 4,
    WEEK: 8,
    TWO_WEEKS: 14,
    OPEN: 21,
  }
  const durationToRange: Record<string, string> = {
    WEEKEND: '1-3',
    SHORT: '3-5',
    WEEK: '7-10',
    TWO_WEEKS: '14',
    OPEN: 'open',
  }
  const tripDurationDays = refine.duration
    ? (durationToDays[refine.duration] ?? 8)
    : Math.min(Math.max(location.optimalDurationDays ?? 5, 2), 14)
  const tripDurationRange = refine.duration ? (durationToRange[refine.duration] ?? '7-10') : '7-10'
  /** Live day count for panel + chat context; honors explicit duration requests from advisor chat. */
  const effectiveTripDays =
    advisorDurationOverride ??
    (itinerary.length > 0 ? itinerary.length : tripDurationDays)

  useEffect(() => {
    itineraryRef.current = itinerary
  }, [itinerary])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const applyAdvisorSession = useCallback((session: JourneyAdvisorSession) => {
    setMessages(session.messages)
    setItinerary(session.itinerary as ItineraryDay[])
    setItineraryMotionKey((k) => k + 1)
    setAdvisorDurationOverride(session.advisorDurationOverride)
    setTripSummary(session.tripSummary)
    setIsGeneratingJourney(false)
  }, [])

  const persistAdvisorState = useCallback(() => {
    if (typeof window === 'undefined') return
    if (itinerary.length === 0) return

    const targetDays = advisorDurationOverride ?? itinerary.length
    let persistedItinerary = itinerary
    if (targetDays > 0 && itinerary.length !== targetDays) {
      persistedItinerary = attachPdfLinksToItinerary(
        enforceItineraryDayCount(itinerary, targetDays, {
          activityLabel: location.activity,
          cityName: location.name,
        }),
        location,
        refine
      )
    }

    saveJourneyAdvisorSession(resolvedDestinationGearId, generationNonce ?? 0, {
      messages,
      itinerary: persistedItinerary,
      tripSummary,
      advisorDurationOverride,
    })
  }, [
    itinerary,
    messages,
    tripSummary,
    advisorDurationOverride,
    resolvedDestinationGearId,
    generationNonce,
    location,
    refine,
  ])

  /** Keep itinerary day count aligned with explicit user requests (e.g. 4 → 6 days). */
  useEffect(() => {
    if (!advisorDurationOverride || advisorDurationOverride <= 0) return
    if (isGeneratingJourney) return
    setItinerary((prev) => {
      if (prev.length === 0 || prev.length === advisorDurationOverride) return prev
      return attachPdfLinksToItinerary(
        enforceItineraryDayCount(prev, advisorDurationOverride, {
          activityLabel: location.activity,
          cityName: location.name,
        }),
        location,
        refine
      )
    })
  }, [
    advisorDurationOverride,
    isGeneratingJourney,
    location.activity,
    location.name,
    location,
    refine,
  ])

  const reconcileDurationOverride = useCallback((itineraryLength: number, targetDays: number) => {
    if (targetDays <= 0) return
    setAdvisorDurationOverride(itineraryLength === targetDays ? null : targetDays)
  }, [])

  const buildSaveSnapshot = useCallback((): SavedJourneyAdvisorSnapshot => {
    let snapshotItinerary = itinerary
    if (effectiveTripDays > 0 && itinerary.length > 0 && itinerary.length !== effectiveTripDays) {
      snapshotItinerary = attachPdfLinksToItinerary(
        enforceItineraryDayCount(itinerary, effectiveTripDays, {
          activityLabel: location.activity,
          cityName: location.name,
        }),
        location,
        refine
      )
    }
    return {
      generationNonce: generationNonce ?? 0,
      durationDays: effectiveTripDays,
      messages,
      itinerary: snapshotItinerary,
      tripSummary,
      advisorDurationOverride:
        snapshotItinerary.length === effectiveTripDays ? null : effectiveTripDays,
    }
  }, [
    itinerary,
    effectiveTripDays,
    location,
    refine,
    generationNonce,
    messages,
    tripSummary,
  ])

  const resolvedTravelIntent = useMemo<TravelIntent>(
    () => readBrowserTravelIntent() ?? tripRoleToTravelIntent(refine.tripRole) ?? 'practice',
    [refine.tripRole]
  )

  const raceLike = useMemo(
    () =>
      /\b(marathon|half\s*marathon|ultra|triathlon|duathlon|gran fondo|sportive|\brace\b)\b/i.test(
        location.activity
      ),
    [location.activity]
  )

  const advisorInitialUserContent = useMemo(() => {
    const intentLine = `travelIntent: ${resolvedTravelIntent} (practice = casual active travel; competing = racer ops bib-to-finish; watching = non-participant at the event — pro fan/spectacle OR crewing someone racing; same playbook for both: event destinations, timeline-structured days, vantage & cheer hops, waits between checkpoints, lodging near start/finish, moving between checkpoints — never pin this traveller as an entrant). `
    const raceDayRules =
      ' One full calendar day must read as RACE DAY (from the start area through the finish line and recovery). Do not title that day as only "Final session & departure" or lead with "race route preview" — course previews belong the day before the race. For a 2-day trip: Day 1 = arrival + bib/expo + light shakeout; Day 2 = full race day then recovery; schedule departure/flights only after recovery (e.g. evening), not as the main "race morning" narrative.'
    const watchingUnifiedGuidance =
      ' The user attends as a non-participant — watching professional athletes or supporting someone competing; treat identically: recommend destinations where events happen; anchor the itinerary on the official event timeline; include cheer/viewpoint logistics and waiting-period activities between checkpoints; prefer accommodation near realistic start/finish access; spell out how to move between event checkpoints. NEVER assign racer bib drills, taper, or entrant-only prep.'
    const plainLanguageItinerary =
      ' Write itinerary activities in plain language any traveler understands. Avoid specialist race jargon unless you add a short plain explanation in parentheses. Prefer: "anti-chafe preparation" or "body glide" (not "nipple glide"); "walk to your start zone" or "getting to your start group" (not "corral transit"); "old clothes to discard at the start" (not "throwaway layers"); "pre-race toilet stops" if needed (not "bathroom passes"); "short accelerations to warm up" for strides; "easing training before race day" for taper. If you must use a technical term, follow it with a plain phrase in parentheses. Goal: a first-time marathon traveler understands every line without Googling.'
    if (refine.tripRole === 'COMPETITOR') {
      return `${intentLine}Generate the initial journey plan now. Trip role: COMPETITOR (race/event participation week). Return a complete ${tripDurationDays}-day itinerary: expo, carb-loading, pre-race sleep, getting to your start group, and recovery. Day 01 lodging MUST include sportReason (sport-specific: packet pickup proximity, quiet sleep, course access).${raceDayRules}${plainLanguageItinerary}`
    }
    if (refine.tripRole === 'WATCHING') {
      return `${intentLine}Generate the initial journey plan now. Trip role: WATCHING (non-participant).${watchingUnifiedGuidance} Tone: practical event logistics plus atmosphere — ticketing/fan belts when purely spectating; reunion pins and purposeful solo gaps when crewing.${plainLanguageItinerary}`
    }
    const activeBase = `${intentLine}Generate the initial journey plan now. Trip role: ACTIVE_TRAVEL (general sport-focused trip — not necessarily a race week unless the destination clearly demands it). Return a complete ${tripDurationDays}-day itinerary for ${location.activity} in ${location.name}: training access, local ops, recovery. Day 01 lodging MUST include sportReason tied to the sport (trailhead/launch/lift proximity, kit storage, recovery — not a generic tourist blurb).${plainLanguageItinerary}`
    if (raceLike && resolvedTravelIntent !== 'practice') {
      return `${activeBase}${raceDayRules} The activity is a major road race — treat one full day as the actual race, not a casual preview on departure day.`
    }
    return activeBase
  }, [refine.tripRole, tripDurationDays, raceLike, location.activity, location.name, resolvedTravelIntent])

  const locationRefineResetKey = `${location.name}|${location.country}|${refine.skillLevel}|${refine.budgetRange}|${refine.tripFocus}`
  const prevLocationRefineResetKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (prevLocationRefineResetKeyRef.current === null) {
      prevLocationRefineResetKeyRef.current = locationRefineResetKey
      return
    }
    if (prevLocationRefineResetKeyRef.current === locationRefineResetKey) return
    prevLocationRefineResetKeyRef.current = locationRefineResetKey
    clearJourneyAdvisorSession(resolvedDestinationGearId)
    setItinerary([])
    setTripSummary(null)
    setAdvisorDurationOverride(null)
    setMessages([])
    setMarketComparison(generateMarketComparison(location as LocationData, refine))
    setAdvisorBootstrapKey((k) => k + 1)
  }, [locationRefineResetKey, resolvedDestinationGearId, location, refine])

  useEffect(() => {
    if (advisorBootstrapKey === 0) return
    clearJourneyAdvisorSession(resolvedDestinationGearId)
  }, [advisorBootstrapKey, resolvedDestinationGearId])

  useEffect(() => {
    persistAdvisorState()
  }, [persistAdvisorState])

  const journeyPdfFileName = useMemo(
    () =>
      buildJourneyPdfFileName({
        durationDays: effectiveTripDays,
        locationName: location.name,
        activity: location.activity,
      }),
    [effectiveTripDays, location.name, location.activity]
  )

  const seedIntelHub = useMemo(() => buildSeedIntelligenceHub(location, refine), [location, refine])
  const [aiIntelHub, setAiIntelHub] = useState<IntelligenceHubSnapshot>(() => emptyIntelHub())
  const [userIntelHub, setUserIntelHub] = useState<IntelligenceHubSnapshot>(() => emptyIntelHub())
  const userIntelStorageKey = useMemo(
    () => `playce-user-intelhub:${location.name}:${location.country}`,
    [location.name, location.country]
  )

  useEffect(() => {
    setAiIntelHub(emptyIntelHub())
    try {
      const raw = localStorage.getItem(userIntelStorageKey)
      if (!raw) {
        setUserIntelHub(emptyIntelHub())
      } else {
        const parsed = JSON.parse(raw) as IntelligenceHubSnapshot
        setUserIntelHub(parsed ?? emptyIntelHub())
      }
    } catch {
      setUserIntelHub(emptyIntelHub())
    }
  }, [location.name, location.country, refine.budgetRange, userIntelStorageKey])

  useEffect(() => {
    try {
      localStorage.setItem(userIntelStorageKey, JSON.stringify(userIntelHub))
    } catch {
      // ignore storage failures
    }
  }, [userIntelHub, userIntelStorageKey])

  const mergedIntelHub = useMemo(
    () => mergeIntelLayers(seedIntelHub, aiIntelHub, userIntelHub),
    [seedIntelHub, aiIntelHub, userIntelHub]
  )

  const journeyPdfContent = useMemo(
    () =>
      buildJourneyBriefingPdfContent({
        location,
        refine: {
          budgetRange: refine.budgetRange,
          skillLevel: refine.skillLevel,
          durationDays: effectiveTripDays,
          tripRole: refine.tripRole ?? undefined,
        },
        tripSummary,
        itinerary,
        gearItems,
        mergedHub: mergedIntelHub,
        travelPurpose: resolvedTravelIntent,
      }),
    [
      location,
      refine.budgetRange,
      refine.skillLevel,
      refine.tripRole,
      effectiveTripDays,
      tripSummary,
      itinerary,
      gearItems,
      mergedIntelHub,
      resolvedTravelIntent,
    ]
  )

  /** Last CHAT_HISTORY_LIMIT UI turns fed to /api/chat (formatted via formatChatHistory on send). */
  const aiAdvisorTurns = useMemo(
    () => messages.filter((m) => !m.unavailable).slice(-CHAT_HISTORY_LIMIT),
    [messages]
  )

  const [linkDrafts, setLinkDrafts] = useState({
    experience: { label: '', url: '' },
    stay: { label: '', url: '' },
    dine: { label: '', url: '' },
  })

  useEffect(() => {
    const timer = setTimeout(() => setContentVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(SPLIT_STORAGE_KEY, String(advisorSplit))
    } catch {
      // ignore storage errors
    }
  }, [advisorSplit])

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!isResizingSplit) return
    const onMouseMove = (event: MouseEvent) => {
      const el = splitContainerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const rawPct = ((event.clientX - rect.left) / rect.width) * 100
      const minPct = (280 / rect.width) * 100
      const maxPct = Math.min(52, (480 / rect.width) * 100)
      const clamped = Math.max(minPct, Math.min(maxPct, rawPct))
      setAdvisorSplit(clamped)
    }
    const onMouseUp = () => setIsResizingSplit(false)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isResizingSplit])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isAdvisorThinking, initialAdvisorUnreachable, isGeneratingJourney])

  useEffect(() => {
    const ac = new AbortController()
    const signal = ac.signal
    const destId = resolvedDestinationGearId
    const nonce = generationNonce ?? 0

    const cached = loadJourneyAdvisorSession(destId, nonce)
    if (cached?.itinerary?.length) {
      if (itineraryRef.current.length === 0) {
        applyAdvisorSession(cached)
      } else {
        setIsGeneratingJourney(false)
      }
      return () => ac.abort()
    }

    if (
      itineraryRef.current.length > 0 ||
      messagesRef.current.some((m) => m.role === 'user')
    ) {
      setIsGeneratingJourney(false)
      return () => ac.abort()
    }

    const loadJourney = async () => {
      setIsGeneratingJourney(true)
      setInitialAdvisorUnreachable(false)
      setMessages((prev) => {
        if (prev.some((m) => m.role === 'user')) return prev
        return [
          {
            role: 'ai',
            content: getOpeningMessage(location as LocationData, resolvedTravelIntent, tripDurationDays),
            clientStaticOpener: true,
          },
        ]
      })

      const applyFailure = () => {
        const fallback = attachPdfLinksToItinerary(
          buildLocalFallbackItinerary(tripDurationDays, location, refine),
          location,
          refine
        )
        setItinerary(fallback)
        setItineraryMotionKey((k) => k + 1)
        setInitialAdvisorUnreachable(true)
      }

      for (let attempt = 0; attempt < ADVISOR_FETCH_RETRIES; attempt++) {
        if (signal.aborted) return
        if (attempt > 0) await delayMs(650 * attempt)
        try {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
              messages: [
                {
                  role: 'user',
                  content: advisorInitialUserContent,
                },
              ],
              context: {
                location: {
                  name: location.name,
                  country: location.country,
                  activity: location.activity,
                  season: location.season,
                  difficulty: location.difficulty,
                  vibe: location.vibe,
                },
                refine: {
                  budgetRange: refine.budgetRange,
                  skillLevel: refine.skillLevel,
                  tripFocus: refine.tripFocus,
                  durationDays: tripDurationDays,
                  durationRange: tripDurationRange,
                  tripRole: refine.tripRole,
                },
                travelIntent: resolvedTravelIntent,
                itinerary: [],
              },
            }),
          })

          if (signal.aborted) return

          const payload = (await res.json()) as {
            message?: string
            panelUpdate?: PanelUpdate | null
            error?: string
          }

          const retryable = res.status === 429 || res.status >= 500
          if (!res.ok) {
            if (retryable && attempt < ADVISOR_FETCH_RETRIES - 1) continue
            applyFailure()
            break
          }

          const pu = payload.panelUpdate
          let resolvedItinerary: ItineraryDay[]

          const generated = pu?.itinerary
          if (Array.isArray(generated) && generated.length > 0) {
            resolvedItinerary = attachPdfLinksToItinerary(generated as ItineraryDay[], location, refine)
            setItineraryMotionKey((k) => k + 1)
          } else {
            resolvedItinerary = attachPdfLinksToItinerary(
              buildLocalFallbackItinerary(tripDurationDays, location, refine),
              location,
              refine
            )
            setItineraryMotionKey((k) => k + 1)
          }
          setItinerary(resolvedItinerary)

          if (pu?.tripSummary) {
            const s = pu.tripSummary
            setTripSummary({
              totalBudget: s.totalBudget ?? '',
              bestFor: s.bestFor ?? '',
              topSpots: Array.isArray(s.topSpots) ? s.topSpots.slice(0, 3) : [],
            })
          }

          if (signal.aborted) return
          setInitialAdvisorUnreachable(false)
          break
        } catch (e) {
          if (signal.aborted) return
          if (attempt < ADVISOR_FETCH_RETRIES - 1) continue
          applyFailure()
        }
      }

      if (!signal.aborted) {
        setIsGeneratingJourney(false)
      }
    }

    void loadJourney()
    return () => ac.abort()
  }, [
    applyAdvisorSession,
    advisorBootstrapKey,
    generationNonce,
    resolvedDestinationGearId,
    location.name,
    location.country,
    location.activity,
    location.season,
    location.difficulty,
    location.vibe,
    tripDurationDays,
    tripDurationRange,
    refine.budgetRange,
    refine.skillLevel,
    refine.tripFocus,
    refine.tripRole,
    advisorInitialUserContent,
    resolvedTravelIntent,
  ])

  const handleSendMessage = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed || isAdvisorThinking) return

    const urls = extractUrls(trimmed)
    if (urls.length) {
      setUserIntelHub((prev) => concatIntel(prev, urlsToIntelHub(urls)))
    }

    const userMessage: ChatMessage = { role: 'user', content: trimmed }
    const transcript = [...aiAdvisorTurns, userMessage].slice(-CHAT_HISTORY_LIMIT)
    const requestedDays = parseRequestedTripDays(trimmed)
    const contextDurationDays = requestedDays ?? effectiveTripDays

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsAdvisorThinking(true)
    if (requestedDays != null && requestedDays > 0) {
      setAdvisorDurationOverride(requestedDays)
      setItinerary((prev) => {
        if (prev.length === 0 || prev.length === requestedDays) return prev
        const next = attachPdfLinksToItinerary(
          enforceItineraryDayCount(prev, requestedDays, {
            activityLabel: location.activity,
            cityName: location.name,
          }),
          location,
          refine
        )
        itineraryRef.current = next
        return next
      })
      setItineraryMotionKey((k) => k + 1)
    }

    const sendOnce = async () => {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: formatChatHistory(transcript),
          context: {
            location: {
              name: location.name,
              country: location.country,
              activity: location.activity,
              season: location.season,
              difficulty: location.difficulty,
              vibe: location.vibe,
            },
            refine: {
              budgetRange: refine.budgetRange,
              skillLevel: refine.skillLevel,
              tripFocus: refine.tripFocus,
              durationDays: contextDurationDays,
              durationRange: tripDurationRange,
              tripRole: refine.tripRole,
            },
            travelIntent: resolvedTravelIntent,
            itinerary: itineraryRef.current,
          },
        }),
      })
      const payload = (await res.json()) as {
        message?: string
        panelUpdate?: PanelUpdate | null
        error?: string
      }
      return { res, payload, contextDurationDays }
    }

    try {
      for (let attempt = 0; attempt < ADVISOR_FETCH_RETRIES; attempt++) {
        if (attempt > 0) await delayMs(500 * attempt)
        try {
          const { res, payload, contextDurationDays } = await sendOnce()
          const retryable = res.status === 429 || res.status >= 500
          if (!res.ok) {
            if (retryable && attempt < ADVISOR_FETCH_RETRIES - 1) continue
            setInitialAdvisorUnreachable(true)
            return
          }

          const assistantText = typeof payload.message === 'string' ? payload.message : ''
          if (!assistantText.trim()) {
            setMessages((prev) => [
              ...prev,
              { role: 'ai', content: 'No reply text returned — try rephrasing your request.' },
            ])
            return
          }

          setInitialAdvisorUnreachable(false)
          setMessages((prev) => [...prev, { role: 'ai', content: assistantText.trim() }])

          const pu = payload.panelUpdate
          const targetDays = resolveTargetTripDays(
            [trimmed, assistantText],
            contextDurationDays
          )
          let itineraryUpdated = false

          const applyItinerary = (rawDays: ItineraryDay[]) => {
            let nextItinerary = attachPdfLinksToItinerary(rawDays, location, refine)
            if (targetDays > 0 && nextItinerary.length !== targetDays) {
              nextItinerary = attachPdfLinksToItinerary(
                enforceItineraryDayCount(nextItinerary, targetDays, {
                  activityLabel: location.activity,
                  cityName: location.name,
                }),
                location,
                refine
              )
            }
            setItinerary(nextItinerary)
            setItineraryMotionKey((k) => k + 1)
            reconcileDurationOverride(nextItinerary.length, targetDays)
            itineraryUpdated = true
            return nextItinerary
          }

          if (pu && typeof pu === 'object') {
            if (pu.tripSummary) {
              const s = pu.tripSummary
              setTripSummary({
                totalBudget: s.totalBudget ?? '',
                bestFor: s.bestFor ?? '',
                topSpots: Array.isArray(s.topSpots) ? s.topSpots.slice(0, 3) : [],
              })
            }
            if (pu.itinerary?.length) {
              applyItinerary(pu.itinerary as ItineraryDay[])
            }
            const ih = pu.intelligenceHub
            if (
              ih &&
              ((ih.experience?.length ?? 0) > 0 ||
                (ih.stay?.length ?? 0) > 0 ||
                (ih.dine?.length ?? 0) > 0)
            ) {
              setAiIntelHub((prev) => concatIntel(prev, hubPatchToDelta(ih)))
            }
            if (pu.marketComparison) {
              const mcPatch = pu.marketComparison
              setMarketComparison((prev) => mergeMarketComparison(prev, mcPatch))
            }
          }

          if (!itineraryUpdated && targetDays > 0) {
            setItinerary((prev) => {
              if (prev.length === 0) {
                reconcileDurationOverride(0, targetDays)
                return prev
              }
              if (prev.length === targetDays) {
                reconcileDurationOverride(targetDays, targetDays)
                return prev
              }
              const next = attachPdfLinksToItinerary(
                enforceItineraryDayCount(prev, targetDays, {
                  activityLabel: location.activity,
                  cityName: location.name,
                }),
                location,
                refine
              )
              reconcileDurationOverride(next.length, targetDays)
              return next
            })
            setItineraryMotionKey((k) => k + 1)
            itineraryUpdated = true
          }

          return
        } catch {
          if (attempt < ADVISOR_FETCH_RETRIES - 1) continue
          setInitialAdvisorUnreachable(true)
        }
      }
    } finally {
      setIsAdvisorThinking(false)
    }
  }

  const addManualLink = useCallback((category: HubCategory) => {
    setLinkDrafts((d) => {
      const draft = d[category]
      const label = draft.label.trim()
      let url = draft.url.trim()
      if (!label || !url) return d

      let href = url
      if (!/^https?:\/\//i.test(href)) href = `https://${href}`

      setUserIntelHub((prev) =>
        concatIntel(prev, {
          ...emptyIntelHub(),
          [category]: [{ id: `manual-${category}-${Date.now()}`, label, href }],
        })
      )

      return { ...d, [category]: { label: '', url: '' } }
    })
  }, [])

  const updateManualLink = useCallback(
    (category: HubCategory, id: string, next: { label: string; href: string }) => {
      const label = next.label.trim()
      let href = next.href.trim()
      if (!label || !href) return
      if (!/^https?:\/\//i.test(href)) href = `https://${href}`
      setUserIntelHub((prev) => ({
        ...prev,
        [category]: prev[category].map((link) => (link.id === id ? { ...link, label, href } : link)),
      }))
    },
    []
  )

  const deleteManualLink = useCallback((category: HubCategory, id: string) => {
    setUserIntelHub((prev) => ({
      ...prev,
      [category]: prev[category].filter((link) => link.id !== id),
    }))
  }, [])

  const itineraryDetailStyle = {
    fontFamily: fontBody,
    fontSize: '16px',
    lineHeight: 1.6,
  } as const

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
      <PlayceTopNav
        onBack={onBack}
        onOpenSavedJourneys={onOpenSavedJourneys}
        onOpenSavedDestinations={onOpenSavedDestinations}
        savedJourneyCount={savedJourneyCount}
        savedDestinationCount={savedDestinationCount}
      />

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        style={{ paddingTop: 52, gridTemplateRows: '1fr auto', display: 'grid' }}
      >
      <div
        ref={splitContainerRef}
        className="flex min-h-0 w-full flex-col overflow-hidden lg:flex-row lg:items-stretch"
        style={{
          opacity: contentVisible ? 1 : 0,
          transition: 'opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Left: AI chat + composer (column layout — composer not fixed) */}
        <div
          className="relative flex min-h-[42vh] w-full shrink-0 flex-col lg:h-full lg:min-h-0 lg:max-h-none lg:w-auto"
          style={{
            width: isDesktop ? `clamp(280px, ${advisorSplit}%, 480px)` : '100%',
            background: 'var(--bg-secondary)',
            borderRight: isDesktop ? '1px solid var(--border)' : undefined,
            borderBottom: isDesktop ? undefined : '1px solid var(--border)',
          }}
        >
          <div
            className="shrink-0 px-6 py-4"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <p className="text-[10px] text-emerald-400/90 tracking-[0.06em] mb-1" style={{ fontFamily: fontBody }}>
              Active mode
            </p>
            <h2 className="text-sm text-zinc-300 uppercase tracking-[0.12em]" style={{ fontFamily: fontBody, fontWeight: 600 }}>
              AI Advisor
            </h2>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-4 md:px-6 md:py-5 space-y-4">
            {messages
              .filter((m) => m.content !== FRIENDLY_ADVISOR_ERROR)
              .map((message, index) => {
              const isErrorBubble = false
              const staticOpener = message.role === 'ai' && message.clientStaticOpener
              return (
              <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[92%] md:max-w-[88%]`}
                  style={{
                    borderRadius: staticOpener ? 2 : 5,
                    border: staticOpener
                      ? '1px solid var(--border)'
                      : isErrorBubble
                        ? '1px solid rgba(255,80,80,0.2)'
                        : message.role === 'ai'
                          ? '0.5px solid rgba(255,255,255,0.12)'
                          : '0.5px solid rgba(255,255,255,0.35)',
                    background: staticOpener
                      ? 'var(--bg)'
                      : isErrorBubble
                      ? 'rgba(255,0,0,0.06)'
                      : message.role === 'user'
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(255,255,255,0.03)',
                    padding: isErrorBubble ? '12px 16px' : '14px 16px',
                    marginBottom: staticOpener ? 12 : undefined,
                  }}
                >
                  {message.role === 'ai' && !isErrorBubble && !staticOpener && (
                    <p
                      className="text-[10px] tracking-[0.06em] mb-2"
                      style={{ fontFamily: fontBody, fontWeight: 600, color: 'var(--text-muted)' }}
                    >
                      Playce AI
                    </p>
                  )}
                  <p
                    className="leading-relaxed"
                    style={{
                      ...itineraryDetailStyle,
                      fontSize: staticOpener ? '13px' : isErrorBubble ? '12px' : '15px',
                      lineHeight: staticOpener ? 1.6 : itineraryDetailStyle.lineHeight,
                      color: staticOpener
                        ? 'var(--text-secondary, #d4d4d8)'
                        : isErrorBubble
                          ? 'rgba(255,150,150,0.7)'
                          : 'rgba(228,228,231,0.9)',
                    }}
                  >
                    {message.content}
                  </p>
                  {isErrorBubble ? (
                    <button
                      type="button"
                      onClick={() => setAdvisorBootstrapKey((k) => k + 1)}
                      className="mt-3 cursor-pointer border-0 text-left"
                      style={{
                        fontFamily: fontBody,
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#E8A86A',
                        background: 'transparent',
                        padding: 0,
                      }}
                    >
                      Try again →
                    </button>
                  ) : null}
                </div>
              </div>
            )})}
            {isAdvisorThinking || isGeneratingJourney ? (
              <div className="flex justify-start">
                <div
                  className="max-w-[92%] md:max-w-[88%]"
                  style={{
                    borderRadius: '5px',
                    border: '0.5px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.03)',
                    padding: '14px 16px',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400/35 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500/80" />
                    </span>
                    <p
                      className="text-[11px] text-zinc-500 tracking-[0.04em]"
                      style={{ fontFamily: fontBody, fontWeight: 600 }}
                    >
                      {isGeneratingJourney ? 'Generating journey...' : 'Thinking...'}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            {initialAdvisorUnreachable ? (
              <div className="flex flex-col items-start gap-2">
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    fontFamily: fontBody,
                    marginTop: 0,
                    maxWidth: '92%',
                  }}
                >
                  {CHAT_UNAVAILABLE_MSG}
                </p>
                <button
                  type="button"
                  onClick={() => setAdvisorBootstrapKey((k) => k + 1)}
                  className="cursor-pointer border-0 bg-transparent p-0 text-left"
                  style={{
                    fontFamily: fontBody,
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#E8A86A',
                  }}
                >
                  Try again →
                </button>
              </div>
            ) : null}
            <div ref={chatEndRef} />
          </div>

          <div
            className="shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-3 md:px-6"
            style={{
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
            }}
          >
            <div className="flex flex-col gap-3 rounded-md bg-transparent overflow-hidden" style={{ border: '0.5px solid rgba(255,255,255,1)' }}>
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (isAdvisorThinking) return
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleSendMessage()
                  }
                }}
                placeholder="Paste links, refine priorities, or drop intel…"
                rows={3}
                disabled={isAdvisorThinking}
                className="w-full bg-transparent text-zinc-200 placeholder:text-zinc-600 outline-none resize-none px-4 py-3 min-h-[72px] rounded-none disabled:opacity-45"
                style={{ fontFamily: fontBody, fontSize: '15px', lineHeight: 1.5 }}
                aria-label="Refine your journey"
              />
              <div className="flex justify-end gap-3 px-4 pb-3 pt-3 rounded-none" style={{ borderTop: '0.5px solid rgba(255,255,255,0.12)' }}>
                <button
                  type="button"
                  onClick={() => void handleSendMessage()}
                  disabled={isAdvisorThinking}
                  className="playce-btn border-0 inline-flex items-center disabled:opacity-40"
                  style={playceSecondaryCtaStyle}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          className="hidden lg:block shrink-0"
          onMouseDown={() => setIsResizingSplit(true)}
          style={{
            width: 4,
            background: 'rgba(255,255,255,0.06)',
            cursor: 'col-resize',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
          }}
          onMouseLeave={(e) => {
            if (!isResizingSplit) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
          }}
        />

        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:h-full"
          style={{ background: 'var(--bg)' }}
        >
          <JourneyMissionBriefingPanel
            variant="embedded"
            location={location}
            travelPurpose={resolvedTravelIntent}
            refine={{
              budgetRange: refine.budgetRange,
              skillLevel: refine.skillLevel,
              durationDays: effectiveTripDays,
              tripRole: refine.tripRole ?? undefined,
            }}
            tripSummary={tripSummary}
            itinerary={itinerary}
            itineraryMotionKey={itineraryMotionKey}
            itineraryLoading={isGeneratingJourney}
            itineraryAlwaysExpanded
            embeddedTripPlanScrollRef={tripPlanScrollRef}
            gearItems={gearItems}
            onToggleGearChecked={toggleGearChecked}
            onSetGearItemAction={setGearItemAction}
            onRemoveGearItem={removeGearItem}
            onAddGearItem={addGearItem}
            mergedHub={mergedIntelHub}
            linkDrafts={linkDrafts}
            setLinkDrafts={setLinkDrafts}
            addManualLink={addManualLink}
            updateManualLink={updateManualLink}
            deleteManualLink={deleteManualLink}
          />
        </div>
      </div>

      {journeyPreviewOpen ? (
        <div
          className="fixed inset-0 z-[200] flex flex-col"
          style={{ background: 'var(--bg)' }}
          role="dialog"
          aria-modal="true"
          aria-label="Your journey preview"
        >
          <div className="shrink-0 flex justify-between items-center gap-4 px-6 py-4 border-b border-white/10" style={{ background: 'var(--bg)' }}>
            <p className="text-[10px] tracking-[0.06em]" style={{ fontFamily: fontBody, color: 'var(--text-secondary)' }}>
              Mission briefing · Final preview
            </p>
            <button type="button" className="playce-btn px-6 py-3" onClick={() => setJourneyPreviewOpen(false)}>
              Close
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <JourneyMissionBriefingPanel
              variant="overlay"
              location={location}
              travelPurpose={resolvedTravelIntent}
              refine={{
                budgetRange: refine.budgetRange,
                skillLevel: refine.skillLevel,
                durationDays: effectiveTripDays,
                tripRole: refine.tripRole ?? undefined,
              }}
              tripSummary={tripSummary}
              itinerary={itinerary}
              itineraryMotionKey={itineraryMotionKey}
              itineraryLoading={isGeneratingJourney}
              itineraryAlwaysExpanded
              gearItems={gearItems}
              onToggleGearChecked={toggleGearChecked}
              onSetGearItemAction={setGearItemAction}
              onRemoveGearItem={removeGearItem}
              onAddGearItem={addGearItem}
              mergedHub={mergedIntelHub}
              linkDrafts={linkDrafts}
              setLinkDrafts={setLinkDrafts}
              addManualLink={addManualLink}
              updateManualLink={updateManualLink}
              deleteManualLink={deleteManualLink}
            />
          </div>
        </div>
      ) : null}

      <div
        className="z-10 shrink-0 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] md:px-10 md:py-5 flex flex-wrap items-center justify-between gap-4"
        style={{
          background: 'color-mix(in oklab, var(--bg) 85%, transparent)',
          borderTop: '0.5px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <button
          type="button"
          onClick={() => onSave(buildSaveSnapshot())}
          className="playce-btn border-0 inline-flex items-center"
          style={playceSecondaryCtaStyle}
          title="Adds this plan to Saved journeys on the home screen"
        >
          Save this journey
        </button>
        <div className="flex flex-wrap items-center gap-3 justify-end">
          <button
            type="button"
            onClick={() => setJourneyPreviewOpen(true)}
            className="inline-flex cursor-pointer items-center border-0 hover:opacity-95"
            style={playcePrimaryCtaStyle}
          >
            View your journey
          </button>
          <PDFDownloadLink
            document={<JourneyPdfDocument content={journeyPdfContent} />}
            fileName={journeyPdfFileName}
            className="playce-btn inline-flex items-center justify-center no-underline border-0"
            style={{
              ...playceSecondaryCtaStyle,
              color: '#d4d4d8',
              textDecoration: 'none',
            }}
          >
            {({ loading }) => (loading ? 'Preparing...' : 'Export PDF journey')}
          </PDFDownloadLink>
        </div>
      </div>
      </div>
    </div>
  )
}
