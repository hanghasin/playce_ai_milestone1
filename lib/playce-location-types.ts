/** Canonical destination payload across Match → Journey (Matrix / Refine legacy alignment). */

/** Structured local transport guidance (intent API + Journey “Getting around”). */
export type LocalTransportMode = 'rideshare' | 'public' | 'rental' | 'walking' | 'ferry'

export interface LocalTransportDetail {
  name: string
  type: LocalTransportMode
  description: string
  appStore: string
  cost: string
}

export interface MatrixLocationData {
  recommendationKind?: 'destination' | 'activity' | 'spot'
  hasExplicitActivity?: boolean
  primaryTitle?: string
  locationLabel?: string
  transportOptions?: {
    name: string
    description: string
    type: 'PUBLIC' | 'APP' | 'RENTAL' | 'WALKING'
  }[]
  diningDistricts?: {
    area: string
    description: string
  }[]
  activityZones?: string
  about?: string
  name: string
  country: string
  activity: string
  season: string
  difficulty: string
  vibe: string
  image: string
  photographerName?: string
  photographerLink?: string
  imageSearchTerm?: string
  womenFriendly: number
  soloIndex: number
  nightSafety?: number
  harassmentRisk?: number
  communityDensity?: number
  infrastructureScore?: number
  soloQuotes?: string[]
  logistics: string[]
  nearestAirport?: string
  visaRequirements?: string
  /** Mirrors calibration spending choice — redundant with refine.budgetRange when synced */
  budgetTier?: 'ESSENTIAL' | 'MID-RANGE' | 'LUXE'
  optimalDurationDays?: number
  stayRecommendation?: {
    name: string
    type: string
    nightlyPrice?: string
  }
  /** AI + UI: specific apps, fare media, transit systems — see intent prompt schema. */
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
    date: string // e.g. 'July 2025' or 'Late August'
    description: string // one short sentence
    website: string // official URL if known, else ''
    isRecurring: boolean // true if annual/recurring (AI-estimated dates should be verified)
  }[]
  /** AI rationale shown on recommendation cards (short string or first-line summary when `whyThisSpotLines` exists) */
  whyThisSpot?: string
  /** Confirm page — 3–4 factual GO/NO-GO lines with emoji + optional bold phrase */
  whyThisSpotLines?: { icon: string; text: string; boldPhrase?: string }[]

  /** Confirm page — 2–3 sentence intro (AI). */
  shortDescription?: string
  /** e.g. "Nov–Feb: 25–32°C, humid" */
  typicalWeather?: string
  /** Override daily budget line on Confirm */
  dailyBudget?: string
  /** AI — typical daily spend for Essential tier traveller */
  budgetEssential?: string
  /** AI — typical daily spend Mid-range tier */
  budgetMidrange?: string
  /** AI — typical daily spend Luxe tier */
  budgetLuxe?: string
  /** AI neighbourhood hint for Essential / hostel-transit framing */
  budgetNeighborhood?: string
  midrangeNeighborhood?: string
  luxeNeighborhood?: string
  bestSeason?: string
  /** Explicit tags when AI provides structured vibes */
  vibeTags?: string[]
  /** Results card subtitle — factual 3–6 word physical cue for this activity */
  activityDescriptor?: string
  /** When true, surface “Solo-safe” pill (soloIndex ≥ 75) */
  soloSafe?: boolean
  tripRhythm?: {
    morning: string
    afternoon: string
    evening: string
    night: string
  }
}
