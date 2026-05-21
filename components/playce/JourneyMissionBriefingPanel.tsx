'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction, CSSProperties, ReactNode, RefObject } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  isRentGearLine,
  JOURNEY_PACK_MAX_BRING,
  sanitizeGearPackItemText,
  type JourneyPackLine,
} from '@/lib/journey-pack-lines'
import { splitHubLinksForDisplay } from '@/lib/journey-hub-links'
import type { LocalTransportMode, MatrixLocationData } from '@/lib/playce-location-types'
import { mergeLocalTransportForLocation } from '@/lib/playce-local-transport'
import type { RefineProfile } from '@/components/playce/the-refine'
import { EventsAndRacesSection } from '@/components/playce/EventsAndRacesSection'
import { WaysToExperienceSection } from '@/components/playce/WaysToExperienceSection'
import {
  airportFactLineForLocation,
  dailyBudgetDisplayForTier,
  formatBestSeasonDisplay,
  formatTripBudgetTotalEstimate,
  formatUsdInteger,
  gaugeArcDash,
  getConfirmVibeThird,
  parseDailyBudgetUsdRange,
  safetyFeelingLabel,
  scrubActivityZones,
  sentenceCase,
  socialOpennessLabel,
  travelerDensityDisplay,
  tripRhythmLeadCopy,
  typicalWeatherFallback,
  visaRequirementsGoogleHref,
  type ConfirmVibeThirdVariant,
} from '@/lib/playce-confirm-helpers'
import { travelPurposeFromTripRole } from '@/lib/experience-cards'
import type { TravelIntent } from '@/lib/playce-travel-intent-itinerary-prompt'
import { itineraryCostDisplayText } from '@/lib/playce-itinerary-cost-display'
import { buildJourneyBriefingPdfContent } from '@/lib/journey-briefing-content'
import {
  Cable,
  Calendar,
  Clock,
  Flower2,
  Footprints,
  IdCard,
  Info,
  Moon,
  Mountain,
  Plane,
  Shield,
  Smartphone,
  Star,
  Sun,
  Sunrise,
  Sunset,
  ThermometerSun,
  Users,
  Wallet,
  Waves,
} from 'lucide-react'
import { IconRoute } from '@tabler/icons-react'

export type HubCategory = 'experience' | 'stay' | 'dine'

export interface HubLinkItem {
  id: string
  label: string
  href: string
}

export interface IntelligenceHubSnapshot {
  experience: HubLinkItem[]
  stay: HubLinkItem[]
  dine: HubLinkItem[]
}

export interface TripSummaryData {
  totalBudget: string
  bestFor: string
  topSpots: string[]
}

export interface MissionBriefingActivity {
  time: string
  name: string
  price: string
  status: string
  transport?: string
  /** Sport-specific context (e.g. hotel near finish line). Shown as smaller italic note under the activity title. */
  sportReason?: string
}

export interface MissionBriefingDay {
  day: number
  title: string
  activities: MissionBriefingActivity[]
}

interface JourneyMissionBriefingPanelProps {
  variant: 'embedded' | 'overlay'
  location: MatrixLocationData
  refine: {
    budgetRange: RefineProfile['budgetRange']
    skillLevel: string
    durationDays?: number
    tripRole?: 'ACTIVE_TRAVEL' | 'COMPETITOR' | 'WATCHING'
  }
  tripSummary?: TripSummaryData | null
  itinerary: MissionBriefingDay[]
  itineraryMotionKey: number
  gearItems: JourneyPackLine[]
  onToggleGearChecked: (id: string) => void
  onSetGearItemAction: (id: string, action: 'Bring' | 'Rent') => void
  onRemoveGearItem: (id: string) => void
  onAddGearItem: (text: string, action: 'Bring' | 'Rent') => void
  mergedHub: IntelligenceHubSnapshot
  linkDrafts: Record<HubCategory, { label: string; url: string }>
  setLinkDrafts: Dispatch<SetStateAction<Record<HubCategory, { label: string; url: string }>>>
  addManualLink: (category: HubCategory) => void
  updateManualLink: (category: HubCategory, id: string, next: { label: string; href: string }) => void
  deleteManualLink: (category: HubCategory, id: string) => void
  /** Sticky bar under the trip plan (embedded column only). */
  embeddedFooter?: ReactNode
  /** Scroll target for “View full journey”. */
  embeddedTripPlanScrollRef?: RefObject<HTMLDivElement | null>
  /** True while the first itinerary is being generated (bootstrap /api/chat). */
  itineraryLoading?: boolean
  /** Resolved travel intent (session `travelIntent` or trip role). */
  travelPurpose?: TravelIntent
  /** Journey panel: show full day-by-day plan without collapse toggle. */
  itineraryAlwaysExpanded?: boolean
}

const fontBody = 'var(--font-body)'
const fontMono = 'var(--font-mono)'

const sectionMutedPlaceholderStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--text-muted)',
  fontStyle: 'italic',
  fontFamily: fontBody,
}

function SectionMutedPlaceholder({ children }: { children: string }) {
  return <p style={sectionMutedPlaceholderStyle}>{children}</p>
}

function displayTypicalWeather(location: MatrixLocationData): string {
  const raw = location.typicalWeather?.trim()
  if (raw && !/water\s*temperature/i.test(raw)) return raw.slice(0, 120)
  const fallback = typicalWeatherFallback(location)
  if (/water\s*temperature/i.test(fallback)) {
    const seasonBit = location.season.split(/[·,]/)[0]?.trim() ?? 'Year-round'
    return `${seasonBit}: check live forecasts — humidity shifts daily.`.slice(0, 120)
  }
  return fallback.slice(0, 120)
}

function WhyThisSpotRichText({ text, boldPhrase }: { text: string; boldPhrase?: string }) {
  const bp = boldPhrase?.trim()
  if (!bp) return <>{text}</>
  const idx = text.indexOf(bp)
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{bp}</strong>
      {text.slice(idx + bp.length)}
    </>
  )
}

function hasTripRhythmData(rhythm: MatrixLocationData['tripRhythm']): boolean {
  if (!rhythm) return false
  return Boolean(
    rhythm.morning?.trim() ||
      rhythm.afternoon?.trim() ||
      rhythm.evening?.trim() ||
      rhythm.night?.trim()
  )
}

function JourneyGauge({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <svg width={80} height={80} viewBox="0 0 80 80" className="pointer-events-none absolute inset-0 -rotate-90" aria-hidden>
          <circle cx={40} cy={40} r={35} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
          <circle
            cx={40}
            cy={40}
            r={35}
            fill="none"
            stroke="#C17D3C"
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={gaugeArcDash(percent)}
          />
        </svg>
        <span
          className="relative z-10 text-[18px] font-medium tabular-nums"
          style={{ color: 'var(--brand-text)', fontFamily: fontBody }}
        >
          {Math.round(percent)}
        </span>
      </div>
      <span className="mt-2 text-center text-[11px]" style={{ color: 'var(--text-muted)', fontFamily: fontBody }}>
        {label}
      </span>
    </div>
  )
}

function JourneyVibeIndicator({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="flex min-w-0 flex-col items-start">
      <div className="flex shrink-0 items-center" style={{ color: 'var(--text-muted)' }}>
        {icon}
      </div>
      <p className="mb-1 mt-[10px] text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)', fontFamily: fontBody }}>
        {label}
      </p>
      <p className="text-[15px] font-medium leading-snug" style={{ color: 'var(--text-primary)', fontFamily: fontBody }}>
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-muted)', fontFamily: fontBody }}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function ItineraryDayPreview({ day }: { day: { day: number; title: string; activities: string[] } }) {
  const previewActs = day.activities.slice(0, 2)
  return (
    <div className="flex gap-5 pb-2">
      <span
        className="shrink-0 pt-[3px] font-mono text-[11px] tabular-nums"
        style={{ color: 'var(--text-muted)', minWidth: 28, fontFamily: fontMono }}
      >
        {String(day.day).padStart(2, '0')}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="mb-2 font-serif text-base font-normal md:text-[16px]" style={{ color: 'var(--text-primary)' }}>
          {day.title}
        </h3>
        {previewActs.map((act, i) => (
          <div key={`${day.day}-p-${i}`} className="mb-1.5 flex items-start gap-2.5">
            <span className="mt-[6px] h-[3px] w-[3px] shrink-0 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
            <span className="text-[13px] leading-[1.5]" style={{ fontFamily: fontBody, color: 'var(--text-secondary)' }}>
              {act}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function transportBadgeStyle(type: LocalTransportMode): { color: string; borderColor: string } {
  switch (type) {
    case 'rideshare':
      return { color: 'var(--brand-text)', borderColor: 'rgba(193,125,60,0.4)' }
    case 'public':
      return { color: 'rgba(100,180,255,0.8)', borderColor: 'rgba(100,180,255,0.3)' }
    case 'rental':
      return { color: 'rgba(150,220,150,0.8)', borderColor: 'rgba(150,220,150,0.3)' }
    case 'walking':
      return { color: 'var(--text-muted)', borderColor: 'var(--border)' }
    case 'ferry':
    default:
      return { color: 'rgba(150,200,255,0.8)', borderColor: 'rgba(150,200,255,0.3)' }
  }
}

function TransportTypeBadge({ type }: { type: LocalTransportMode }) {
  const badge = transportBadgeStyle(type)
  const badgeLabel = type.replace(/-/g, ' ').toUpperCase()
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center uppercase"
      style={{
        fontFamily: fontBody,
        fontSize: 10,
        letterSpacing: '0.06em',
        lineHeight: 1,
        minHeight: 18,
        padding: '0 8px',
        borderRadius: 2,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: badge.borderColor,
        color: badge.color,
      }}
    >
      {badgeLabel}
    </span>
  )
}

function parseActivityCoordinates(name: string): { cleanName: string; mapHref: string | null } {
  const match = name.match(/\(lat\s*([-\d.]+)\s*,\s*lon\s*([-\d.]+)\)/i)
  if (!match) return { cleanName: name.trim(), mapHref: null }
  const cleanName = name.replace(match[0], '').replace(/\s{2,}/g, ' ').trim()
  const lat = match[1]
  const lon = match[2]
  return { cleanName, mapHref: `https://www.google.com/maps?q=${lat},${lon}` }
}

function stripCoordinates(value: string): string {
  return value.replace(/\(lat\s*[-\d.]+\s*,\s*lon\s*[-\d.]+\)/gi, '').replace(/\s{2,}/g, ' ').trim()
}

function truncateUrl(url: string): string {
  if (url.length <= 30) return url
  return `${url.slice(0, 30)}...`
}

function stripYearBriefing(dateStr: string): string {
  return sentenceCase(dateStr.replace(/\b(20\d{2})\b/g, '').trim())
}

function journeyVibeThirdIcon(variant: ConfirmVibeThirdVariant) {
  const strokeCls = 'stroke-zinc-500'
  switch (variant) {
    case 'route_running':
      return <IconRoute size={18} stroke={1.25} className="text-zinc-500" />
    case 'waves_water':
      return <Waves size={18} className={strokeCls} />
    case 'flower_wellness':
      return <Flower2 size={18} className={strokeCls} />
    case 'mountain_alpine':
      return <Mountain size={18} className={strokeCls} />
    case 'carabiner_climbing':
      return <Cable size={18} className={strokeCls} />
    default:
      return <Star size={18} className={strokeCls} />
  }
}

function BriefingFact({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2">{icon}</div>
      <p className="mt-2.5 text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)', fontFamily: fontBody }}>
        {label}
      </p>
      <div className="mt-1 text-[14px] leading-snug" style={{ color: 'var(--text-primary)', fontFamily: fontBody }}>
        {value}
      </div>
    </div>
  )
}

function gearLineBringRent(line: JourneyPackLine): 'Bring' | 'Rent' {
  return line.action === 'Rent' ? 'Rent' : 'Bring'
}

function BringRentPills({
  value,
  onChange,
}: {
  value: 'Bring' | 'Rent'
  onChange: (next: 'Bring' | 'Rent') => void
}) {
  const pillBase: CSSProperties = {
    fontSize: 10,
    padding: '0 8px',
    minHeight: 18,
    borderRadius: 2,
    fontFamily: fontBody,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    border: '1px solid var(--border)',
    background: 'transparent',
  }
  const active: CSSProperties = {
    background: 'var(--brand-dim)',
    border: '1px solid var(--brand)',
    color: 'var(--brand-text)',
  }
  const inactive: CSSProperties = {
    color: 'var(--text-muted)',
  }

  return (
    <span className="inline-flex shrink-0 gap-1" role="group" aria-label="Bring or rent">
      {(['Bring', 'Rent'] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          style={{ ...pillBase, ...(value === opt ? active : inactive) }}
        >
          {opt}
        </button>
      ))}
    </span>
  )
}

function GearCheckItemRow({
  line,
  onToggleChecked,
  onSetAction,
  onRemove,
}: {
  line: JourneyPackLine
  onToggleChecked: () => void
  onSetAction: (action: 'Bring' | 'Rent') => void
  onRemove: () => void
}) {
  const display = sanitizeGearPackItemText(line.text)
  const inputId = `gear-${line.id}`
  const bringRent = gearLineBringRent(line)

  return (
    <div
      className="flex items-center gap-3"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <button
        type="button"
        id={inputId}
        onClick={onToggleChecked}
        aria-checked={line.checked}
        role="checkbox"
        className="flex shrink-0 items-center justify-center transition-colors"
        style={{
          width: 16,
          height: 16,
          border: `1px solid ${line.checked ? 'var(--brand)' : 'var(--border)'}`,
          borderRadius: 2,
          background: line.checked ? 'var(--brand)' : 'transparent',
        }}
      >
        {line.checked ? (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </button>
      <span className="min-w-0 flex-1 text-[13px]" style={{ fontFamily: fontBody, color: 'var(--text-primary)' }}>
        {display}
      </span>
      <BringRentPills value={bringRent} onChange={onSetAction} />
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 border-0 bg-transparent p-0 text-[12px] transition-colors hover:text-[var(--text-primary)]"
        style={{ fontFamily: fontBody, color: 'var(--text-muted)', cursor: 'pointer' }}
        aria-label={`Remove ${display}`}
      >
        ×
      </button>
    </div>
  )
}

function HubSection({
  category,
  title,
  links,
  draft,
  onDraftChange,
  onAdd,
  onUpdateLink,
  onDeleteLink,
}: {
  category: HubCategory
  title: string
  links: HubLinkItem[]
  draft: { label: string; url: string }
  onDraftChange: (next: { label: string; url: string }) => void
  onAdd: () => void
  onUpdateLink: (category: HubCategory, id: string, next: { label: string; href: string }) => void
  onDeleteLink: (category: HubCategory, id: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ label: '', url: '' })
  const [removingIds, setRemovingIds] = useState<string[]>([])

  const { presetLinks, userLinks } = splitHubLinksForDisplay(links)

  const l4: CSSProperties = {
    fontSize: 11,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    fontFamily: fontBody,
    marginBottom: 12,
  }

  const inputStyle: CSSProperties = {
    height: 34,
    fontSize: 13,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    borderRadius: 2,
    color: 'var(--text-primary)',
    padding: '0 10px',
    fontFamily: fontBody,
  }

  return (
    <div className="mb-10 last:mb-0">
      <p style={l4}>{title}</p>

      <div className="mb-3 flex flex-wrap gap-2">
        {presetLinks.map((link) => (
          <a
            key={link.id}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center px-[14px] py-[7px] text-[12px] transition-colors"
            style={{
              fontFamily: fontBody,
              border: '1px solid var(--border)',
              borderRadius: 2,
              color: 'var(--text-secondary)',
              background: 'transparent',
              textDecoration: 'none',
            }}
          >
            {link.label}
          </a>
        ))}
      </div>

      {userLinks.length > 0 ? (
        <div className="mb-4 space-y-2">
          {userLinks.map((link) => {
            const removing = removingIds.includes(link.id)
            const isEditing = editingId === link.id
            return (
              <div
                key={link.id}
                className="overflow-hidden transition-all duration-200 ease-out"
                style={{
                  opacity: removing ? 0 : 1,
                  maxHeight: removing ? 0 : 120,
                }}
              >
                {isEditing ? (
                  <div className="flex flex-wrap items-stretch gap-2">
                    <input
                      type="text"
                      value={editDraft.label}
                      onChange={(e) => setEditDraft((d) => ({ ...d, label: e.target.value }))}
                      placeholder="Label"
                      className="min-w-[100px] flex-1"
                      style={inputStyle}
                    />
                    <input
                      type="url"
                      value={editDraft.url}
                      onChange={(e) => setEditDraft((d) => ({ ...d, url: e.target.value }))}
                      placeholder="https://"
                      className="min-w-[160px] flex-[2]"
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const label = editDraft.label.trim()
                        const href = editDraft.url.trim()
                        if (!label || !href) return
                        onUpdateLink(category, link.id, { label, href })
                        setEditingId(null)
                      }}
                      className="shrink-0 px-4 py-2 text-[12px]"
                      style={{ fontFamily: fontBody, border: '1px solid var(--border)', borderRadius: 2, color: 'var(--text-secondary)' }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="shrink-0 px-4 py-2 text-[12px]"
                      style={{ fontFamily: fontBody, border: '1px solid var(--border)', borderRadius: 2, color: 'var(--text-muted)' }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="text-[13px]" style={{ fontFamily: fontBody, color: 'var(--text-primary)' }}>
                      {link.label}
                    </span>
                    <span className="text-[11px]" style={{ fontFamily: fontBody, color: 'var(--text-muted)' }}>
                      {truncateUrl(link.href)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(link.id)
                        setEditDraft({ label: link.label, url: link.href })
                      }}
                      className="text-[12px] transition-colors hover:opacity-80"
                      style={{ fontFamily: fontBody, color: 'var(--text-secondary)' }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRemovingIds((ids) => [...ids, link.id])
                        window.setTimeout(() => onDeleteLink(category, link.id), 200)
                      }}
                      className="ml-auto text-[14px] leading-none transition-colors hover:opacity-80"
                      style={{ fontFamily: fontBody, color: 'var(--text-muted)' }}
                      aria-label={`Delete ${link.label}`}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={draft.label}
          onChange={(e) => onDraftChange({ ...draft, label: e.target.value })}
          placeholder="Label"
          className="min-w-[100px] flex-1"
          style={inputStyle}
        />
        <input
          type="url"
          value={draft.url}
          onChange={(e) => onDraftChange({ ...draft, url: e.target.value })}
          placeholder="https://"
          className="min-w-[140px] flex-[2]"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 px-4 py-2 text-[12px]"
          style={{ fontFamily: fontBody, border: '1px solid var(--border)', borderRadius: 2, color: 'var(--text-secondary)', background: 'transparent' }}
        >
          Add →
        </button>
      </div>
    </div>
  )
}

export function JourneyMissionBriefingPanel({
  variant,
  location,
  refine,
  tripSummary,
  itinerary,
  itineraryMotionKey,
  gearItems,
  onToggleGearChecked,
  onSetGearItemAction,
  onRemoveGearItem,
  onAddGearItem,
  mergedHub,
  linkDrafts,
  setLinkDrafts,
  addManualLink,
  updateManualLink,
  deleteManualLink,
  embeddedFooter,
  embeddedTripPlanScrollRef,
  itineraryLoading = false,
  travelPurpose: travelPurposeProp,
  itineraryAlwaysExpanded = false,
}: JourneyMissionBriefingPanelProps) {
  const [draftGearText, setDraftGearText] = useState('')
  const [draftGearAction, setDraftGearAction] = useState<'Bring' | 'Rent'>('Bring')
  const [itineraryExpanded, setItineraryExpanded] = useState(itineraryAlwaysExpanded)

  const mobilityRows = useMemo(
    () =>
      mergeLocalTransportForLocation({
        localTransport: location.localTransport,
        transportOptions: location.transportOptions,
        name: location.name,
        country: location.country,
      }),
    [location.localTransport, location.transportOptions, location.name, location.country]
  )
  const introGettingAround = scrubActivityZones(location.activityZones, location)

  const packColumnItems = useMemo(() => gearItems.filter((line) => !isRentGearLine(line)), [gearItems])
  const rentColumnItems = useMemo(() => gearItems.filter((line) => isRentGearLine(line)), [gearItems])

  const tripFactsDays =
    refine.durationDays != null && refine.durationDays > 0
      ? refine.durationDays
      : itinerary.length > 0
        ? itinerary.length
        : 5
  const heuristicBudget =
    refine.budgetRange === 'LUXE' ? '$400+' : refine.budgetRange === 'MID-RANGE' ? '$150-300' : '$70-140'
  const travelPurpose = travelPurposeProp ?? travelPurposeFromTripRole(refine.tripRole)

  const briefingContent = useMemo(
    () =>
      buildJourneyBriefingPdfContent({
        location,
        refine: {
          budgetRange: refine.budgetRange,
          skillLevel: refine.skillLevel,
          durationDays: tripFactsDays,
          tripRole: refine.tripRole,
        },
        tripSummary,
        itinerary,
        gearItems,
        mergedHub,
        travelPurpose,
      }),
    [
      location,
      refine.budgetRange,
      refine.skillLevel,
      refine.tripRole,
      tripFactsDays,
      tripSummary,
      itinerary,
      gearItems,
      mergedHub,
      travelPurpose,
    ]
  )

  const heroMetaLine = briefingContent.heroMetaLine
  const whyThisSpotDisplayLines = briefingContent.whyThisSpot
  const dailyBudgetStr = dailyBudgetDisplayForTier(location, refine.budgetRange, heuristicBudget).slice(0, 80)

  const budgetEstimateDisplay = useMemo(() => {
    const fromSummary = tripSummary?.totalBudget?.trim()
    if (fromSummary) {
      return { primary: fromSummary, secondary: `${tripFactsDays} days · Essential tier estimate` }
    }
    const totalLine = formatTripBudgetTotalEstimate(location, refine.budgetRange, tripFactsDays, heuristicBudget)
    const range = parseDailyBudgetUsdRange(dailyBudgetStr)
    if (!range) {
      return {
        primary: totalLine,
        secondary: `${tripFactsDays} days · total depends on your daily spend band`,
      }
    }
    return {
      primary: totalLine,
      secondary: `~$${formatUsdInteger(range.min)}–${formatUsdInteger(range.max)} / day · ${tripFactsDays} days`,
    }
  }, [tripSummary?.totalBudget, location, refine.budgetRange, tripFactsDays, heuristicBudget, dailyBudgetStr])

  const itineraryPreviewDays = useMemo(
    () =>
      itinerary.map((day) => ({
        day: day.day,
        title: day.title?.trim() ? day.title : `Day ${day.day}`,
        activities: (day.activities ?? []).map((a) => stripCoordinates(a?.name ?? '').trim() || 'Activity'),
      })),
    [itinerary]
  )

  const nightSafety = location.nightSafety ?? 60
  const communityDensity = location.communityDensity ?? 55
  const infrastructureScore = location.infrastructureScore ?? 60
  const vibeThird = useMemo(
    () => getConfirmVibeThird(location.activity, infrastructureScore, communityDensity),
    [location.activity, infrastructureScore, communityDensity]
  )
  const soloPct = Math.min(100, Math.max(0, location.soloIndex))
  const womenPct = Math.min(100, Math.max(0, location.womenFriendly))

  const airportLine = useMemo(
    () => airportFactLineForLocation(location),
    [location.name, location.country, location.nearestAirport]
  )

  const bestSeason = formatBestSeasonDisplay(location.bestSeason, sentenceCase(location.season)).slice(0, 120)
  const typicalWeather = displayTypicalWeather(location)
  const tripRhythm = location.tripRhythm
  const travelerDensity = travelerDensityDisplay(communityDensity, infrastructureScore)
  const sectionLabelMuted = { color: 'rgba(255,255,255,0.3)' } as const

  const visaHref = visaRequirementsGoogleHref(location.country)

  const experienceMapQuery = [location.primaryTitle || location.name, location.country].filter(Boolean).join(', ')

  useEffect(() => {
    setItineraryExpanded(itineraryAlwaysExpanded)
  }, [itineraryMotionKey, itineraryAlwaysExpanded])

  useEffect(() => {
    const locItin = (location as MatrixLocationData & { itinerary?: unknown }).itinerary
    console.log('Journey sections check:', {
      hasEvents: !!location?.upcomingEvents?.length,
      hasRhythm: !!location?.tripRhythm,
      hasItinerary: !!(Array.isArray(locItin) && locItin.length > 0) || itinerary.length > 0,
      hasGear: gearItems.length > 0,
      hasTransport: !!(location?.localTransport?.length),
      hasWhyThisSpot: !!(location?.whyThisSpotLines?.length || location?.whyThisSpot),
    })
  }, [location, itinerary, gearItems])

  const scrollPadBottom =
    variant === 'overlay' ? 'pb-20' : embeddedFooter ? 'pb-12' : 'pb-8'

  const colClass =
    variant === 'overlay'
      ? 'w-full flex flex-col flex-1 min-h-0 overflow-hidden bg-[var(--bg)]'
      : 'w-full flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg)] lg:h-full lg:max-h-full'

  const heroImageSrc =
    location?.image?.trim() && /^https:\/\/images\.unsplash\.com\//i.test(location.image.trim())
      ? location.image.trim()
      : ''

  return (
    <div className={colClass} style={{ background: 'var(--bg)', color: 'var(--text-secondary)' }}>
      <div
        className="relative h-[200px] w-full shrink-0 overflow-hidden"
        style={{
          background: heroImageSrc
            ? undefined
            : 'linear-gradient(145deg, rgba(30,35,45,0.95) 0%, rgba(18,22,28,1) 100%)',
        }}
      >
        {heroImageSrc ? (
          <Image
            src={heroImageSrc}
            alt={`${location?.name ?? 'Destination'}, ${location?.country ?? ''}`}
            fill
            className="object-cover object-center"
            priority={variant === 'embedded'}
            sizes={variant === 'overlay' ? '100vw' : '(max-width: 1024px) 100vw, 65vw'}
          />
        ) : null}
        <div className="absolute inset-0 z-[1]" style={{ background: 'rgba(0,0,0,0.5)' }} />
        <div className="absolute bottom-0 left-0 z-[2] px-6 pb-6 pt-16 md:px-10 md:pb-10">
          <h1
            className="mb-2 font-serif text-[36px] font-normal leading-tight tracking-tight"
            style={{
              fontFamily: 'var(--font-serif, var(--font-display))',
              color: '#fff',
            }}
          >
            {location?.name?.trim() ? location.name : 'Your destination'}
          </h1>
          <p className="text-[13px]" style={{ fontFamily: fontBody, color: 'rgba(255,255,255,0.6)' }}>
            {heroMetaLine}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={variant === 'embedded' ? embeddedTripPlanScrollRef : undefined}
          className={`min-h-0 flex-1 overflow-y-auto px-6 md:px-10 lg:px-10 ${scrollPadBottom}`}
          style={{ background: 'var(--bg)' }}
        >
        <motion.div
          key={itineraryMotionKey}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Vibe Index — matches Confirm */}
          <div
            className="border-b border-[var(--border)] px-8 py-10 md:px-10"
            style={{ background: 'var(--bg-secondary)' }}
          >
            <div className="flex items-center gap-2">
              <p className="playce-section-label m-0" style={sectionLabelMuted}>
                VIBE INDEX
              </p>
              <span className="group relative cursor-default" aria-label="About vibe index">
                <Info size={11} className="text-zinc-500" />
                <span
                  className="pointer-events-none absolute left-0 top-6 z-20 w-[260px] opacity-0 transition-opacity group-hover:opacity-100"
                  style={{
                    background: '#1a1a1a',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 'var(--radius)',
                    padding: '10px 14px',
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.5)',
                    lineHeight: 1.6,
                    fontFamily: fontBody,
                  }}
                >
                  Scores are AI-estimated based on destination characteristics and traveler patterns. They reflect general
                  tendencies, not real-time conditions. Always verify with current travel advisories.
                </span>
              </span>
            </div>
            <div className="mt-6 flex flex-col items-stretch gap-10 lg:flex-row lg:items-center">
              <div className="flex shrink-0 justify-center gap-8">
                <JourneyGauge label="Solo-friendly" percent={soloPct} />
                <JourneyGauge label="Women-friendly" percent={womenPct} />
              </div>
              <div
                className="hidden w-px shrink-0 bg-[var(--border)] lg:block lg:self-center"
                style={{ height: 120, marginLeft: 40, marginRight: 40 }}
                aria-hidden
              />
              <div className="grid min-w-0 flex-1 grid-cols-2 content-start" style={{ rowGap: 24, columnGap: 32 }}>
                <JourneyVibeIndicator
                  icon={<Shield strokeWidth={1.5} size={18} />}
                  label="Safety feeling"
                  value={safetyFeelingLabel(nightSafety)}
                />
                <JourneyVibeIndicator
                  icon={<Users strokeWidth={1.5} size={18} />}
                  label="Social openness"
                  value={socialOpennessLabel(communityDensity)}
                />
                <JourneyVibeIndicator
                  icon={journeyVibeThirdIcon(vibeThird.variant)}
                  label={vibeThird.label}
                  value={vibeThird.value}
                />
                <JourneyVibeIndicator
                  icon={<Footprints strokeWidth={1.5} size={18} />}
                  label="Traveler density"
                  value={travelerDensity.value}
                  hint={travelerDensity.hint}
                />
              </div>
            </div>
            <p className="text-[11px]" style={{ marginTop: 16, fontFamily: fontBody, color: 'var(--text-muted)' }}>
              Indicative only. Not a guarantee of safety.
            </p>
          </div>

          {/* Fast Facts — matches Confirm */}
          <div className="border-b border-[var(--border)] bg-[var(--bg)] px-8 py-10 md:px-10">
            <p className="playce-section-label mb-6" style={sectionLabelMuted}>
              FAST FACTS
            </p>
            <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              <BriefingFact icon={<Plane size={20} className="stroke-zinc-500" />} label="Nearest airport" value={airportLine} />
              <div>
                <div className="flex items-center gap-2">
                  <IdCard size={20} className="stroke-zinc-500" />
                </div>
                <p className="mt-2.5 text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)', fontFamily: fontBody }}>
                  Visa
                </p>
                <a
                  href={visaHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block text-[14px] leading-snug no-underline"
                  style={{ color: 'var(--brand-text)', fontFamily: fontBody }}
                >
                  Check requirements →
                </a>
                <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--text-muted)', fontFamily: fontBody }}>
                  Rules vary by passport — verify before booking.
                </p>
              </div>
              <BriefingFact icon={<Calendar size={20} className="stroke-zinc-500" />} label="Best season" value={bestSeason || '—'} />
              <BriefingFact icon={<Clock size={20} className="stroke-zinc-500" />} label="Ideal trip length" value={`${tripFactsDays} days`} />
              <div>
                <div className="flex items-center gap-2">
                  <Wallet size={20} className="stroke-zinc-500" />
                </div>
                <p className="mt-2.5 text-[11px] uppercase tracking-[0.08em]" style={{ color: 'var(--text-muted)', fontFamily: fontBody }}>
                  Budget estimate
                </p>
                <p className="mt-1 text-[14px] leading-snug" style={{ color: 'var(--text-primary)', fontFamily: fontBody }}>
                  {budgetEstimateDisplay.primary}
                </p>
                <p className="text-[12px] leading-snug" style={{ marginTop: 3, color: 'var(--text-muted)', fontFamily: fontBody }}>
                  {budgetEstimateDisplay.secondary}
                </p>
              </div>
              <BriefingFact icon={<ThermometerSun size={20} className="stroke-zinc-500" />} label="Typical weather" value={typicalWeather} />
            </div>
            <p
              className="text-[11px] leading-relaxed italic"
              style={{ marginTop: 12, color: 'var(--text-muted)', fontFamily: fontBody }}
            >
              Estimates cover accommodation, food, local transport, and activity costs. Flights not included.
            </p>
          </div>

          {/* Events & Races — matches Confirm */}
          <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 pb-6 pt-10 md:px-10">
            <EventsAndRacesSection
              travelPurpose={travelPurpose}
              location={location}
              labelStyle={sectionLabelMuted}
              formatDateLine={stripYearBriefing}
            />
          </div>

          {/* Why this spot — matches Confirm */}
          <div
            className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-10 md:px-10"
          >
            <p className="playce-section-label mb-5" style={sectionLabelMuted}>
              WHY THIS SPOT
            </p>
            {whyThisSpotDisplayLines.length > 0 ? (
              <ul className="m-0 list-none p-0">
                {whyThisSpotDisplayLines.map((row, idx) => (
                  <li
                    key={`${row.text.slice(0, 24)}-${idx}`}
                    className="flex items-start gap-[14px] border-b border-[var(--border)] py-3 last:border-b-0"
                  >
                    <span className="shrink-0 pt-px text-[16px] leading-none" aria-hidden>
                      {row.icon}
                    </span>
                    <p
                      className="m-0 min-w-0 flex-1 text-[14px] leading-[1.5]"
                      style={{ color: 'var(--text-secondary)', fontFamily: fontBody }}
                    >
                      <WhyThisSpotRichText text={row.text} boldPhrase={row.boldPhrase} />
                    </p>
                  </li>
                ))}
              </ul>
            ) : location.whyThisSpot?.trim() ? (
              <p className="text-[14px] leading-relaxed" style={{ fontFamily: fontBody, color: 'var(--text-secondary)' }}>
                {location.whyThisSpot.trim()}
              </p>
            ) : (
              <SectionMutedPlaceholder>Why this spot not available.</SectionMutedPlaceholder>
            )}
          </div>

          {/* Trip rhythm + suggested itinerary (Confirm-style toggle; full detail on Journey) */}
          <div className="border-b border-[var(--border)] bg-[var(--bg)] px-8 py-10 md:px-10">
            <p className="playce-section-label mb-3" style={sectionLabelMuted}>
              TRIP RHYTHM
            </p>
            <p className="mb-5 text-[13px] leading-relaxed" style={{ fontFamily: fontBody, color: 'var(--text-secondary)' }}>
              {tripRhythmLeadCopy(location.activity)}
            </p>
            {hasTripRhythmData(tripRhythm) ? (
              <div className="mb-10 space-y-4">
                {(
                  [
                    { key: 'morning' as const, label: 'Morning', Icon: Sunrise },
                    { key: 'afternoon' as const, label: 'Afternoon', Icon: Sun },
                    { key: 'evening' as const, label: 'Evening', Icon: Sunset },
                    { key: 'night' as const, label: 'Night', Icon: Moon },
                  ] as const
                ).map(({ key, label, Icon }) => {
                  const text = tripRhythm?.[key]?.trim()
                  if (!text) return null
                  return (
                    <div key={key} className="flex gap-3">
                      <Icon size={18} className="mt-0.5 shrink-0 stroke-zinc-500" aria-hidden />
                      <div className="min-w-0">
                        <p
                          className="text-[11px] uppercase tracking-[0.08em]"
                          style={{ color: 'var(--text-muted)', fontFamily: fontBody }}
                        >
                          {label}
                        </p>
                        <p className="mt-1 text-[14px] leading-snug" style={{ fontFamily: fontBody, color: 'var(--text-secondary)' }}>
                          {text}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mb-10">
                <SectionMutedPlaceholder>Trip rhythm not available.</SectionMutedPlaceholder>
              </div>
            )}

            <>
                <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
                  <p className="playce-section-label m-0" style={sectionLabelMuted}>
                    SUGGESTED ITINERARY
                  </p>
                  {itinerary.length > 0 && !itineraryAlwaysExpanded ? (
                    <button
                      type="button"
                      onClick={() => setItineraryExpanded((v) => !v)}
                      className="cursor-pointer border-0 bg-transparent p-0 text-[13px] transition-opacity hover:opacity-90"
                      style={{ color: 'var(--text-secondary)', fontFamily: fontBody }}
                    >
                      {itineraryExpanded ? 'Hide itinerary ↑' : 'View full itinerary →'}
                    </button>
                  ) : null}
                </div>

                {itinerary.length > 0 ? (
                  itineraryExpanded || itineraryAlwaysExpanded ? (
                    itinerary.map((day) => (
                      <div
                        key={day.day}
                        className="mb-10 border-b pb-8 last:mb-0 last:border-b-0"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <div className="mb-6 flex flex-wrap items-baseline gap-4">
                          <span
                            className="font-mono text-[12px] tabular-nums uppercase"
                            style={{ fontFamily: fontMono, color: 'var(--text-muted)', fontWeight: 400 }}
                          >
                            DAY {(day.day ?? 0).toString().padStart(2, '0')}
                          </span>
                          <span
                            className="font-serif text-[20px] font-normal leading-snug"
                            style={{ fontFamily: 'var(--font-serif,var(--font-display))', color: 'var(--text-primary)' }}
                          >
                            {day.title?.trim() ? day.title : `Day ${day.day}`}
                          </span>
                        </div>

                        <div>
                          {(day.activities ?? []).map((activity, actIndex) => {
                            const rowKey = `d${day.day}-a${actIndex}`
                            const { cleanName: cn, mapHref } = parseActivityCoordinates(activity?.name ?? '')
                            const nameNode = mapHref ? (
                              <a
                                href={mapHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group inline-flex items-center gap-1 no-underline hover:underline"
                                style={{ color: 'inherit' }}
                              >
                                {cn}
                                <span className="text-[10px] opacity-0 transition-opacity group-hover:opacity-100">↗</span>
                              </a>
                            ) : (
                              cn
                            )
                            const subPieces = [activity.sportReason, activity.transport].filter(Boolean)
                            const costText = itineraryCostDisplayText(cn, activity?.price)
                            return (
                              <div
                                key={rowKey}
                                className="grid items-start gap-4 border-b py-2.5 first:pt-0"
                                style={{
                                  gridTemplateColumns: '64px 1fr auto',
                                  borderColor: 'rgba(255,255,255,0.04)',
                                }}
                              >
                                <div
                                  className="mono pt-[2px] text-[12px] tabular-nums"
                                  style={{ fontFamily: fontMono, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
                                >
                                  {activity?.time?.trim() ? activity.time : '—'}
                                </div>
                                <div className="min-w-0">
                                  <p
                                    className="mb-[3px] text-[14px] font-medium leading-snug"
                                    style={{ fontFamily: fontBody, color: 'var(--text-primary)' }}
                                  >
                                    {nameNode}
                                  </p>
                                  {subPieces.length > 0 ? (
                                    <p
                                      className="text-[12px] italic leading-snug"
                                      style={{ fontFamily: fontBody, color: 'var(--text-muted)', lineHeight: 1.5 }}
                                    >
                                      {subPieces.join(' · ')}
                                    </p>
                                  ) : null}
                                </div>
                                <div
                                  className="mono pt-[2px] whitespace-nowrap text-right text-[12px] tabular-nums"
                                  style={{
                                    fontFamily: fontMono,
                                    color: 'var(--text-muted)',
                                    minWidth: costText ? undefined : 0,
                                  }}
                                >
                                  {costText ?? ''}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div
                      className="overflow-hidden transition-[max-height] duration-300 ease-out"
                      style={{ maxHeight: 120 }}
                    >
                      <div
                        style={{
                          maxHeight: 120,
                          overflow: 'hidden',
                          WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                          maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                        }}
                      >
                        {itineraryPreviewDays[0] ? (
                          <ItineraryDayPreview day={itineraryPreviewDays[0]} />
                        ) : (
                          <SectionMutedPlaceholder>Itinerary preview not available.</SectionMutedPlaceholder>
                        )}
                      </div>
                      <p
                        className="mb-0 mt-3 text-[12px] italic"
                        style={{ color: 'var(--text-muted)', fontFamily: fontBody }}
                      >
                        Open the full itinerary for times, costs, and day-by-day detail.
                      </p>
                    </div>
                  )
                ) : (
                  <SectionMutedPlaceholder>
                    {itineraryLoading ? 'Loading itinerary…' : 'Itinerary not available yet.'}
                  </SectionMutedPlaceholder>
                )}
            </>
          </div>

          {/* Ways to Experience It — matches Confirm */}
          <div className="border-b border-[var(--border)] bg-[var(--bg)] px-8 py-10 md:px-10">
            <WaysToExperienceSection
              travelPurpose={travelPurpose}
              budget={refine.budgetRange}
              activityType={location.activity}
              destinationName={location.name}
              season={location.season}
              mapQuery={experienceMapQuery}
              cards={briefingContent.waysToExperience}
              labelStyle={sectionLabelMuted}
            />
          </div>

          {/* Journey-only: Gear check */}
          <div className="border-b border-[var(--border)] px-8 pb-10 pt-10 md:px-10">
            <p className="playce-section-label" style={{ ...sectionLabelMuted, marginBottom: 20 }}>
              GEAR CHECK
            </p>

            <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
              <div className="min-w-0">
                <p
                  style={{
                    fontFamily: fontBody,
                    fontSize: 11,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    marginBottom: 12,
                  }}
                >
                  Pack
                </p>
                {packColumnItems.length === 0 ? (
                  <SectionMutedPlaceholder>Gear checklist not available.</SectionMutedPlaceholder>
                ) : (
                  packColumnItems.map((line) => (
                    <GearCheckItemRow
                      key={line.id}
                      line={line}
                      onToggleChecked={() => onToggleGearChecked(line.id)}
                      onSetAction={(action) => onSetGearItemAction(line.id, action)}
                      onRemove={() => onRemoveGearItem(line.id)}
                    />
                  ))
                )}
              </div>
              <div className="min-w-0">
                <p
                  style={{
                    fontFamily: fontBody,
                    fontSize: 11,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    marginBottom: 12,
                  }}
                >
                  Rent
                </p>
                {rentColumnItems.length === 0 ? (
                  <p className="text-[13px] italic" style={{ fontFamily: fontBody, color: 'var(--text-muted)' }}>
                    No rental items yet — switch an item to Rent or add one below.
                  </p>
                ) : (
                  rentColumnItems.map((line) => (
                    <GearCheckItemRow
                      key={line.id}
                      line={line}
                      onToggleChecked={() => onToggleGearChecked(line.id)}
                      onSetAction={(action) => onSetGearItemAction(line.id, action)}
                      onRemove={() => onRemoveGearItem(line.id)}
                    />
                  ))
                )}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} aria-hidden />

            <p
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: 10,
                fontFamily: fontBody,
              }}
            >
              Add your own
            </p>
            {gearItems.length < JOURNEY_PACK_MAX_BRING ? (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  onAddGearItem(draftGearText, draftGearAction)
                  setDraftGearText('')
                }}
              >
                <input
                  value={draftGearText}
                  onChange={(e) => setDraftGearText(e.target.value)}
                  placeholder="e.g. reef boots, sunscreen..."
                  className="min-w-[140px] flex-1 outline-none"
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 2,
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    padding: '8px 12px',
                    fontFamily: fontBody,
                  }}
                />
                <BringRentPills value={draftGearAction} onChange={setDraftGearAction} />
                <button
                  type="submit"
                  className="shrink-0 transition-colors hover:border-white/25"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    borderRadius: 2,
                    padding: '8px 14px',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: fontBody,
                  }}
                >
                  Add
                </button>
              </form>
            ) : (
              <p className="text-[13px]" style={{ fontFamily: fontBody, color: 'var(--text-muted)' }}>
                Gear list is full ({JOURNEY_PACK_MAX_BRING} items). Remove something to add more.
              </p>
            )}
          </div>

          {/* Journey-only: Getting around */}
          <div className="border-b border-[var(--border)] px-8 py-10 md:px-10">
            <p className="playce-section-label mb-3" style={sectionLabelMuted}>
              GETTING AROUND
            </p>
            <p style={{ marginBottom: 20, fontSize: 13, fontFamily: fontBody, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
              {introGettingAround.trim() ? (
                introGettingAround
              ) : (
                <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                  Loading local movement notes…
                </span>
              )}
            </p>
            {mobilityRows.length > 0 ? (
              <div>
                {mobilityRows.map((option, idx) => (
                    <div
                      key={`${option.name}-${idx}`}
                      style={{
                        padding: '14px 0',
                        borderBottom: '1px solid var(--border)',
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: 8,
                        alignItems: 'start',
                      }}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-[10px]">
                          <span style={{ fontSize: 14, fontFamily: fontBody, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                            {option.name}
                          </span>
                          <TransportTypeBadge type={option.type} />
                          {option.appStore?.trim() ? (
                            <span
                              className="inline-flex items-center gap-1"
                              style={{ fontFamily: fontBody, color: 'var(--text-muted)', fontSize: 11, lineHeight: 1 }}
                            >
                              <Smartphone className="shrink-0" size={11} strokeWidth={1.75} aria-hidden />
                              <span>{option.appStore.trim()}</span>
                            </span>
                          ) : null}
                        </div>
                        <p
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            fontFamily: fontBody,
                            color: 'var(--text-secondary)',
                            lineHeight: 1.5,
                          }}
                        >
                          {option.description?.trim() ? option.description.trim() : '—'}
                        </p>
                      </div>
                      <div
                        className="tabular-nums"
                        style={{
                          fontSize: 12,
                          fontFamily: fontBody,
                          color: 'var(--text-muted)',
                          textAlign: 'right',
                          whiteSpace: 'nowrap',
                          paddingTop: 2,
                        }}
                      >
                        {option.cost?.trim() || '—'}
                      </div>
                    </div>
                ))}
                <p
                  style={{
                    marginTop: 14,
                    fontSize: 11,
                    fontFamily: fontBody,
                    color: 'var(--text-muted)',
                    fontStyle: 'italic',
                    lineHeight: 1.5,
                  }}
                >
                  Download apps before you arrive — some require local phone verification.
                </p>
              </div>
            ) : (
              <SectionMutedPlaceholder>Local transport not available.</SectionMutedPlaceholder>
            )}
          </div>

          {/* Journey-only: Intelligence Hub */}
          <div className="px-8 py-10 md:px-10" style={{ background: 'var(--bg-secondary)' }}>
            <p className="playce-section-label mb-2" style={sectionLabelMuted}>
              INTELLIGENCE HUB
            </p>
            <p className="mb-8 text-[13px]" style={{ fontFamily: fontBody, color: 'var(--text-muted)' }}>
              Save your research links here.
            </p>

            <HubSection
              category="experience"
              title="Experience links"
              links={mergedHub.experience}
              draft={linkDrafts.experience}
              onDraftChange={(next) => setLinkDrafts((d) => ({ ...d, experience: next }))}
              onAdd={() => addManualLink('experience')}
              onUpdateLink={updateManualLink}
              onDeleteLink={deleteManualLink}
            />
            <HubSection
              category="stay"
              title="Stay links"
              links={mergedHub.stay}
              draft={linkDrafts.stay}
              onDraftChange={(next) => setLinkDrafts((d) => ({ ...d, stay: next }))}
              onAdd={() => addManualLink('stay')}
              onUpdateLink={updateManualLink}
              onDeleteLink={deleteManualLink}
            />
            <HubSection
              category="dine"
              title="Dine links"
              links={mergedHub.dine}
              draft={linkDrafts.dine}
              onDraftChange={(next) => setLinkDrafts((d) => ({ ...d, dine: next }))}
              onAdd={() => addManualLink('dine')}
              onUpdateLink={updateManualLink}
              onDeleteLink={deleteManualLink}
            />
          </div>
        </motion.div>
        </div>
        {variant === 'embedded' && embeddedFooter ? (
          <div
            className="shrink-0 border-t"
            style={{
              background: 'var(--bg)',
              borderColor: 'var(--border)',
            }}
          >
            {embeddedFooter}
          </div>
        ) : null}
      </div>
    </div>
  )
}
