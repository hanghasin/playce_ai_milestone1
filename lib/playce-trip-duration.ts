/** Parse an explicit day count from advisor chat (e.g. "make it 6 days"). */
export function parseRequestedTripDays(text: string): number | null {
  const normalized = text.trim()
  if (!normalized) return null

  const patterns = [
    /\b(?:extend(?:ed)?(?:\s+\w+){0,12}?\s+to|make\s+it|change\s+(?:to|it\s+to)?|update\s+to|shorten\s+to)\s*(\d{1,2})\s*[- ]?days?\b/i,
    /\b(\d{1,2})\s*[- ]?day\s*(?:trip|plan|itinerary|stay|long)?\b/i,
    /\b(\d{1,2})\s*[- ]?days?\s*(?:trip|plan|itinerary|stay|long)?\b/i,
  ]

  for (const re of patterns) {
    const match = normalized.match(re)
    if (!match) continue
    const n = Number.parseInt(match[1], 10)
    if (Number.isFinite(n) && n >= 1 && n <= 21) return n
  }

  return null
}

export type ResizableItineraryDay = {
  day: number
  title: string
  activities: Array<{
    time: string
    name: string
    price: string
    status: string
    transport?: string
    sportReason?: string
    pdfLinks?: Array<{ label: string; href: string }>
  }>
}

function isDepartureDay(day: ResizableItineraryDay): boolean {
  return /departure|depart|check-out|checkout|fly\s+out|leave\s+town/i.test(day.title)
}

function buildExtraDay(
  dayNum: number,
  activityLabel: string,
  cityName: string
): ResizableItineraryDay {
  return {
    day: dayNum,
    title: `Day ${String(dayNum).padStart(2, '0')} — Explore ${cityName}`,
    activities: [
      {
        time: '09:30',
        name: `Morning ${activityLabel} session or easy city walk`,
        price: '$15–40',
        status: 'Plan',
      },
      {
        time: '13:00',
        name: 'Local lunch + light recovery',
        price: '$18–35',
        status: 'Plan',
      },
      {
        time: '19:00',
        name: 'Early dinner — save energy for the days ahead',
        price: '$20–45',
        status: 'Plan',
      },
    ],
  }
}

/** Grow or shrink an itinerary to `targetDays` while preserving arrival / departure anchors when possible. */
export function resizeItineraryDays<T extends ResizableItineraryDay>(
  current: T[],
  targetDays: number,
  options: { activityLabel: string; cityName: string }
): T[] {
  const clamped = Math.max(2, Math.min(21, Math.round(targetDays)))
  if (current.length === 0 || current.length === clamped) return current

  if (current.length > clamped) {
    if (clamped === 2) {
      return [current[0], { ...current[current.length - 1], day: 2 }]
    }
    const head = current.slice(0, clamped - 1)
    const tail = { ...current[current.length - 1], day: clamped }
    return [...head, tail].map((day, index) => ({ ...day, day: index + 1 }))
  }

  const last = current[current.length - 1]
  const departureLast = isDepartureDay(last)
  const core = departureLast ? current.slice(0, -1) : [...current]
  const departureTemplate = departureLast ? last : null

  const extraCount = clamped - core.length - (departureTemplate ? 1 : 0)
  const out: T[] = [...core]
  const activity = options.activityLabel.toLowerCase()
  const city = options.cityName.trim() || 'the city'

  for (let i = 0; i < extraCount; i += 1) {
    out.push(buildExtraDay(core.length + i + 1, activity, city) as T)
  }

  if (departureTemplate) {
    out.push({ ...departureTemplate, day: clamped } as T)
  } else {
    out.push(
      buildExtraDay(clamped, activity, city) as T
    )
  }

  return out.map((day, index) => ({ ...day, day: index + 1 }))
}

/** Pad or trim an itinerary to exactly `targetDays` when AI/user requested a new length. */
export function enforceItineraryDayCount<T extends ResizableItineraryDay>(
  current: T[],
  targetDays: number,
  options: { activityLabel: string; cityName: string }
): T[] {
  if (current.length === 0 || targetDays <= 0) return current
  return resizeItineraryDays(current, targetDays, options)
}

export function resolveTargetTripDays(
  sources: Array<string | null | undefined>,
  fallback: number
): number {
  for (const source of sources) {
    const parsed = source ? parseRequestedTripDays(source) : null
    if (parsed != null) return parsed
  }
  return fallback
}
