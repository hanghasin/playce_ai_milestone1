'use client'

import dynamic from 'next/dynamic'
import { JourneyPdfDocument } from '@/components/playce/JourneyPDF'
import { buildJourneyBriefingPdfContent } from '@/lib/journey-briefing-content'
import { enrichIntentLocation } from '@/lib/intent-recommendations-schema'
import { PLAYCE_DEFAULT_REFINE } from '@/lib/playce-default-refine'

const PDFViewer = dynamic(
  () => import('@react-pdf/renderer').then((mod) => mod.PDFViewer),
  {
    ssr: false,
    loading: () => (
      <main
        className="flex min-h-screen items-center justify-center"
        style={{ background: '#0a0a0a', color: '#8c8c8c', fontFamily: 'Helvetica, sans-serif' }}
      >
        Loading PDF preview…
      </main>
    ),
  }
)

const previewLocation = enrichIntentLocation({
  recommendationKind: 'spot',
  primaryTitle: 'Ericeira World Surfing Reserve',
  locationLabel: 'Ericeira, Portugal',
  name: 'Ericeira',
  country: 'Portugal',
  activity: 'Surfing',
  imageSearchTerm: 'Ericeira surf town coastline Portugal',
  image: 'https://images.unsplash.com/photo-1505142468610-359e7d316be0?auto=format&fit=crop&w=1600&q=80',
  season: 'Sep – Jun',
  bestSeason: 'Sep – Jun',
  difficulty: 'Intermediate',
  vibe: 'Reef-lined, Consistent, Walkable',
  vibeTags: ['Reef-lined', 'Consistent', 'Walkable'],
  womenFriendly: 82,
  soloIndex: 80,
  nightSafety: 78,
  communityDensity: 72,
  infrastructureScore: 88,
  upcomingEvents: [],
  whyThisSpotLines: [
    {
      icon: '📍',
      text: 'Ericeira is an intermediate-graded surfing destination in Portugal.',
    },
    {
      icon: '📅',
      text: 'Best conditions window for Ericeira runs Sep – Jun — plan your dates around this to avoid off-season closures or poor conditions.',
    },
    {
      icon: '🏄',
      text: 'This pick is rated Intermediate — intermediate skill or above is recommended before committing to Ericeira.',
    },
    {
      icon: '✈️',
      text: 'LIS is the nearest major airport — factor transfer time into Day 1.',
    },
  ],
})

const previewContent = buildJourneyBriefingPdfContent({
  location: previewLocation,
  refine: {
    ...PLAYCE_DEFAULT_REFINE,
    budgetRange: 'MID-RANGE',
    skillLevel: 'INTERMEDIATE',
    durationDays: 4,
    tripRole: 'COMPETITOR',
  },
  itinerary: [
    {
      day: 1,
      title: 'Arrival & reef check',
      activities: [
        { time: '14:00', name: 'Check-in near Ribeira d’Ilhas', price: '€120', status: 'Booked' },
        { time: '17:00', name: 'Sunset paddle-out at Coxos', price: 'Free', status: 'Open' },
      ],
    },
    {
      day: 2,
      title: 'Consistent reef session',
      activities: [
        { time: '07:30', name: 'Dawn surf — Pedra Branca', price: '€45', status: 'Coach booked' },
        { time: '13:00', name: 'Recovery lunch in town', price: '€25', status: 'Open' },
      ],
    },
  ],
  gearItems: [
    { id: '1', text: '3/2mm wetsuit', checked: true, action: 'Rent' },
    { id: '2', text: 'Reef booties', checked: false, action: 'Bring' },
  ],
  mergedHub: {
    experience: [{ id: 'seed-maps', label: 'Ericeira · Maps', href: 'https://www.google.com/maps' }],
    stay: [{ id: 'seed-booking', label: 'Booking.com', href: 'https://www.booking.com' }],
    dine: [{ id: 'seed-dine', label: 'Dining · Ericeira', href: 'https://www.google.com/maps' }],
  },
  travelPurpose: 'competing',
  generatedAt: new Date().toLocaleDateString(),
})

export default function JourneyPdfPreviewPage() {
  return (
    <main style={{ width: '100vw', height: '100dvh', background: '#0a0a0a' }}>
      <PDFViewer width="100%" height="100%" showToolbar>
        <JourneyPdfDocument content={previewContent} />
      </PDFViewer>
    </main>
  )
}
