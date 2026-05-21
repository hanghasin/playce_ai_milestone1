import { NextResponse } from 'next/server'
import { locationImageSearchQuery } from '@/lib/location-image'
import { getDestinationImage } from '@/lib/unsplash'

/**
 * GET /api/location-image?place=Peniche&activity=surfing&idx=1
 * Redirects to an Unsplash photo only (no Wikipedia / loremflickr).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const place = searchParams.get('place')?.trim() ?? ''
  const activity = searchParams.get('activity')?.trim() ?? 'travel'
  const idx = Math.max(0, parseInt(searchParams.get('idx') ?? '1', 10) - 1)

  if (!place) {
    return NextResponse.json({ error: 'place is required' }, { status: 400 })
  }

  const query = locationImageSearchQuery({
    name: place,
    primaryTitle: place,
    country: '',
    activity,
  })

  const imageData = await getDestinationImage(place, activity, query, idx)
  if (imageData.url.startsWith('https://images.unsplash.com/')) {
    return NextResponse.redirect(imageData.url, { status: 302 })
  }

  return NextResponse.json({ error: 'no_unsplash_image' }, { status: 404 })
}
