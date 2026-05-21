import type { CSSProperties } from 'react'
import type { MatrixLocationData } from '@/lib/playce-location-types'
import type { RefineProfile } from '@/components/playce/the-refine'
import { airportFallbackInstruction, primaryAirportsLine } from '@/lib/playce-airport-hints'
import { isUnsplashImageUrl } from '@/lib/location-image'

/** API/session may send numbers or objects where UI expects strings — safe coerce. */
export function coerceTextField(raw: unknown, maxLen?: number): string {
  if (typeof raw === 'string') {
    const t = raw.trim()
    return maxLen ? t.slice(0, maxLen) : t
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const t = `$${Math.round(raw)} / day`
    return maxLen ? t.slice(0, maxLen) : t
  }
  if (raw == null) return ''
  const t = String(raw).trim()
  return maxLen ? t.slice(0, maxLen) : t
}

/** Budget / neighborhood lines — drop placeholder tokens. */
export function coerceBudgetText(raw: unknown, maxLen = 80): string {
  const t = coerceTextField(raw, maxLen)
  if (!t || /^(none|null|n\/a|nil)$/i.test(t)) return ''
  return t
}

/** Primary footer CTA — matches Confirm “Confirm this move” button. */
export const playcePrimaryCtaStyle: CSSProperties = {
  background: '#C17D3C',
  color: '#1a0e00',
  borderRadius: 5,
  padding: '12px 32px',
  fontSize: 14,
  fontWeight: 500,
  fontFamily: 'var(--font-display)',
  letterSpacing: '0.02em',
}

/** Secondary footer CTA — same type size/padding as primary, keeps glass button chrome via className. */
export const playceSecondaryCtaStyle: CSSProperties = {
  borderRadius: 5,
  padding: '12px 32px',
  fontSize: 14,
  fontWeight: 500,
  fontFamily: 'var(--font-display)',
  letterSpacing: '0.02em',
}

/** Google verification link — visa copy is never shown in UI; uses destination country + current year only. */
export function visaRequirementsGoogleHref(destinationCountry: string): string {
  const country = destinationCountry.trim()
  const q = `${country} visa requirements ${new Date().getFullYear()}`.trim()
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}

/** Same airport line heuristic as Confirm / Matrix fast facts */
export function airportFactLineForLocation(
  loc: Pick<MatrixLocationData, 'name' | 'country' | 'nearestAirport'>
): string {
  const fromCard = coerceTextField(loc.nearestAirport)
  if (fromCard && !/^main airport\b/i.test(fromCard)) return fromCard
  return primaryAirportsLine(loc.name, loc.country) || airportFallbackInstruction(loc.name, loc.country)
}

/** Daily budget Fact — AI tier bands when provided, then legacy dailyBudget, then heuristic fallback */
export function dailyBudgetDisplayForTier(
  loc: MatrixLocationData,
  budgetRange: RefineProfile['budgetRange'],
  heuristicFallback: string
): string {
  const tier =
    (loc.budgetTier && ['ESSENTIAL', 'MID-RANGE', 'LUXE'].includes(loc.budgetTier) ? loc.budgetTier : null) ??
    budgetRange
  let line =
    tier === 'LUXE'
      ? coerceBudgetText(loc.budgetLuxe)
      : tier === 'MID-RANGE'
        ? coerceBudgetText(loc.budgetMidrange)
        : coerceBudgetText(loc.budgetEssential)
  if (!line) line = coerceBudgetText(loc.dailyBudget)
  if (!line) line = heuristicFallback
  return line.slice(0, 80)
}

/** Trip total from tier daily band × duration (e.g. "$320–800 total"). */
export function formatTripBudgetTotalEstimate(
  loc: MatrixLocationData,
  budgetRange: RefineProfile['budgetRange'],
  durationDays: number,
  heuristicFallback: string
): string {
  const dailyLine =
    coerceBudgetText(loc.budgetEssential) ||
    dailyBudgetDisplayForTier(loc, budgetRange, heuristicFallback)
  const range = parseDailyBudgetUsdRange(dailyLine)
  if (!range || durationDays <= 0) return dailyLine || '—'
  return `$${formatUsdInteger(range.min * durationDays)}–${formatUsdInteger(range.max * durationDays)} total`
}

/** Parse tier daily strings like "$150–280 / day", "$40-80/day", "$400+" into integer USD/day min/max. */
export function parseDailyBudgetUsdRange(dailyLine: string): { min: number; max: number } | null {
  const compact = dailyLine.replace(/\s+/g, ' ').trim()
  const plus = /^\$?\s*([\d,]+)\s*\+(?:\s|$|\/)/i.exec(compact)
  if (plus) {
    const min = parseInt(plus[1].replace(/,/g, ''), 10)
    if (!Number.isFinite(min) || min <= 0) return null
    const max = Math.max(min + 1, min * 2)
    return { min, max }
  }
  const noDay = compact.replace(/\s*\/\s*day.*$/i, '').trim()
  const normalized = noDay.replace(/\$/g, '').trim()
  const parts = normalized.split(/\s*[–\-]\s*/)
  if (parts.length >= 2) {
    const min = parseInt(parts[0].replace(/,/g, ''), 10)
    const max = parseInt(parts[1].replace(/,/g, ''), 10)
    if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min) return { min, max }
  }
  return null
}

export function formatUsdInteger(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/** “Where to base yourself” — AI neighbourhood lines by tier */
export function confirmBaseNeighborhoodLine(
  loc: MatrixLocationData,
  budgetRange: RefineProfile['budgetRange'],
  stayAreaFallback?: string
): string {
  const tier =
    (loc.budgetTier && ['ESSENTIAL', 'MID-RANGE', 'LUXE'].includes(loc.budgetTier) ? loc.budgetTier : null) ??
    budgetRange
  let area =
    tier === 'LUXE'
      ? coerceBudgetText(loc.luxeNeighborhood, 140)
      : tier === 'MID-RANGE'
        ? coerceBudgetText(loc.midrangeNeighborhood, 140)
        : coerceBudgetText(loc.budgetNeighborhood, 140)
  if (!area) area = coerceTextField(stayAreaFallback, 140)

  const place = `${loc.name}`.trim()

  const tail =
    tier === 'ESSENTIAL'
      ? 'hostel density, easy transit access.'
      : tier === 'MID-RANGE'
        ? 'central, comfortable options.'
        : 'premium stays, quieter streets.'

  if (area) return `Base: ${area} — ${tail}`

  return `Base: areas near transit in ${place} — ${tail}`
}

/** URL-safe slug for /journey/[destinationId] handoff */
export function buildDestinationHandoffSlug(location: MatrixLocationData): string {
  const anchor = (location.primaryTitle || location.name || '').trim()
  const name = anchor.toLowerCase().replace(/\s+/g, '-')
  const country = (location.country || '').trim().toLowerCase().replace(/\s+/g, '-')
  if (!name || !country) return encodeURIComponent(`${name || 'destination'}--${country || 'unknown'}`)
  const raw = `${name}--${country}`
  return encodeURIComponent(raw)
}

/** Decode a route param and compare slugs reliably. */
export function decodeDestinationRouteId(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toLowerCase()
  } catch {
    return raw.trim().toLowerCase()
  }
}

export function destinationSlugsMatch(a: string, b: string): boolean {
  return decodeDestinationRouteId(a) === decodeDestinationRouteId(b)
}

export function isHeroImageUrl(src: string | undefined | null): boolean {
  return isUnsplashImageUrl(src)
}

function slugForPdfSegment(value: string): string {
  return value
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

/** Export filename: days + destination + activity theme (e.g. `6-days-bangkok-marathon.pdf`). */
export function buildJourneyPdfFileName(options: {
  durationDays: number
  locationName: string
  activity: string
}): string {
  const days = Math.max(1, Math.min(21, Math.round(options.durationDays)))
  const place = slugForPdfSegment(options.locationName) || 'destination'
  const theme = slugForPdfSegment(options.activity) || 'trip'
  return `${days}-days-${place}-${theme}.pdf`
}

const GENERIC_ZONES = /main waterfront and central activity districts/i
const ACTIVITY_ZONES_OPS_JARGON =
  /\boperational\b|\baccreditation\b|\bcorral\b|\bfilter\b|fuel\s*depot|race\s*director|\blogistics\b/i

/** API/session may send `activityZones` as a string or string[] — normalize before `.trim()`. */
export function coerceActivityZonesToString(raw: unknown): string {
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw)
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (item == null) return ''
        if (typeof item === 'string') return item.trim()
        if (typeof item === 'number' || typeof item === 'boolean') return String(item)
        return ''
      })
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

export function scrubActivityZones(text: string | undefined | unknown, location: MatrixLocationData): string {
  const t = coerceActivityZonesToString(text).trim()
  if (!t || GENERIC_ZONES.test(t) || ACTIVITY_ZONES_OPS_JARGON.test(t)) {
    const ctx = `${location.name} ${location.country}`.toLowerCase()
    if (/\bbangkok\b|^krung/.test(ctx)) {
      return `Lumpini Park (2.5 km loop) and the riverside Chao Phraya path are the main training grounds. Run before 7 am — it gets humid fast and traffic builds quickly.`
    }
    if (/chiang\s*mai/.test(ctx)) {
      return `Most road and trail volume sits around the Old City moat, Huay Kaew toward Doi Suthep, and the riverside flat — early starts beat heat and traffic.`
    }
    return `Use the main training corridors and parks locals actually run or practise in — verify access hours and heat before you commit to a loop.`
  }
  return t
}

export function shortDescriptionFallback(location: MatrixLocationData, refine: RefineProfile): string {
  const ab = String(location.about ?? '').trim()
  if (ab && ab.length > 40) return ab.slice(0, 280)
  const role =
    refine.tripRole === 'COMPETITOR'
      ? 'Race-week pacing stays workable'
      : refine.tripRole === 'WATCHING'
        ? 'Watching or crewing logistics—vantage, ticketing, cheer hops, and reunion anchors matter more than your own mileage'
        : 'Training-friendly rhythm is easy to hold'
  return `${location.name} pairs ${coerceTextField(location.activity).toLowerCase()} access with a workable urban trail and recovery scene. ${role} once you lock a realistic daily loop near your stay.`
}

export function typicalWeatherFallback(location: MatrixLocationData): string {
  const t = String(location.conditions?.temp ?? '').trim()
  if (t && t.length < 48 && !/water\s*temperature/i.test(t)) return t
  const season = String(location.season ?? 'Year-round')
  return `${season.split(/[·,]/)[0]?.trim() ?? 'Year-round'}: check live forecasts — humidity shifts daily.`
}

export function getTrainingSectionTitle(activity: string): string {
  const a = coerceTextField(activity).toLowerCase()
  if (/\b(marathon|triathlon|half[\s-]marathon|trail race|ultramarathon|race)\b/.test(a)) return 'TRAINING & SESSIONS'
  if (/\b(surf|ski|snowboard|kayak|paddle|sup\b|scuba|dive)\b/.test(a)) return 'ACTIVITIES & RENTALS'
  if (/\b(yoga|muay|bjj|martial|crossfit|climb|boulder|pilates)\b/.test(a)) return 'CLASSES & COACHING'
  return 'EXPLORE ACTIVITIES'
}

/** Training block CTA — never registration (that lives under Events & Races). */
export function getTrainingSectionCTA(
  location: MatrixLocationData,
  budgetRange: RefineProfile['budgetRange'] = 'MID-RANGE'
): { label: string; href: string } {
  const al = coerceTextField(location.activity).toLowerCase()
  const races = [
    'marathon',
    'triathlon',
    'trail run',
    'trail race',
    'ultramarathon',
    'half marathon',
    'obstacle course',
    'spartan',
  ]
  if (races.some((r) => al.includes(r))) {
    const destinationName = coerceTextField(location.name)
    return {
      label: `Find running routes in ${destinationName}`,
      href: `https://www.google.com/maps/search/${encodeURIComponent(`running routes ${destinationName}`)}`,
    }
  }
  return getActivityCTA(location, budgetRange)
}

export function getActivityCTA(
  location: MatrixLocationData,
  budgetRange: RefineProfile['budgetRange'] = 'MID-RANGE'
): { label: string; href: string } {
  const activity = coerceTextField(location.activity)
  const destinationName = coerceTextField(location.name)
  const rentals = ['surf', 'ski', 'snowboard', 'kayak', 'cycling', 'mtb', 'paddleboard', 'kitesurfing', 'scuba']
  const races = ['marathon', 'triathlon', 'trail run', 'trail race', 'ultramarathon', 'half marathon', 'obstacle course', 'spartan']
  const classes = ['yoga', 'meditation', 'muay thai', 'bjj', 'martial arts', 'crossfit', 'climbing', 'bouldering']
  const al = activity.toLowerCase()

  const rentalOrTrainingLabel =
    budgetRange === 'ESSENTIAL'
      ? `Find ${activity} rentals`
      : budgetRange === 'LUXE'
        ? 'Find private coaching'
        : 'Find classes & guided sessions'

  const rentalOrTrainingHref =
    budgetRange === 'ESSENTIAL'
      ? `https://www.google.com/maps/search/${encodeURIComponent(`${activity} rental ${destinationName}`)}`
      : budgetRange === 'LUXE'
        ? `https://www.google.com/maps/search/${encodeURIComponent(`private ${activity} coach ${destinationName}`)}`
        : `https://www.google.com/maps/search/${encodeURIComponent(`${activity} group lesson ${destinationName}`)}`

  if (rentals.some((r) => al.includes(r))) {
    return { label: rentalOrTrainingLabel, href: rentalOrTrainingHref }
  }
  if (races.some((r) => al.includes(r))) {
    return {
      label: 'Browse race registrations',
      href: `https://www.google.com/search?q=${encodeURIComponent(`${activity} ${destinationName} registration`)}`,
    }
  }
  if (classes.some((r) => al.includes(r))) {
    return { label: rentalOrTrainingLabel, href: rentalOrTrainingHref }
  }
  return { label: rentalOrTrainingLabel, href: rentalOrTrainingHref }
}

/** Google search: official registration for the listed event or destination + activity. */
export function confirmRaceRegistrationSearchHref(
  location: MatrixLocationData,
  eventRows: ReadonlyArray<{ name: string }>
): string {
  const ev = eventRows[0]?.name?.trim()
  const q = ev ? `${ev} official registration` : `${location.activity} ${location.name} race registration`
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}

/** Official event site when known, else Google search for tickets / spectator info. */
export function confirmSpectatorEventDetailsHref(
  location: MatrixLocationData,
  eventRows: ReadonlyArray<{ name: string; website: string }>
): string {
  const w = eventRows[0]?.website?.trim()
  if (w && /^https?:\/\//i.test(w)) return w
  const ev = eventRows[0]?.name?.trim()
  const q = ev ? `${ev} tickets spectator ${location.name}` : `${location.activity} ${location.name} event tickets`
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}

/** Primary event label for copy on Confirm (falls back to activity + destination). */
export function primaryEventVenueDisplay(location: MatrixLocationData): string {
  const ev = location.upcomingEvents?.[0]?.name?.trim()
  if (ev) return ev
  return `${location.activity} · ${location.name}`
}

/** Spectator ticketing — official URL when credible, otherwise Google ticket search. */
export function eventTicketHrefForLocation(location: MatrixLocationData): string {
  const ev = location.upcomingEvents?.[0]
  const w = ev?.website?.trim()
  if (w && /^https?:\/\//i.test(w)) return w
  const basis = ev?.name?.trim()
    ? `${ev.name} official tickets ${location.name}`
    : `${location.activity} tickets ${location.name} ${location.country}`
  return `https://www.google.com/search?q=${encodeURIComponent(basis)}`
}

/** Google Maps search geared to course footprint for supporters. */
export function courseFollowMapsHref(location: MatrixLocationData): string {
  const ev = location.upcomingEvents?.[0]?.name?.trim()
  const basis = ev ? `${ev} course route ${location.name}` : `${location.activity} race course map ${location.name} ${location.country}`
  return `https://www.google.com/maps/search/${encodeURIComponent(basis)}`
}

/** Confirm page: Plan your route — Google Maps search only (no login). */
export function googleMapsPlanRouteHref(activityType: string, destinationName: string): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(`${activityType} ${destinationName}`)}`
}

export function safetyFeelingLabel(nightSafety: number): string {
  if (nightSafety >= 75) return 'High'
  if (nightSafety >= 50) return 'Moderate'
  return 'Low'
}

export function socialOpennessLabel(communityDensity: number): string {
  if (communityDensity >= 75) return 'Strong'
  if (communityDensity >= 50) return 'Present'
  return 'Quiet'
}

/** Vibe Index “Traveler density” — averaged community × infrastructure bustle read */
export function travelerDensityDisplay(
  communityDensity: number,
  infrastructureScore: number
): { value: string; hint: string } {
  const avg = Math.round((communityDensity + infrastructureScore) / 2)
  if (avg >= 80)
    return { value: 'High season', hint: 'Busy — lots of travelers, book ahead.' }
  if (avg >= 60)
    return { value: 'Moderate', hint: 'Good mix — not overcrowded.' }
  return { value: 'Off the beaten path', hint: 'Fewer travelers, more local feel.' }
}

export type ConfirmVibeThirdVariant =
  | 'route_running'
  | 'waves_water'
  | 'flower_wellness'
  | 'mountain_alpine'
  | 'carabiner_climbing'
  | 'star_default'

/** Third Vibe Index row on Confirm — varies by activity type */
export function getConfirmVibeThird(
  activity: string,
  infrastructureScore: number,
  communityDensity: number
): { variant: ConfirmVibeThirdVariant; label: string; value: string } {
  const a = activity.toLowerCase()
  if (
    /\b(marathon|triathlon|half[\s-]marathon|trail\s*races?|trail\s*runn(?:ing)?|ultramarathon|\brace\b|\brunn(?:ing)?\b|\brun\b)\b/.test(a)
  ) {
    const v =
      infrastructureScore >= 75 ? 'Excellent' : infrastructureScore >= 55 ? 'Good' : 'Limited'
    return { variant: 'route_running', label: 'Route access', value: v }
  }
  if (/\b(surf|kitesurfing?|windsurfing?)\b/.test(a)) {
    const s = communityDensity
    const v = s >= 75 ? 'Reliable' : s >= 55 ? 'Variable' : 'Seasonal'
    return { variant: 'waves_water', label: 'Wave consistency', value: v }
  }
  if (/\b(yoga|meditation|wellness|retreat|pilates|mindfulness)\b/.test(a)) {
    const s = communityDensity
    const v = s >= 75 ? 'Thriving' : s >= 55 ? 'Present' : 'Emerging'
    return { variant: 'flower_wellness', label: 'Wellness scene', value: v }
  }
  if (/\b(ski|snowboard|alpine)\b/.test(a)) {
    const v =
      infrastructureScore >= 75 ? 'World-class' : infrastructureScore >= 55 ? 'Solid' : 'Basic'
    return { variant: 'mountain_alpine', label: 'Mountain access', value: v }
  }
  if (/\b(climb|climbing|boulder|via ferrata)\b/.test(a)) {
    const v =
      infrastructureScore >= 75 ? 'Well-equipped' : infrastructureScore >= 55 ? 'Accessible' : 'Remote'
    return { variant: 'carabiner_climbing', label: 'Crag access', value: v }
  }
  const v =
    infrastructureScore >= 75 ? 'Excellent' : infrastructureScore >= 55 ? 'Decent' : 'Basic'
  return { variant: 'star_default', label: 'Local infrastructure', value: v }
}

export function tripRhythmLeadCopy(activity: string): string {
  const a = activity.toLowerCase()
  if (
    /\b(marathon|triathlon|half[\s-]marathon|trail\s*races?|trail\s*runn(?:ing)?|ultramarathon|\brace\b|\brunn(?:ing)?\b|\brun\b)\b/.test(a)
  ) {
    return 'A suggested daily rhythm for your training week.'
  }
  if (
    /\b(surf|ski|snowboard|kitesurfing?|windsurfing?|kayak|hike|hiking|mtb|cycling|climb|climbing|boulder|trail\s*run|paddle|scuba|dive|trek)\b/.test(a)
  ) {
    return 'A suggested daily rhythm around conditions and recovery.'
  }
  if (/\b(yoga|meditation|wellness|retreat|pilates)\b/.test(a)) {
    return 'A suggested daily rhythm for your practice and rest.'
  }
  return 'A suggested daily rhythm for your time here.'
}

const MONTH_ONE_WORD =
  /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)$/i

const MONTH_TOKEN =
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?)\b/i

function monthRangeFromText(raw: string): string | null {
  const fullRange =
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s*[\u2013\-–]\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i.exec(
      raw
    )
  if (fullRange) {
    const [start, end] = fullRange[0].split(/[\u2013\-–]/).map((part) => part.trim())
    return `${sentenceCase(start)}–${sentenceCase(end)}`
  }
  const abbrevRange =
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s*[\u2013\-–]\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\b/i.exec(
      raw
    )
  if (abbrevRange) {
    const sep = abbrevRange[0].match(/[\u2013\-–]/)?.[0] ?? '–'
    const [start, end] = abbrevRange[0].split(/[\u2013\-–]/).map((part) => part.trim())
    return `${sentenceCase(start.replace(/\.$/, ''))}${sep}${sentenceCase(end.replace(/\.$/, ''))}`
  }
  return null
}

function firstMonthToken(raw: string): string | null {
  const match = raw.match(MONTH_TOKEN)
  if (!match) return null
  return sentenceCase(match[0].replace(/\.$/, ''))
}

/** Hero subtitle month — event date, season, or best-season window. */
export function resolveHeroMonthLabel(input: {
  season?: string
  bestSeason?: string
  eventDate?: string
}): string | null {
  for (const source of [input.eventDate, input.season, input.bestSeason]) {
    const raw = source?.trim()
    if (!raw || /year[\s-]round/i.test(raw)) continue
    const range = monthRangeFromText(raw)
    if (range) return range
    const single = firstMonthToken(raw)
    if (single) return single
    const firstToken = raw.split(/[·,]/)[0]?.trim()
    if (firstToken && MONTH_ONE_WORD.test(firstToken)) return sentenceCase(firstToken)
  }
  return null
}

/** Capitalize each month token in a season string (e.g. "Sep – jun" → "Sep – Jun"). */
function capitalizeMonthTokens(raw: string): string {
  return raw.replace(MONTH_TOKEN, (token) => sentenceCase(token.replace(/\.$/, '')))
}

/** Fast Facts — prefer AI range Mon–Mon; normalize single-month to "Month (peak)" */
export function formatBestSeasonDisplay(
  bestSeasonRaw: string | undefined,
  seasonFallback: string
): string {
  const rawBase = String(bestSeasonRaw ?? '').trim() || String(seasonFallback ?? '').trim() || ''
  const raw = rawBase.slice(0, 120)
  if (!raw) return ''

  const hyp = /[\u2013\-–]/.test(raw)
  const abbrevRange =
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s*[\u2013\-–]\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(
      raw
    )
  const fullRange =
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b\s*[\u2013\-–]\s*\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(
      raw
    )

  const hasRange = hyp || /year[\s-]round/i.test(raw) || abbrevRange || fullRange

  if (/year[\s-]round|^year\s*$/i.test(raw.trim())) return 'Year-round'

  if (hasRange) return capitalizeMonthTokens(raw)

  const collapsed = raw.replace(/\s+/g, ' ').trim()
  const tokens = collapsed.split(/\s+/).filter(Boolean)
  const first = tokens[0]
  if (tokens.length === 1 && first && MONTH_ONE_WORD.test(first)) {
    const cap = sentenceCase(raw.toLowerCase())
    return `${cap} (peak)`
  }
  return capitalizeMonthTokens(raw)
}

const DEFAULT_GAUGE_R = 35

export function gaugeArcDash(pct: number, radius: number = DEFAULT_GAUGE_R): string {
  const C = 2 * Math.PI * radius
  const p = Math.min(100, Math.max(0, pct))
  const vis = (p / 100) * C
  return `${vis} ${C}`
}

export function budgetLabel(refine: RefineProfile, dailyFallback: string): string {
  switch (refine.budgetRange) {
    case 'ESSENTIAL':
      return 'Essential'
    case 'MID-RANGE':
      return 'Mid-range'
    case 'LUXE':
      return 'Luxe'
    default:
      return 'Mid-range'
  }
}

export function buildConfirmHeroMetaLine(
  location: Pick<MatrixLocationData, 'season' | 'activity' | 'difficulty'>,
  refine: RefineProfile,
  tripDays: number,
  dailyBudgetFallback: string
): string {
  const difficulty = sentenceCase(coerceTextField(location.difficulty) || refine.skillLevel)
  const activity = sentenceCase(coerceTextField(location.activity) || 'Travel')
  return `${sentenceCase(location.season)} · ${activity} · ${difficulty} · ${budgetLabel(refine, dailyBudgetFallback)} · ${tripDays} days`
}

export function sentenceCase(str: string): string {
  const s = String(str ?? '')
  if (!s) return s
  const lower = s.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}
