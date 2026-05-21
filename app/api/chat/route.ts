import { NextResponse } from 'next/server'
import { PLAYCE_SOFT_ERROR, sanitizeUserFacingErrorMessage } from '@/lib/playce-user-facing-errors'
import { cleanJsonText } from '@/lib/claude'
import { fetchGroqChatWithModelFallback, hasGroqApiKeys } from '@/lib/groq-client'
import { PLAYCE_VOICE_AND_TONE_PROMPT } from '@/lib/playce-voice-tone-prompt'
import { parseStrategicAdvisorResponse } from '@/lib/playce-strategic-advisor-schema'
import {
  buildTravelIntentItineraryAppendix,
  normalizeTravelIntent,
} from '@/lib/playce-travel-intent-itinerary-prompt'

type ChatTurn = { role: 'user' | 'assistant'; content: string }

type JourneyContext = {
  location: {
    name: string
    country: string
    activity: string
    season: string
    difficulty: string
    vibe: string
  }
  refine: {
    budgetRange: string
    skillLevel: string
    riskAppetite?: string
    tripFocus?: string
    durationDays?: number
    durationRange?: string
    tripRole?: 'ACTIVE_TRAVEL' | 'COMPETITOR' | 'WATCHING'
  }
  travelIntent?: string
  itinerary?: unknown
  marketComparison?: unknown
}

function buildSystemPrompt(): string {
  return [
    PLAYCE_VOICE_AND_TONE_PROMPT,
    '',
    'Respond with valid JSON only. No markdown, no code fences. Start with { and end with }.',
    'You are Playce Strategic Advisor — concise travel ops for active trips; sports travel expert with deep local knowledge.',
    'Never output placeholder geography: use real airport (IATA + full name), neighbourhood, venue, and course segment names only.',
    'Reply with ONE JSON object only:',
    '{"message":string,"panelUpdate":object|null}',
    '',
    'message: 2–4 short sentences, plain language, actionable. No jargon (no vantage belts, cheer hops, corral without explanation).',
    'panelUpdate: null if only answering a question; else optional keys:',
    '  When the user changes trip length (extend, shorten, or N-day trip), panelUpdate MUST include a complete itinerary with exactly the requested day count — never confirm a new duration in message without updating panelUpdate.itinerary.',
    '  tripSummary: { totalBudget, bestFor, topSpots:[3 strings] }',
    '  itinerary: [ { day:number, title:string, activities:[{ time, name, price, status, transport?, sportReason? }] } ]',
    '    — use exactly context.refine.durationDays days when generating a full plan.',
    '    — day 1 lodging MUST include sportReason tied to context.location.activity.',
    '    — For tripRole WATCHING: non-participant event logistics only — no racer bib/taper blocks.',
    '    — For tripRole COMPETITOR: race-week ops (expo, carbs, sleep, race day, recovery).',
    '    — Plain language activity names any traveler understands.',
    '  intelligenceHub: { experience, stay, dine } each [{label, href}] with https URLs.',
    '  marketComparison: optional { accommodation:{name,sources:[{name,price,badge}]}, transport:{...} }',
    '',
    'Rules: match skill + budget; real place names; no placeholders (N/A, TBD).',
  ].join('\n')
}

export async function POST(req: Request) {
  if (!hasGroqApiKeys()) {
    return NextResponse.json(
      {
        error: 'missing_api_key',
        message: PLAYCE_SOFT_ERROR,
      },
      { status: 503 }
    )
  }

  let body: { messages?: ChatTurn[]; context?: JourneyContext }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const turns = body.messages?.filter((m) => m.role === 'user' || m.role === 'assistant') ?? []
  if (!turns.length || !turns.some((m) => m.role === 'user')) {
    return NextResponse.json({ error: 'messages_required' }, { status: 400 })
  }

  const ctx = body.context
  const travelIntent = normalizeTravelIntent(ctx?.travelIntent)
  const durationDays = ctx?.refine?.durationDays
  const travelIntentAppendix =
    travelIntent != null && typeof durationDays === 'number' && durationDays > 0
      ? `\n\nTRAVEL_INTENT_ITINERARY_RULES (follow exactly for panelUpdate.itinerary):\n${buildTravelIntentItineraryAppendix(travelIntent, durationDays, ctx?.refine?.budgetRange)}`
      : ''

  const contextBlock = ctx
    ? `\n\nCurrent journey context (JSON for alignment — do not repeat verbatim):\n${JSON.stringify({
        location: ctx.location,
        refine: ctx.refine,
        tripRole: ctx.refine?.tripRole ?? 'ACTIVE_TRAVEL',
        travelIntent: travelIntent ?? null,
        itinerary: ctx.itinerary,
        marketComparison: ctx.marketComparison,
      })}`
    : ''

  const systemContent = buildSystemPrompt() + contextBlock + travelIntentAppendix

  try {
    const raw = await fetchGroqChatWithModelFallback((modelName) => ({
      model: modelName,
      temperature: 0.55,
      max_tokens: 3072,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemContent },
        ...turns.map((t) => ({ role: t.role, content: t.content })),
      ],
    }))

    const parsed = parseStrategicAdvisorResponse(cleanJsonText(raw))
    if (parsed) {
      return NextResponse.json({
        message: parsed.message,
        panelUpdate: parsed.panelUpdate ?? null,
      })
    }

    return NextResponse.json(
      { error: 'parse_error', message: PLAYCE_SOFT_ERROR },
      { status: 502 }
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error('[api/chat] error:', detail)
    return NextResponse.json(
      { error: 'groq_error', message: sanitizeUserFacingErrorMessage(detail) },
      { status: 502 }
    )
  }
}
