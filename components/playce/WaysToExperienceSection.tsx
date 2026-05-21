'use client'

import { useMemo, type CSSProperties } from 'react'
import { ExperienceIcon } from '@/components/icons/ExperienceIcon'
import {
  getExperienceCards,
  refineBudgetToExperienceTier,
  type CardConfig,
} from '@/lib/experience-cards'
import type { TravelIntent } from '@/lib/playce-travel-intent-itinerary-prompt'

type WaysToExperienceSectionProps = {
  travelPurpose: TravelIntent
  budget: 'ESSENTIAL' | 'MID-RANGE' | 'LUXE' | undefined
  activityType: string
  destinationName: string
  season: string
  /** Spot + region for “View location” (e.g. "Supertubos beach, Portugal"). */
  mapQuery: string
  /** When set, use these cards instead of recomputing (keeps PDF + preview in sync). */
  cards?: CardConfig[]
  /** Optional wrapper class (padding handled by parent). */
  className?: string
  labelStyle?: CSSProperties
}

function ExperienceLinkCard({ card }: { card: CardConfig }) {
  return (
    <a
      href={card.href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-2 border border-[var(--border)] bg-[var(--bg-secondary)] no-underline transition-colors hover:border-white/20"
      style={{ borderRadius: 'var(--radius)', padding: 16, cursor: 'pointer' }}
    >
      <div className="flex items-start justify-between">
        <ExperienceIcon type={card.icon} />
        <span className="text-[12px] text-zinc-500">↗</span>
      </div>
      <span
        className="text-[13px] font-medium leading-snug"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
      >
        {card.label}
      </span>
      {card.subNote ? (
        <span
          className="text-[11px] leading-snug"
          style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
        >
          {card.subNote}
        </span>
      ) : null}
    </a>
  )
}

export function WaysToExperienceSection({
  travelPurpose,
  budget,
  activityType,
  destinationName,
  season,
  mapQuery,
  cards: cardsOverride,
  className = '',
  labelStyle,
}: WaysToExperienceSectionProps) {
  const cards = useMemo(
    () =>
      cardsOverride ??
      getExperienceCards(
        travelPurpose,
        refineBudgetToExperienceTier(budget),
        activityType,
        destinationName,
        season,
        mapQuery
      ),
    [cardsOverride, travelPurpose, budget, activityType, destinationName, season, mapQuery]
  )

  const mutedLabel = labelStyle ?? { color: 'rgba(255,255,255,0.3)' }

  return (
    <section className={className}>
      <p className="playce-section-label mb-5" style={mutedLabel}>
        WAYS TO EXPERIENCE IT
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <ExperienceLinkCard key={card.label} card={card} />
        ))}
      </div>
    </section>
  )
}
