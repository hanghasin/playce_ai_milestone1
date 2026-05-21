import { NextResponse } from 'next/server'
import { isUnsplashImageUrl, locationImageSearchQuery, locationNeedsImage } from '@/lib/location-image'
import { getDestinationImage } from '@/lib/unsplash'

type LocationInput = {
  name?: string
  primaryTitle?: string
  country?: string
  activity?: string
  imageSearchTerm?: string
  image?: string
  photographerName?: string
  photographerLink?: string
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { locations?: LocationInput[] }
    const inputs = Array.isArray(body.locations) ? body.locations : []
    if (inputs.length === 0) {
      return NextResponse.json({ locations: [] })
    }

    const usedImageUrls = new Set<string>()
    const locations = []

    for (let i = 0; i < inputs.length; i += 1) {
      const loc = inputs[i]
      if (!locationNeedsImage(loc.image)) {
        locations.push(loc)
        continue
      }

      const name = (loc.primaryTitle || loc.name || '').trim() || 'Destination'
      const activity = (loc.activity || '').trim() || 'travel'
      const query = locationImageSearchQuery({
        name: loc.name ?? '',
        primaryTitle: loc.primaryTitle,
        country: loc.country ?? '',
        activity: loc.activity ?? '',
        imageSearchTerm: loc.imageSearchTerm,
      })

      const imageData = await getDestinationImage(name, activity, query, i, usedImageUrls)
      locations.push({
        ...loc,
        image: isUnsplashImageUrl(imageData.url) ? imageData.url : '',
        photographerName: imageData.photographerName,
        photographerLink: imageData.photographerLink,
      })
    }

    return NextResponse.json({ locations })
  } catch (e) {
    console.error('[enrich-location-images]', e)
    return NextResponse.json({ error: 'enrich_failed' }, { status: 500 })
  }
}
