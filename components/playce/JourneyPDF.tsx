import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Link,
  Image,
  Svg,
  Circle,
  G,
  Path,
} from '@react-pdf/renderer'
import type { HubLinkItem } from '@/components/playce/JourneyMissionBriefingPanel'
import type { JourneyBriefingPdfContent } from '@/lib/journey-briefing-content'
import type { CardConfig } from '@/lib/experience-cards'
import { splitHubLinksForDisplay } from '@/lib/journey-hub-links'
import { sanitizePdfText } from '@/lib/pdf-text-sanitize'
import { gaugeArcDash } from '@/lib/playce-confirm-helpers'

const C = {
  bg: '#0a0a0a',
  bgSecondary: '#141414',
  textPrimary: '#e0e0e0',
  textSecondary: '#8c8c8c',
  textMuted: '#4d4d4d',
  border: '#2a2a2a',
  borderSubtle: '#1f1f1f',
  brand: '#C17D3C',
  brandText: '#E8A86A',
  brandDim: '#2a2218',
  white: '#ffffff',
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: C.bg,
    color: C.textSecondary,
    fontFamily: 'Helvetica',
    fontSize: 10,
    lineHeight: 1.45,
  },
  hero: {
    height: 180,
    position: 'relative',
    backgroundColor: '#121820',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    objectFit: 'cover',
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    opacity: 0.55,
  },
  heroTextWrap: {
    position: 'absolute',
    left: 32,
    right: 32,
    bottom: 28,
  },
  heroTitle: {
    fontFamily: 'Times-Roman',
    fontSize: 28,
    color: C.white,
    lineHeight: 1.25,
    marginBottom: 10,
    letterSpacing: -0.4,
  },
  heroMeta: {
    fontSize: 10,
    color: '#999999',
    lineHeight: 1.4,
  },
  section: {
    paddingHorizontal: 32,
    paddingVertical: 28,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: C.border,
  },
  sectionSecondary: {
    backgroundColor: C.bgSecondary,
  },
  sectionLabel: {
    fontSize: 8,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: C.textMuted,
    marginBottom: 18,
  },
  muted: {
    fontSize: 9,
    color: C.textMuted,
    fontStyle: 'italic',
  },
  body: {
    fontSize: 10,
    color: C.textSecondary,
    lineHeight: 1.5,
  },
  bodyPrimary: {
    fontSize: 10,
    color: C.textPrimary,
    lineHeight: 1.5,
  },
  factLabel: {
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: C.textMuted,
    marginBottom: 4,
    marginTop: 8,
  },
  factValue: {
    fontSize: 10,
    color: C.textPrimary,
    lineHeight: 1.4,
  },
  factSub: {
    fontSize: 9,
    color: C.textMuted,
    marginTop: 3,
    lineHeight: 1.4,
  },
  link: {
    color: C.brandText,
    textDecoration: 'none',
    fontSize: 10,
  },
  gaugeWrap: {
    alignItems: 'center',
    width: 72,
  },
  gaugeLabel: {
    marginTop: 8,
    fontSize: 8,
    color: C.textMuted,
    textAlign: 'center',
  },
  gaugeRing: {
    width: 64,
    height: 64,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeValue: {
    fontSize: 14,
    color: C.brandText,
    fontFamily: 'Helvetica-Bold',
  },
  vibeIndicatorLabel: {
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: C.textMuted,
    marginBottom: 4,
  },
  vibeIndicatorValue: {
    fontSize: 11,
    color: C.textPrimary,
    fontFamily: 'Helvetica-Bold',
  },
  vibeIndicatorHint: {
    fontSize: 8,
    color: C.textMuted,
    marginTop: 3,
  },
  vibeIndicatorBlock: {
    width: '48%',
    marginBottom: 12,
    paddingRight: 8,
  },
  vibeDivider: {
    width: 1,
    height: 108,
    backgroundColor: C.border,
    marginHorizontal: 28,
  },
  whyRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: C.border,
  },
  whyIcon: {
    width: 16,
    fontSize: 10,
    color: C.textMuted,
    paddingTop: 1,
  },
  whyText: {
    flex: 1,
    fontSize: 10,
    color: C.textSecondary,
    lineHeight: 1.5,
  },
  rhythmSlotLabel: {
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: C.textMuted,
    marginBottom: 3,
  },
  dayBlock: {
    marginBottom: 22,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: C.border,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 14,
    gap: 12,
  },
  dayNum: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: C.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dayTitle: {
    fontFamily: 'Times-Roman',
    fontSize: 16,
    color: C.textPrimary,
  },
  activityRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: C.borderSubtle,
    alignItems: 'flex-start',
  },
  activityTime: {
    width: 52,
    fontFamily: 'Courier',
    fontSize: 9,
    color: C.textMuted,
    paddingTop: 1,
  },
  activityBody: {
    flex: 1,
    paddingRight: 8,
  },
  activityName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.textPrimary,
    marginBottom: 2,
  },
  activitySub: {
    fontSize: 9,
    color: C.textMuted,
    fontStyle: 'italic',
  },
  activityCost: {
    width: 48,
    fontFamily: 'Courier',
    fontSize: 9,
    color: C.textMuted,
    textAlign: 'right',
    paddingTop: 1,
  },
  experienceRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  experienceCard: {
    flex: 1,
    minHeight: 52,
    padding: 8,
    marginRight: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: C.border,
    backgroundColor: C.bgSecondary,
    borderRadius: 4,
  },
  experienceCardLast: {
    marginRight: 0,
  },
  experienceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  experienceCardIcon: {
    fontSize: 7,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: C.textMuted,
  },
  experienceExternal: {
    fontSize: 7,
    color: C.textMuted,
    letterSpacing: 0.3,
  },
  experienceLabel: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: C.textPrimary,
    marginBottom: 2,
    lineHeight: 1.25,
  },
  experienceSub: {
    fontSize: 7.5,
    color: C.textMuted,
    lineHeight: 1.25,
  },
  gearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: C.border,
  },
  gearCheckBox: {
    width: 16,
    marginRight: 8,
    flexShrink: 0,
  },
  gearCheck: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: C.border,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    display: 'flex',
  },
  gearCheckOn: {
    backgroundColor: C.brand,
    borderColor: C.brand,
  },
  gearItem: {
    flex: 1,
    fontSize: 10,
    color: C.textPrimary,
    paddingRight: 6,
  },
  gearAction: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#664628',
    paddingHorizontal: 5,
    height: 14,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transportRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: C.border,
  },
  transportRowLast: {
    borderBottomWidth: 0,
  },
  transportTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  transportMain: {
    flex: 1,
    paddingRight: 12,
  },
  transportTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  transportName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.textPrimary,
    marginRight: 6,
    flexShrink: 1,
  },
  transportTypeBadge: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#664628',
    borderRadius: 2,
    paddingHorizontal: 5,
    height: 14,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
    flexShrink: 0,
  },
  transportTypeLabel: {
    fontSize: 7,
    letterSpacing: 0.5,
    color: C.brandText,
    lineHeight: 1,
    textTransform: 'uppercase',
  },
  transportAppIcon: {
    display: 'none',
  },
  transportCost: {
    width: 92,
    flexShrink: 0,
    fontSize: 8.5,
    color: C.textMuted,
    textAlign: 'right',
    paddingTop: 1,
    lineHeight: 1.35,
  },
  transportDescription: {
    fontSize: 9,
    color: C.textSecondary,
    lineHeight: 1.45,
  },
  hubChip: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: C.border,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
    marginBottom: 6,
  },
  hubChipText: {
    fontSize: 9,
    color: C.textSecondary,
  },
  hubUserRow: {
    marginBottom: 6,
  },
  hubUserLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: C.textPrimary,
    marginBottom: 1,
  },
  hubUserHref: {
    fontSize: 8,
    color: C.textMuted,
  },
  footer: {
    paddingHorizontal: 32,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: C.border,
  },
  footerText: {
    fontSize: 8,
    color: C.textMuted,
  },
})

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>
}

function PdfGauge({ label, percent }: { label: string; percent: number }) {
  const rounded = Math.round(percent)
  return (
    <View style={styles.gaugeWrap}>
      <View style={styles.gaugeRing}>
        <Svg width={64} height={64} viewBox="0 0 80 80" style={{ position: 'absolute', top: 0, left: 0 }}>
          <G transform="rotate(-90 40 40)">
            <Circle cx={40} cy={40} r={35} stroke="#2a2a2a" strokeWidth={5} fill="none" />
            <Circle
              cx={40}
              cy={40}
              r={35}
              stroke={C.brand}
              strokeWidth={5}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={gaugeArcDash(percent, 35)}
            />
          </G>
        </Svg>
        <Text style={styles.gaugeValue}>{rounded}</Text>
      </View>
      <Text style={styles.gaugeLabel}>{label}</Text>
    </View>
  )
}

function VibeIndicator({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.vibeIndicatorBlock}>
      <Text style={styles.vibeIndicatorLabel}>{label}</Text>
      <Text style={styles.vibeIndicatorValue}>{value}</Text>
      {hint ? <Text style={styles.vibeIndicatorHint}>{hint}</Text> : null}
    </View>
  )
}

function WhyThisSpotText({ text, boldPhrase }: { text: string; boldPhrase?: string }) {
  const bp = boldPhrase?.trim()
  if (!bp) return <Text style={styles.whyText}>{text}</Text>
  const idx = text.indexOf(bp)
  if (idx < 0) return <Text style={styles.whyText}>{text}</Text>
  return (
    <Text style={styles.whyText}>
      {text.slice(0, idx)}
      <Text style={{ color: C.textPrimary, fontFamily: 'Helvetica-Bold' }}>{bp}</Text>
      {text.slice(idx + bp.length)}
    </Text>
  )
}

function experienceIconLabel(icon: CardConfig['icon']): string {
  switch (icon) {
    case 'bed':
      return 'Stay'
    case 'flag':
      return 'Events'
    case 'map-pin':
      return 'Map'
    case 'ticket':
      return 'Ticket'
    default:
      return 'Explore'
  }
}

function PdfExperienceCard({ card, isLast }: { card: CardConfig; isLast: boolean }) {
  return (
    <View style={[styles.experienceCard, isLast ? styles.experienceCardLast : {}]} wrap={false}>
      <View style={styles.experienceCardHeader}>
        <Text style={styles.experienceCardIcon}>{experienceIconLabel(card.icon)}</Text>
        <Text style={styles.experienceExternal}>↗</Text>
      </View>
      <Link src={card.href} style={{ ...styles.link, textDecoration: 'none' }}>
        <Text style={styles.experienceLabel}>{card.label}</Text>
      </Link>
      {card.subNote ? <Text style={styles.experienceSub}>{card.subNote}</Text> : null}
    </View>
  )
}

function GearCheckRow({
  item,
  checked,
  action,
}: {
  item: string
  checked: boolean
  action?: string
}) {
  const label = sanitizePdfText(item)
  const actionLabel = action && action !== 'Bring' ? sanitizePdfText(action) : null
  return (
    <View style={styles.gearRow} wrap={false}>
      <View style={styles.gearCheckBox}>
        <View style={[styles.gearCheck, checked ? styles.gearCheckOn : {}]}>
          {checked ? (
            <Svg width={8} height={8} viewBox="0 0 12 12">
              <Path
                d="M2.5 6L5 8.5L9.5 3.5"
                stroke={C.white}
                strokeWidth={1.5}
                fill="none"
              />
            </Svg>
          ) : null}
        </View>
      </View>
      <Text style={styles.gearItem}>{label}</Text>
      {actionLabel ? (
        <View style={styles.gearAction}>
          <Text style={{ fontSize: 7, letterSpacing: 0.4, color: C.brandText, lineHeight: 1 }}>
            {actionLabel}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function PdfTransportRow({
  row,
  isLast,
}: {
  row: {
    name: string
    typeLabel: string
    description: string
    cost: string
    appStore?: string
  }
  isLast: boolean
}) {
  return (
    <View style={[styles.transportRow, isLast ? styles.transportRowLast : {}]} wrap={false}>
      <View style={styles.transportTopRow}>
        <View style={styles.transportMain}>
          <View style={styles.transportTitleRow}>
            <Text style={styles.transportName}>{sanitizePdfText(row.name)}</Text>
            <View style={styles.transportTypeBadge}>
              <Text style={styles.transportTypeLabel}>{sanitizePdfText(row.typeLabel)}</Text>
            </View>
          </View>
          <Text style={styles.transportDescription}>{sanitizePdfText(row.description)}</Text>
        </View>
        <Text style={styles.transportCost}>{sanitizePdfText(row.cost)}</Text>
      </View>
    </View>
  )
}

function PdfHubSection({ title, links }: { title: string; links: HubLinkItem[] }) {
  const { presetLinks, userLinks } = splitHubLinksForDisplay(links)
  if (presetLinks.length === 0 && userLinks.length === 0) return null

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ ...styles.sectionLabel, fontSize: 7, marginBottom: 8 }}>{title}</Text>
      {presetLinks.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: userLinks.length ? 8 : 0 }}>
          {presetLinks.map((item) => (
            <Link key={item.id} src={item.href} style={styles.hubChip}>
              <Text style={styles.hubChipText}>{sanitizePdfText(item.label)}</Text>
            </Link>
          ))}
        </View>
      ) : null}
      {userLinks.map((item) => (
        <View key={item.id} style={styles.hubUserRow} wrap={false}>
          <Link src={item.href} style={{ textDecoration: 'none' }}>
            <Text style={styles.hubUserLabel}>{sanitizePdfText(item.label)}</Text>
            <Text style={styles.hubUserHref}>{sanitizePdfText(item.href)}</Text>
          </Link>
        </View>
      ))}
    </View>
  )
}

function PdfHero({ content }: { content: JourneyBriefingPdfContent }) {
  return (
    <View style={styles.hero}>
      {content.heroImageUrl ? (
        <Image src={content.heroImageUrl} style={styles.heroImage} />
      ) : null}
      <View style={styles.heroOverlay} />
      <View style={styles.heroTextWrap}>
        <Text style={styles.heroTitle}>{content.destinationName}</Text>
        <Text style={styles.heroMeta}>{content.heroMetaLine}</Text>
      </View>
    </View>
  )
}

export function JourneyPdfDocument({ content }: { content: JourneyBriefingPdfContent }) {
  const { vibeIndex } = content

  return (
    <Document title={`Playce — ${content.destinationName}`} author="Playce" subject="Your journey">
      <Page size="A4" style={styles.page} wrap>
        <PdfHero content={content} />

        {/* Vibe Index */}
        <View style={[styles.section, styles.sectionSecondary]}>
          <SectionLabel>VIBE INDEX</SectionLabel>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', flexShrink: 0 }}>
              <PdfGauge label="Solo-friendly" percent={vibeIndex.soloPct} />
              <View style={{ width: 24 }} />
              <PdfGauge label="Women-friendly" percent={vibeIndex.womenPct} />
            </View>
            <View style={styles.vibeDivider} />
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
              <VibeIndicator label="Safety feeling" value={vibeIndex.safetyFeeling} />
              <VibeIndicator label="Social openness" value={vibeIndex.socialOpenness} />
              <VibeIndicator label={vibeIndex.thirdLabel} value={vibeIndex.thirdValue} />
              <VibeIndicator
                label="Traveler density"
                value={vibeIndex.travelerDensity}
                hint={vibeIndex.travelerDensityHint}
              />
            </View>
          </View>
          <Text style={styles.muted}>Indicative only. Not a guarantee of safety.</Text>
        </View>

        {/* Fast Facts */}
        <View style={styles.section}>
          <SectionLabel>FAST FACTS</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {content.fastFacts
              .filter((f) => f.label !== 'Budget estimate' && f.label !== 'Visa')
              .map((fact) => (
                <View key={fact.label} style={{ width: '48%', marginBottom: 10, paddingRight: 8 }}>
                  <Text style={styles.factLabel}>{fact.label}</Text>
                  {fact.href ? (
                    <Link src={fact.href} style={styles.link}>
                      <Text style={styles.factValue}>{fact.value}</Text>
                    </Link>
                  ) : (
                    <Text style={styles.factValue}>{fact.value}</Text>
                  )}
                </View>
              ))}
          </View>
          <View style={{ marginTop: 4 }}>
            <Text style={styles.factLabel}>Visa</Text>
            <Link src={content.visaHref} style={styles.link}>
              <Text style={styles.factValue}>Check requirements →</Text>
            </Link>
            <Text style={styles.factSub}>Rules vary by passport — verify before booking.</Text>
          </View>
          <View style={{ marginTop: 4 }}>
            <Text style={styles.factLabel}>Budget estimate</Text>
            <Text style={styles.factValue}>{content.budgetPrimary}</Text>
            <Text style={styles.factSub}>{content.budgetSecondary}</Text>
          </View>
          <Text style={{ ...styles.muted, marginTop: 10 }}>{content.budgetFootnote}</Text>
        </View>

        {/* Events */}
        <View style={[styles.section, styles.sectionSecondary]}>
          <SectionLabel>EVENTS & RACES</SectionLabel>
          {content.events.length > 0 ? (
            content.events.map((event, i) => (
              <View key={`${event.name}-${i}`} style={{ marginBottom: 12 }}>
                <Text style={styles.bodyPrimary}>
                  {event.name}
                  {event.isRecurring ? ' · Annual' : ''}
                </Text>
                <Text style={styles.muted}>{event.dateLine}</Text>
                <Link src={event.detailsHref} style={styles.link}>
                  <Text style={{ ...styles.link, marginTop: 3 }}>Details →</Text>
                </Link>
              </View>
            ))
          ) : content.eventsSearchHref ? (
            <Link src={content.eventsSearchHref} style={styles.link}>
              <Text style={styles.link}>Search for events during your trip →</Text>
            </Link>
          ) : (
            <Text style={styles.muted}>No dated events listed.</Text>
          )}
        </View>

        {/* Why this spot */}
        <View style={[styles.section, styles.sectionSecondary]}>
          <SectionLabel>WHY THIS SPOT</SectionLabel>
          {content.whyThisSpot.length > 0 ? (
            content.whyThisSpot.map((row, i) => (
              <View
                key={i}
                style={[
                  styles.whyRow,
                  i === content.whyThisSpot.length - 1 ? { borderBottomWidth: 0 } : {},
                ]}
                wrap={false}
              >
                <Text style={styles.whyIcon}>•</Text>
                <WhyThisSpotText text={row.text} boldPhrase={row.boldPhrase} />
              </View>
            ))
          ) : content.whyThisSpotFallback ? (
            <Text style={styles.body}>{content.whyThisSpotFallback}</Text>
          ) : (
            <Text style={styles.muted}>Why this spot not available.</Text>
          )}
        </View>

        {/* Trip rhythm + itinerary */}
        <View style={styles.section}>
          <SectionLabel>TRIP RHYTHM</SectionLabel>
          <Text style={{ ...styles.body, marginBottom: 14 }}>{content.tripRhythmLead}</Text>
          {content.tripRhythmSlots.length > 0 ? (
            content.tripRhythmSlots.map((slot) => (
              <View key={slot.label} style={{ marginBottom: 10 }}>
                <Text style={styles.rhythmSlotLabel}>{slot.label}</Text>
                <Text style={styles.body}>{slot.text}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>Trip rhythm not available.</Text>
          )}

          <Text style={{ ...styles.sectionLabel, marginTop: 18 }}>SUGGESTED ITINERARY</Text>
          {content.itinerary.length > 0 ? (
            content.itinerary.map((day) => (
              <View key={day.day} style={styles.dayBlock}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayNum}>DAY {String(day.day).padStart(2, '0')}</Text>
                  <Text style={styles.dayTitle}>{day.title}</Text>
                </View>
                {day.activities.map((act, i) => (
                  <View key={`${day.day}-${i}`} style={styles.activityRow}>
                    <Text style={styles.activityTime}>{act.time}</Text>
                    <View style={styles.activityBody}>
                      {act.mapHref ? (
                        <Link src={act.mapHref} style={styles.link}>
                          <Text style={styles.activityName}>{act.name}</Text>
                        </Link>
                      ) : (
                        <Text style={styles.activityName}>{act.name}</Text>
                      )}
                      {act.subline ? <Text style={styles.activitySub}>{act.subline}</Text> : null}
                    </View>
                    {act.cost ? <Text style={styles.activityCost}>{act.cost}</Text> : null}
                  </View>
                ))}
              </View>
            ))
          ) : (
            <Text style={styles.muted}>Itinerary not available yet.</Text>
          )}
        </View>

        {/* Ways to experience */}
        <View style={styles.section} wrap={false}>
          <SectionLabel>WAYS TO EXPERIENCE IT</SectionLabel>
          <View style={styles.experienceRow}>
            {content.waysToExperience.map((card, i) => (
              <PdfExperienceCard
                key={card.label}
                card={card}
                isLast={i === content.waysToExperience.length - 1}
              />
            ))}
          </View>
        </View>

        {/* Gear check */}
        <View style={styles.section}>
          <SectionLabel>GEAR CHECK</SectionLabel>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={{ ...styles.factLabel, marginBottom: 8 }}>Pack</Text>
              {content.gearPack.length > 0 ? (
                content.gearPack.map((g) => (
                  <GearCheckRow key={g.item} item={g.item} checked={g.checked} action={g.action} />
                ))
              ) : (
                <Text style={styles.muted}>Gear checklist not available.</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ ...styles.factLabel, marginBottom: 8 }}>Rent</Text>
              {content.gearRent.length > 0 ? (
                content.gearRent.map((g) => (
                  <GearCheckRow key={g.item} item={g.item} checked={g.checked} action={g.action} />
                ))
              ) : (
                <Text style={styles.muted}>No rental items yet.</Text>
              )}
            </View>
          </View>
        </View>

        {/* Getting around */}
        <View style={styles.section}>
          <SectionLabel>GETTING AROUND</SectionLabel>
          {content.gettingAroundIntro ? (
            <Text style={{ ...styles.body, marginBottom: 14 }}>{content.gettingAroundIntro}</Text>
          ) : (
            <Text style={styles.muted}>Loading local movement notes…</Text>
          )}
          {content.gettingAroundRows.length > 0 ? (
            <>
              {content.gettingAroundRows.map((row, i) => (
                <PdfTransportRow
                  key={`${row.name}-${i}`}
                  row={row}
                  isLast={i === content.gettingAroundRows.length - 1}
                />
              ))}
              <Text style={{ ...styles.muted, marginTop: 12 }} wrap={false}>
                Download apps before you arrive — some require local phone verification.
              </Text>
            </>
          ) : (
            <Text style={styles.muted}>Local transport not available.</Text>
          )}
        </View>

        {/* Intelligence hub */}
        <View style={[styles.section, styles.sectionSecondary]}>
          <SectionLabel>INTELLIGENCE HUB</SectionLabel>
          <Text style={{ ...styles.muted, marginBottom: 12 }}>Save your research links here.</Text>
          <PdfHubSection title="Experience links" links={content.intelligenceHub.experience} />
          <PdfHubSection title="Stay links" links={content.intelligenceHub.stay} />
          <PdfHubSection title="Dine links" links={content.intelligenceHub.dine} />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Generated by Playce · {content.generatedAt}</Text>
        </View>
      </Page>
    </Document>
  )
}
