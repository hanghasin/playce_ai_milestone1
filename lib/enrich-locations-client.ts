import type { MatrixLocationData } from '@/lib/playce-location-types'
import { locationNeedsImage } from '@/lib/location-image'

export function mergeEnrichedLocationImages(
  base: MatrixLocationData[],
  patches: Array<{ image?: string; photographerName?: string; photographerLink?: string } | undefined>
): MatrixLocationData[] {
  return base.map((loc, i) => {
    const patch = patches[i]
    if (!patch?.image || locationNeedsImage(patch.image)) return loc
    return {
      ...loc,
      image: patch.image,
      photographerName: patch.photographerName ?? loc.photographerName,
      photographerLink: patch.photographerLink ?? loc.photographerLink,
    }
  })
}

/** Fetch Unsplash images for locations missing a real photo URL. */
export async function enrichLocationsWithImages(
  locations: MatrixLocationData[]
): Promise<MatrixLocationData[]> {
  if (!locations.length || !locations.some((loc) => locationNeedsImage(loc.image))) {
    return locations
  }

  try {
    const res = await fetch('/api/enrich-location-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
    })
    const data = (await res.json()) as { locations?: MatrixLocationData[] }
    if (!res.ok || !Array.isArray(data.locations)) return locations
    return mergeEnrichedLocationImages(locations, data.locations)
  } catch {
    return locations
  }
}
