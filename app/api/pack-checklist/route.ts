import { NextResponse } from 'next/server'
import { callClaude, cleanJsonText } from '@/lib/claude'
import { hasGroqApiKeys } from '@/lib/groq-client'
import { getCachedResponse, setCachedResponse, buildCacheKey } from '@/lib/cache'
import { PLAYCE_VOICE_AND_TONE_PROMPT } from '@/lib/playce-voice-tone-prompt'

function stripJsonFence(raw: string): string {
  const t = raw.trim()
  if (t.startsWith('```')) {
    return t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/m, '').trim()
  }
  return t
}

function fallbackPackItems(input: {
  activity: string
  tripRole: string | null | undefined
  city: string
  country: string
}): string[] {
  const a = input.activity.toLowerCase()
  const competing = input.tripRole === 'COMPETITOR'
  const watching =
    input.tripRole === 'WATCHING' ||
    input.tripRole === 'SPECTATOR' ||
    input.tripRole === 'SUPPORTING'
  const place = `${input.city} / ${input.country}`

  if (/run|marathon|walk|race/.test(a)) {
    if (competing) {
      return [
        `Race-day kit: pinned bib + safety pins / clips, disposable warm layer for corral`,
        `Nutrition you have trained with — gels, salt, bottles (no same-day experiments)`,
        `Chafe control + taped nipples / blister patches`,
        `Sunscreen + hat/visor — verify ${place} heat & UV window`,
        `Fully charged watch + start-line corral timing buffer`,
        `Copies of booking / ID for expo or pickup if organiser requires it`,
        `Post-race sandals + dry shirt in finish bag`,
        `Foam roller / mini roller if your travel plan allows`,
      ]
    }
    if (watching) {
      return [
        `Comfortable standing shoes; breathable layers for swings along the corridor`,
        `Portable charger + course map offline — cell crush is real`,
        `Light sling with snacks/electrolytes for racer handoffs`,
        `Written reunion grid (start belt, midpoint, finish chute) + backup alley meet`,
        `Small dry bag for their finish-line layers if rules allow spectator drop`,
        `Cash/cards for transit when gateways slow digital payments`,
        `Noise-friendly hat or buff if megaphones stack near fan lawns`,
      ]
    }
    return [
      `Running shoes matched to weekly mileage in ${place}`,
      `Reflective band / light if dawn/night miles`,
      `Hydration carry you have tested on long runs`,
      `Anti-chafe + body glide for humid conditions`,
      `Compression / recovery socks for travel legs`,
    ]
  }

  if (/yoga|pilates|stretch/.test(a)) {
    return [
      `Travel mat or thin towel; mat wash if studios rent`,
      `Blocks / strap if your practice needs props`,
      `Layered breathable clothing for studio climate`,
      'Hydration bottle — studio rules vary',
    ]
  }

  return [
    `Activity-specific shoes or boots for ${input.activity} in ${place}`,
    'First-aid basics — blister care, tape, pain relief you tolerate',
    'Chargers + adapters; offline copies of booking confirmations',
    'Layered clothing for morning/evening temperature swing',
    'Microfibre towel / dry bag if water is involved',
  ]
}

type Body = {
  location?: {
    name?: string
    country?: string
    activity?: string
    season?: string
    difficulty?: string
  }
  refine?: {
    tripRole?: 'ACTIVE_TRAVEL' | 'COMPETITOR' | 'WATCHING' | 'SPECTATOR' | 'SUPPORTING' | null
    budgetRange?: string
    skillLevel?: string
    duration?: string
  }
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const name = body.location?.name?.trim() || 'Destination'
  const country = body.location?.country?.trim() || ''
  const activity = body.location?.activity?.trim() || 'Active travel'
  const season = body.location?.season?.trim() || ''
  const difficulty = body.location?.difficulty?.trim() || ''
  const tripRole = body.refine?.tripRole ?? null

  if (!hasGroqApiKeys()) {
    return NextResponse.json({
      items: fallbackPackItems({ activity, tripRole, city: name, country }),
      fallback: true,
    })
  }

  const cacheKey = buildCacheKey(name, country, activity, season, tripRole)
  const cached = getCachedResponse(cacheKey)
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { items?: string[] }
      if (Array.isArray(parsed.items) && parsed.items.length >= 5) {
        return NextResponse.json({ items: parsed.items, fallback: false })
      }
    } catch { /* fall through */ }
  }

  const roleLabel =
    tripRole === 'COMPETITOR'
      ? 'COMPETITOR (racing — bib, taper, race-day execution)'
      : tripRole === 'WATCHING' ||
          tripRole === 'SPECTATOR' ||
          tripRole === 'SUPPORTING'
        ? 'WATCHING / non-participant (viewing OR support crew — no race entry for the traveller)'
        : 'ACTIVE_TRAVEL / practice (training & experience, not necessarily racing)'

  const system = [
    PLAYCE_VOICE_AND_TONE_PROMPT,
    'Respond with valid JSON only. No markdown formatting, no code fences, no explanation text before or after. Start your response with { and end with }.',
    'You output ONE JSON object only.',
    'Schema: {"items":["string", ...]}',
    'items: 10–14 short imperative packing / prep lines (3–12 words each).',
    'Tailor to the sport, destination climate/season, and trip role. Be specific: gear, documents, recovery, race ops where relevant.',
    'Forbidden: vague phrases like "enjoy the trip", "explore the city", placeholders like TBD.',
    'Use real-world packing language — not itinerary storytelling.',
  ].join('\n')

  const user = [
    `Destination: ${name}, ${country}`,
    `Activity: ${activity}`,
    season ? `Season / timing: ${season}` : '',
    difficulty ? `Difficulty label: ${difficulty}` : '',
    `Trip role: ${roleLabel}`,
    body.refine?.budgetRange ? `Budget: ${body.refine.budgetRange}` : '',
    body.refine?.skillLevel ? `Skill: ${body.refine.skillLevel}` : '',
    body.refine?.duration ? `Duration chip: ${body.refine.duration}` : '',
    'Return only the JSON object.',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const raw = await callClaude(system, user, 800)
    const cleaned = cleanJsonText(raw) || stripJsonFence(raw)

    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({
        items: fallbackPackItems({ activity, tripRole, city: name, country }),
        fallback: true,
      })
    }

    const items = Array.isArray((parsed as { items?: unknown }).items)
      ? (parsed as { items: unknown[] }).items
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((s) => s.trim())
          .slice(0, 16)
      : []

    if (items.length < 5) {
      return NextResponse.json({
        items: fallbackPackItems({ activity, tripRole, city: name, country }),
        fallback: true,
      })
    }

    setCachedResponse(cacheKey, JSON.stringify({ items }))
    return NextResponse.json({ items, fallback: false })
  } catch {
    return NextResponse.json({
      items: fallbackPackItems({ activity, tripRole, city: name, country }),
      fallback: true,
    })
  }
}
