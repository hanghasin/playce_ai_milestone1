import { z } from 'zod'

/** Hub link row — IDs are assigned client-side when missing */
export const hubLinkDraftSchema = z.object({
  label: z.string(),
  href: z.string(),
})

export const intelligenceHubPatchSchema = z.object({
  experience: z.array(hubLinkDraftSchema).optional(),
  stay: z.array(hubLinkDraftSchema).optional(),
  dine: z.array(hubLinkDraftSchema).optional(),
})

export const itineraryActivitySchema = z.object({
  time: z.string(),
  name: z.string(),
  price: z.string(),
  status: z.string(),
  transport: z.string().optional(),
  /** Required for lodging / check-in rows: sport-specific booking rationale (distances, course access, recovery). */
  sportReason: z.string().optional(),
})

export const itineraryDaySchema = z.object({
  day: z.number().int().positive(),
  title: z.string(),
  activities: z.array(itineraryActivitySchema),
})

export const marketSourceSchema = z.object({
  name: z.string(),
  price: z.string(),
  badge: z.string().nullable(),
})

export const marketComparisonPatchSchema = z.object({
  accommodation: z
    .object({
      name: z.string().optional(),
      sources: z.array(marketSourceSchema).optional(),
    })
    .optional(),
  transport: z
    .object({
      name: z.string().optional(),
      sources: z.array(marketSourceSchema).optional(),
    })
    .optional(),
})

export const tripSummarySchema = z.object({
  totalBudget: z.string(),
  bestFor: z.string(),
  topSpots: z.array(z.string()).max(3),
})

export type TripSummary = z.infer<typeof tripSummarySchema>

/** Root shape returned by the LLM (JSON mode) */
export const strategicAdvisorResponseSchema = z.object({
  message: z.string(),
  panelUpdate: z
    .object({
      tripSummary: tripSummarySchema.optional(),
      itinerary: z.array(itineraryDaySchema).optional(),
      intelligenceHub: intelligenceHubPatchSchema.optional(),
      marketComparison: marketComparisonPatchSchema.optional(),
    })
    .nullable()
    .optional(),
})

export type StrategicAdvisorResponse = z.infer<typeof strategicAdvisorResponseSchema>
export type PanelUpdate = NonNullable<NonNullable<StrategicAdvisorResponse['panelUpdate']>>

export function stripJsonFence(raw: string): string {
  let s = raw.trim()
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/im.exec(s)
  if (fence) s = fence[1].trim()
  return s
}

export function parseStrategicAdvisorResponse(raw: string): StrategicAdvisorResponse | null {
  try {
    const cleaned = stripJsonFence(raw)
    const parsed = JSON.parse(cleaned) as unknown
    const result = strategicAdvisorResponseSchema.safeParse(parsed)
    if (result.success) return result.data
    if (parsed && typeof parsed === 'object' && parsed !== null) {
      const rec = parsed as Record<string, unknown>
      const msg = rec.message
      if (typeof msg === 'string' && msg.trim()) {
        return { message: msg.trim(), panelUpdate: null }
      }
    }
    return null
  } catch {
    return null
  }
}
