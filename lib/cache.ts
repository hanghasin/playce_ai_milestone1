const responseCache = new Map<string, { data: string; timestamp: number }>()

const CACHE_DURATION = 1000 * 60 * 60 * 24 // 24 hours

export function getCachedResponse(key: string): string | null {
  const entry = responseCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_DURATION) {
    responseCache.delete(key)
    return null
  }
  return entry.data
}

export function setCachedResponse(key: string, data: string): void {
  responseCache.set(key, { data, timestamp: Date.now() })
}

export function buildCacheKey(...parts: (string | number | undefined | null)[]): string {
  return parts
    .map((p) => String(p ?? '').toLowerCase().trim())
    .filter(Boolean)
    .join('-')
    .replace(/\s+/g, '-')
    .slice(0, 200)
}
