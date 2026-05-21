import type { MatrixLocationData } from '@/lib/playce-location-types'

/** Match / Journey hero cards: only Unsplash CDN URLs are trusted. */
export function isUnsplashImageUrl(url?: string | null): boolean {
  return /^https:\/\/images\.unsplash\.com\//i.test(url?.trim() ?? '')
}

export function locationNeedsImage(image?: string | null): boolean {
  return !isUnsplashImageUrl(image)
}

export function locationImageSearchQuery(
  loc: Pick<MatrixLocationData, 'name' | 'primaryTitle' | 'country' | 'activity' | 'imageSearchTerm'>
): string {
  return (
    loc.imageSearchTerm?.trim() ||
    `${loc.activity} ${loc.primaryTitle || loc.name} ${loc.country} beach ocean landscape`.trim()
  )
}

/** @deprecated Match cards no longer use Wikipedia/loremflickr proxy — Unsplash only. */
export function isValidRemoteImageUrl(url?: string | null): boolean {
  return isUnsplashImageUrl(url)
}
