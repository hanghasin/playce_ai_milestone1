'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { TheRefine } from '@/components/playce/the-refine'
import type { RefineProfile } from '@/components/playce/the-refine'
import type { MatrixLocationData } from '@/lib/playce-location-types'
import { PLAYCE_CONFIRM_HANDOFF_KEY, type PlayceConfirmHandoff } from '@/lib/playce-confirm-handoff'
import { PLAYCE_DEFAULT_REFINE } from '@/lib/playce-default-refine'
import { buildDestinationHandoffSlug } from '@/lib/playce-confirm-helpers'
import { normalizeMatrixLocation } from '@/lib/normalize-matrix-location'
import { difficultyToSkillLevel } from '@/lib/playce-refine-from-difficulty'

type IntentSession = {
  query?: string
  refineSnapshot?: RefineProfile | null
  locations?: MatrixLocationData[]
}

function decodeRouteId(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function idsMatch(candidate: MatrixLocationData, destinationIdRaw: string): boolean {
  const expected = decodeRouteId(buildDestinationHandoffSlug(candidate))
  const fromUrl = decodeRouteId(destinationIdRaw)
  return expected === fromUrl
}

export default function CalibrationPage() {
  const router = useRouter()
  const params = useParams()
  const destinationIdRaw =
    typeof params.destinationId === 'string'
      ? params.destinationId
      : Array.isArray(params.destinationId)
        ? params.destinationId[0]
        : ''

  const [resolved, setResolved] = useState<{
    location: MatrixLocationData
    initialProfile: RefineProfile
    timeframeQuery: string
  } | null>(null)

  useEffect(() => {
    if (!destinationIdRaw) {
      router.replace('/')
      return
    }
    try {
      const rawIntent = sessionStorage.getItem('playce-intent')
      if (!rawIntent) {
        router.replace('/')
        return
      }
      const intent = JSON.parse(rawIntent) as IntentSession
      const list = intent.locations
      if (!Array.isArray(list) || list.length === 0) {
        router.replace('/')
        return
      }

      const found = list
        .map((item) => normalizeMatrixLocation(item))
        .find((loc) => idsMatch(loc, destinationIdRaw))

      if (!found) {
        router.replace('/')
        return
      }

      const qp = PLAYCE_DEFAULT_REFINE
      const snap = intent.refineSnapshot && typeof intent.refineSnapshot === 'object' ? intent.refineSnapshot : null
      const merged: RefineProfile = snap
        ? {
            skillLevel: snap.skillLevel ?? qp.skillLevel,
            riskAppetite: snap.riskAppetite ?? qp.riskAppetite,
            budgetRange: snap.budgetRange ?? qp.budgetRange,
            tripFocus: snap.tripFocus ?? qp.tripFocus,
            duration: snap.duration ?? qp.duration,
            travelCompany: snap.travelCompany ?? qp.travelCompany,
            tripRole: snap.tripRole ?? qp.tripRole,
          }
        : { ...qp }

      merged.skillLevel = difficultyToSkillLevel(found.difficulty)

      const timeframe =
        typeof intent.query === 'string'
          ? intent.query
          : (() => {
              try {
                return sessionStorage.getItem('playce-abyss-query') ?? ''
              } catch {
                return ''
              }
            })()

      setResolved({
        location: found,
        initialProfile: merged,
        timeframeQuery: timeframe.trim(),
      })
    } catch {
      router.replace('/')
    }
  }, [destinationIdRaw, router])

  const slug = useMemo(
    () => (resolved ? buildDestinationHandoffSlug(resolved.location) : ''),
    [resolved]
  )

  const handleBack = useCallback(() => {
    router.push('/')
  }, [router])

  const handleProceed = useCallback(
    (profile: RefineProfile) => {
      if (!resolved || !slug) return
      const handoff: PlayceConfirmHandoff = {
        v: 1,
        destinationId: slug,
        location: { ...resolved.location, budgetTier: profile.budgetRange },
        refine: profile,
        timeframeQuery: resolved.timeframeQuery,
      }
      try {
        sessionStorage.setItem(PLAYCE_CONFIRM_HANDOFF_KEY, JSON.stringify(handoff))
      } catch {
        /* quota */
      }
      router.push(`/confirm/${slug}`)
    },
    [resolved, router, slug]
  )

  if (!resolved) {
    return <main className="min-h-screen" style={{ background: 'var(--bg)', minHeight: '100vh' }} aria-busy="true" />
  }

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <TheRefine location={resolved.location} initialProfile={resolved.initialProfile} onBack={handleBack} onProceed={handleProceed} />
    </main>
  )
}
