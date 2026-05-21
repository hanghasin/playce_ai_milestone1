import { z } from 'zod'
import type { MatrixLocationData } from '@/lib/playce-location-types'
import { legacyTransportOptionsFromStructured, mergeLocalTransportForLocation } from '@/lib/playce-local-transport'
import { coerceActivityZonesToString } from '@/lib/playce-confirm-helpers'

export const intentRawLocationSchema = z.object({
  recommendationKind: z.enum(['destination', 'activity', 'spot']).optional(),
  hasExplicitActivity: z.boolean().optional(),
  primaryTitle: z.string().optional(),
  locationLabel: z.string().optional(),
  name: z.string().min(1),
  country: z.string().min(1),
  activity: z.string().min(1),
  whyThisSpot: z
    .union([
      z.array(
        z.object({
          icon: z.string(),
          text: z.string(),
          boldPhrase: z.string().optional(),
        })
      ),
      z.string(),
    ])
    .optional()
    .catch(undefined),
  description: z.string().optional(),
  image: z.string().optional(),
  imageSearchTerm: z.string().optional(),
  season: z.string().optional(),
  difficulty: z.string().optional(),
  vibe: z
    .union([z.string(), z.array(z.string()).transform((arr) => arr.join(', '))])
    .default(''),
  vibeTags: z.array(z.string()).optional().default([]),
  soloSafe: z.boolean().optional(),
  activityDescriptor: z.string().optional().default(''),
  womenFriendly: z.number().min(0).max(100).default(70),
  soloIndex: z.number().min(0).max(100).default(65),
  nightSafety: z.number().min(0).max(100).default(70),
  harassmentRisk: z.number().min(0).max(100).default(75),
  communityDensity: z.number().min(0).max(100).default(65),
  infrastructureScore: z.number().min(0).max(100).default(80),
  soloQuotes: z.array(z.string()).default([]),
  logistics: z.array(z.string()).optional(),
  nearestAirport: z.string().optional(),
  visaRequirements: z.string().optional(),
  budgetEssential: z.string().optional(),
  budgetMidrange: z.string().optional(),
  budgetLuxe: z.string().optional(),
  budgetNeighborhood: z.string().optional(),
  midrangeNeighborhood: z.string().optional(),
  luxeNeighborhood: z.string().optional(),
  optimalDurationDays: z.number().int().min(2).max(14).optional(),
  stayRecommendation: z
    .object({
      name: z.string(),
      type: z.string(),
      nightlyPrice: z.string().optional(),
    })
    .optional(),
  /** Structured rows per system prompt ({ name, type, description, appStore, cost }) — accepts legacy shapes; normalized in enrich. */
  localTransport: z.array(z.any()).optional().default([]),
  transportOptions: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        type: z.enum(['PUBLIC', 'APP', 'RENTAL', 'WALKING']),
      })
    )
    .optional(),
  diningDistricts: z
    .array(
      z.object({
        area: z.string(),
        description: z.string(),
      })
    )
    .optional(),
  activityZones: z.preprocess((val) => coerceActivityZonesToString(val), z.string()).default(''),
  bestSeason: z.string().optional().default(''),
  typicalWeather: z.string().optional(),
  about: z.string().default(''),
  mustTryExperiences: z
    .array(
      z.union([
        z.object({
          name: z.string(),
          status: z.string().optional(),
          risk: z.string().optional(),
        }),
        z.string().transform((name) => ({ name, status: undefined, risk: undefined })),
      ])
    )
    .default([]),
  facilities: z.array(z.object({ name: z.string(), available: z.boolean() })).optional(),
  conditions: z
    .object({
      temp: z.string(),
      waves: z.string().optional(),
      snow: z.string().optional(),
      visibility: z.string().optional(),
    })
    .optional(),
  upcomingEvents: z
    .array(
      z.object({
        name: z.string().min(1),
        date: z.string().min(1),
        description: z.string().optional().default(''),
        website: z.string().optional().default(''),
        isRecurring: z.boolean().optional().default(false),
      })
    )
    .optional()
    .default([]),
  /** Typical day pacing for this destination + activity (plain language, place-specific). */
  tripRhythm: z
    .object({
      morning: z.string(),
      afternoon: z.string(),
      evening: z.string(),
      night: z.string(),
    })
    .optional(),
})

export const intentRecommendationsResponseSchema = z.object({
  intentSummary: z.string().optional(),
  detectedSkillLevel: z.string().nullable().optional(),
  locations: z.array(intentRawLocationSchema).min(3).max(6),
})

export type IntentRecommendationsResponse = z.infer<typeof intentRecommendationsResponseSchema>


function coerceBudgetLine(raw?: unknown): string | undefined {
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t || /^(none|n\/a|null|nil)$/i.test(t)) return undefined
    return t.slice(0, 140)
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return `$${Math.round(raw)} / day`.slice(0, 140)
  }
  if (raw == null) return undefined
  const t = String(raw).trim()
  if (!t || /^(none|n\/a|null|nil)$/i.test(t)) return undefined
  return t.slice(0, 140)
}

function coerceSmallBudgetLine(raw?: string | null, maxLen = 80): string | undefined {
  const t = coerceBudgetLine(raw)
  if (!t) return undefined
  return t.slice(0, maxLen)
}

const TRIP_RHYTHM_BANNED_PHRASES = /taxi roulette|session corridors|junk miles|cell crush|federated/gi

function normalizeTripRhythmFromModel(
  rawRhythm: IntentRecommendationsResponse['locations'][number]['tripRhythm'],
  placeName: string
): MatrixLocationData['tripRhythm'] | undefined {
  if (!rawRhythm) return undefined
  const name = placeName.trim()
  if (!name) return undefined

  const slots = {
    morning: (rawRhythm.morning ?? '').trim(),
    afternoon: (rawRhythm.afternoon ?? '').trim(),
    evening: (rawRhythm.evening ?? '').trim(),
    night: (rawRhythm.night ?? '').trim(),
  }

  for (const text of Object.values(slots)) {
    if (!text || TRIP_RHYTHM_BANNED_PHRASES.test(text)) return undefined
  }

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const nameMatch = new RegExp(escaped, 'i')
  const mentionsPlace = Object.values(slots).some((t) => nameMatch.test(t))
  if (!mentionsPlace) return undefined

  const maxLen = 360
  return {
    morning: slots.morning.slice(0, maxLen),
    afternoon: slots.afternoon.slice(0, maxLen),
    evening: slots.evening.slice(0, maxLen),
    night: slots.night.slice(0, maxLen),
  }
}

function normalizeDifficulty(raw?: string): string {
  const s = raw?.trim() || ''
  const lower = s.toLowerCase()
  if (!s) return 'Intermediate'
  if (/beginner/.test(lower)) return 'Beginner'
  if (/\bpro\b|professional|elite|expert|\badvanced\b/.test(lower)) return 'Pro'
  return 'Intermediate'
}

function deriveVibeTags(raw: IntentRecommendationsResponse['locations'][number]): string[] {
  const vt = raw.vibeTags?.map((t) => t.trim()).filter(Boolean).slice(0, 8) ?? []
  if (vt.length > 0) return [...new Set(vt)]
  return raw.vibe
    .split(/[,|·\/]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3)
}

function whyThisSpotSummary(raw: IntentRecommendationsResponse['locations'][number]): string | undefined {
  const w = raw.whyThisSpot
  if (typeof w === 'string') {
    const t = w.trim()
    return t || undefined
  }
  if (Array.isArray(w)) {
    const parts = w.map((x) => (x?.text ?? '').trim()).filter(Boolean)
    if (parts.length === 0) return undefined
    return parts.join(' ').slice(0, 280)
  }
  return undefined
}

function normalizeWhyThisSpotLines(
  raw: IntentRecommendationsResponse['locations'][number]
): MatrixLocationData['whyThisSpotLines'] {
  const w = raw.whyThisSpot
  if (!Array.isArray(w)) return undefined
  const lines = w
    .map((row) => {
      const icon = (row.icon ?? '').trim().slice(0, 8)
      const text = (row.text ?? '').trim().slice(0, 360)
      const boldPhrase = row.boldPhrase?.trim().slice(0, 140)
      if (!icon || !text) return null
      return { icon, text, boldPhrase: boldPhrase || undefined }
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .slice(0, 4)
  return lines.length >= 4 ? lines : lines.length >= 3 ? lines : undefined
}

function deriveActivityDescriptor(
  raw: IntentRecommendationsResponse['locations'][number],
  trimmedWhy?: string
): string {
  const d = raw.activityDescriptor?.trim()
  if (d) return d
  const spot = trimmedWhy ?? whyThisSpotSummary(raw) ?? ''
  if (spot && spot.length < 140) return spot.split(/(?<=[.!?])\s/)[0]?.trim().slice(0, 72) || spot.slice(0, 72)
  if (spot) return spot.slice(0, 72)
  return `${raw.activity.trim()} access`
}

function normalizeSeason(raw?: string): string {
  const s = raw?.trim() || ''
  if (/^year[\s_-]*round$/i.test(s) || s === 'YEAR-ROUND') return 'Year-round'
  return s || 'Year-round'
}

function normalizeImageUrl(url: string): string {
  const u = url.trim()
  if (/^https?:\/\//i.test(u)) return u
  return `https://${u.replace(/^\/\//, '')}`
}

export function enrichIntentLocation(raw: IntentRecommendationsResponse['locations'][number]): MatrixLocationData {
  const image = raw.image && /^https:\/\/images\.unsplash\.com\//i.test(raw.image.trim())
    ? normalizeImageUrl(raw.image)
    : ''
  const womenFriendly = raw.womenFriendly ?? 82
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))
  const normalizedLegacyTransportOpts = raw.transportOptions?.map((option) => ({
    name: option.name.trim(),
    description: option.description.trim(),
    type: option.type,
  }))
  const mergedLocalTransportRows = mergeLocalTransportForLocation({
    localTransport: raw.localTransport,
    transportOptions: normalizedLegacyTransportOpts,
    name: raw.name.trim(),
    country: raw.country.trim(),
  })
  const transportOptions = legacyTransportOptionsFromStructured(mergedLocalTransportRows)
  const buildActivityZonesFallback = (name: string, activity: string): string => {
    const ctx = `${name} ${activity}`.toLowerCase()
    if (/hong kong/.test(ctx) && /kayak|paddle/.test(ctx)) {
      return 'Most kayak operators are based around Stanley Beach and Sai Kung waterfront, with walk-in rentals widely available during daylight hours.'
    }
    if (/bali/.test(ctx) && /surf/.test(ctx)) {
      return 'Most surf operators cluster around Canggu, Uluwatu, and Seminyak beach fronts, where rentals and lessons are easy to arrange on arrival.'
    }
    if (/samui|koh samui|phuket|thailand/.test(ctx)) {
      return `Most ${activity.toLowerCase()} operators are concentrated near the beachfront strip and ferry-access piers, with flexible same-day bookings common in high season.`
    }
    if (/chamonix|mont blanc/.test(ctx)) {
      return 'Les Grands Montets and Brevent-Flegere are the core mountain zones, with rentals and guide shops concentrated around Avenue Michel Croz and the town-centre lift corridors.'
    }
    if (/tokyo/.test(ctx) && /marathon|run|running/.test(ctx)) {
      return `The Imperial Palace 5km loop is the classic daily circuit; Sumida riverside stretches add flat miles when you want less turning. Train before commuter rush — sidewalks stay calmer early.`
    }
    if (/bali/.test(ctx) && /surf/.test(ctx)) {
      return 'Kuta and Canggu are the main beginner surf beaches, while Uluwatu is the advanced zone; rental boards and schools line the beach roads in each area.'
    }
    return `In ${name}, ${activity.toLowerCase()} sessions are centered around the primary local training grounds and landmark routes used by local clubs and guides.`
  }
  const hasGenericActivityZones = (value?: string) =>
    !!value &&
    /(main waterfront and central activity districts|main waterfront|central activity districts)/i.test(value)
  return {
    recommendationKind: raw.recommendationKind,
    hasExplicitActivity: raw.hasExplicitActivity,
    primaryTitle: raw.primaryTitle?.trim(),
    locationLabel: raw.locationLabel?.trim(),
    transportOptions,
    diningDistricts:
      raw.diningDistricts?.map((item) => ({
        area: item.area.trim(),
        description: item.description.trim(),
      })) ?? undefined,
    activityZones: (() => {
      const z = coerceActivityZonesToString(raw.activityZones).trim()
      return z && !hasGenericActivityZones(z)
        ? z
        : buildActivityZonesFallback(raw.name.trim(), raw.activity.trim())
    })(),
    about: raw.about?.trim() || '',
    name: raw.name.trim(),
    country: raw.country.trim(),
    activity: raw.activity.trim(),
    season: normalizeSeason(raw.season),
    difficulty: normalizeDifficulty(raw.difficulty),
    vibe: raw.vibe?.trim() || 'Explorer-friendly',
    image,
    imageSearchTerm: raw.imageSearchTerm?.trim() || `${raw.name.trim()} ${raw.activity.trim()}`,
    womenFriendly,
    soloIndex: raw.soloIndex ?? 78,
    nightSafety: raw.nightSafety ?? clamp(womenFriendly + 3),
    harassmentRisk: raw.harassmentRisk ?? clamp(womenFriendly - 2),
    communityDensity: raw.communityDensity ?? clamp(womenFriendly - 6),
    infrastructureScore: raw.infrastructureScore ?? clamp(womenFriendly - 1),
    soloQuotes:
      raw.soloQuotes?.map((s) => s.trim()).filter(Boolean).slice(0, 4) ||
      [
        `I felt comfortable walking around ${raw.name.trim()} in the evening with normal precautions.`,
        `${raw.name.trim()} had a visible solo-traveler scene, so meeting people was easy.`,
      ],
    logistics:
      raw.logistics && raw.logistics.length > 0
        ? raw.logistics.map((s) => s.trim()).filter(Boolean)
        : [`${raw.name.trim().toUpperCase()} BASE`, 'TRANSPORT', 'LOCAL OPS'],
    nearestAirport: raw.nearestAirport?.trim(),
    visaRequirements: '',
    budgetEssential: coerceSmallBudgetLine(raw.budgetEssential),
    budgetMidrange: coerceSmallBudgetLine(raw.budgetMidrange),
    budgetLuxe: coerceSmallBudgetLine(raw.budgetLuxe),
    budgetNeighborhood: coerceBudgetLine(raw.budgetNeighborhood),
    midrangeNeighborhood: coerceBudgetLine(raw.midrangeNeighborhood),
    luxeNeighborhood: coerceBudgetLine(raw.luxeNeighborhood),
    optimalDurationDays: raw.optimalDurationDays,
    stayRecommendation: raw.stayRecommendation
      ? {
          name: raw.stayRecommendation.name.trim(),
          type: raw.stayRecommendation.type.trim(),
          nightlyPrice: raw.stayRecommendation.nightlyPrice?.trim(),
        }
      : undefined,
    localTransport: mergedLocalTransportRows,
    mustTryExperiences: raw.mustTryExperiences?.map((e) => ({
      name: e.name.trim(),
      status: e.status?.trim(),
      risk: e.risk?.trim(),
    })),
    facilities:
      raw.facilities && raw.facilities.length > 0
        ? raw.facilities
        : [
            { name: 'Gear / Rentals', available: true },
            { name: 'Dining nearby', available: true },
          ],
    conditions: raw.conditions ?? { temp: '18°C' },
    upcomingEvents: raw.upcomingEvents ?? [],
    whyThisSpotLines: normalizeWhyThisSpotLines(raw),
    whyThisSpot:
      typeof raw.whyThisSpot === 'string'
        ? raw.whyThisSpot.trim() || undefined
        : whyThisSpotSummary(raw)?.slice(0, 220),
    bestSeason: raw.bestSeason?.trim() || undefined,
    typicalWeather: raw.typicalWeather?.trim() || undefined,
    vibeTags: deriveVibeTags(raw),
    activityDescriptor: deriveActivityDescriptor(raw, whyThisSpotSummary(raw)),
    soloSafe: raw.soloSafe ?? (raw.soloIndex ?? 0) >= 75,
    tripRhythm: normalizeTripRhythmFromModel(raw.tripRhythm, raw.name.trim()),
  }
}

export function stripJsonFence(raw: string): string {
  let s = raw.trim()
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/im.exec(s)
  if (fence) s = fence[1].trim()
  return s
}

export function parseIntentRecommendationsResponse(raw: string): IntentRecommendationsResponse | null {
  try {
    const cleaned = stripJsonFence(raw)
    const parsed = JSON.parse(cleaned) as unknown
    const result = intentRecommendationsResponseSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}
