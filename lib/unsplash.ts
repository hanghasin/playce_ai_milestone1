const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY

const DESTINATION_KEYWORDS: Record<string, string> = {
  bali: 'Bali temple rice terraces',
  canggu: 'Canggu surf black sand beach',
  'koh samui': 'Koh Samui palm beach',
  chamonix: 'Chamonix Mont Blanc snow',
  portugal: 'Portugal Atlantic surf coast waves',
  peniche: 'Peniche Portugal surf beach cliffs atlantic',
  supertubos: 'Supertubos beach Peniche Portugal surf waves',
  'supertubos beach': 'Supertubos beach Peniche Portugal surf ocean',
  ericeira: 'Ericeira Portugal surf town coastline',
  nazare: 'Nazare Portugal giant waves coast',
  zermatt: 'Zermatt Matterhorn alpine village',
  tulum: 'Tulum beach ruins jungle',
  nosara: 'Nosara surf beach jungle',
  rishikesh: 'Rishikesh Ganges yoga mountains',
  goa: 'Goa palm beach sunset',
  phuket: 'Phuket limestone islands sea',
  ubud: 'Ubud jungle rice terrace',
  uluwatu: 'Uluwatu cliffs surf temple',
}

const SAFE_UNSPLASH_FALLBACK_QUERIES = [
  'ocean surf beach waves landscape',
  'coastal cliff atlantic waves travel',
  'tropical beach sunset horizon travel',
  'mountain lake landscape travel outdoor',
  'forest trail outdoor adventure landscape',
] as const

export function resolveUnsplashSearchQueries(
  destinationName: string,
  activity?: string,
  imageSearchTerm?: string
): string[] {
  const queries: string[] = []
  const term = imageSearchTerm?.trim()
  if (term) queries.push(term)

  const lower = destinationName.toLowerCase().trim()
  const tokens = Object.entries(DESTINATION_KEYWORDS)
    .filter(([token]) => token !== 'default')
    .sort((a, b) => b[0].length - a[0].length)

  for (const [token, query] of tokens) {
    if (lower.includes(token)) {
      queries.push(query)
      break
    }
  }

  const act = (activity ?? '').trim()
  if (act) {
    queries.push(`${destinationName} ${act} beach ocean landscape`.trim())
    if (/surf/i.test(act)) {
      queries.push(`${destinationName} surf beach waves ${act}`.trim())
      queries.push('portugal atlantic surf beach peniche waves')
    }
  }

  queries.push(`${destinationName} travel landscape outdoor`.trim())
  queries.push(...SAFE_UNSPLASH_FALLBACK_QUERIES)

  return [...new Set(queries.filter(Boolean))]
}

export async function getDestinationImage(
  destinationName: string,
  activity?: string,
  imageSearchTerm?: string,
  preferredIndex = 0,
  usedUrls?: Set<string>
): Promise<{ url: string; photographerName: string; photographerLink: string }> {
  if (!UNSPLASH_ACCESS_KEY) {
    return { url: '', photographerName: '', photographerLink: '' }
  }

  const queries = resolveUnsplashSearchQueries(destinationName, activity, imageSearchTerm)

  const pickPhoto = (
    results: Array<{
      urls?: { regular?: string }
      user?: { name?: string; links?: { html?: string } }
    }>
  ) => {
    const order = [...new Set([preferredIndex, 0, 2, 4, 1, 3])].filter(
      (i) => Number.isFinite(i) && i >= 0 && i < results.length
    )
    for (const i of order) {
      const photo = results[i]
      if (!photo?.urls?.regular) continue
      if (usedUrls?.has(photo.urls.regular)) continue
      return photo
    }
    return results.find((p) => p?.urls?.regular && !usedUrls?.has(p.urls.regular ?? ''))
  }

  const fetchQuery = async (query: string) => {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape&content_filter=high`,
      {
        headers: {
          Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
        },
        next: { revalidate: 86400 },
      }
    )
    if (!res.ok) throw new Error('Unsplash fetch failed')
    const data = (await res.json()) as {
      results?: Array<{
        urls?: { regular?: string }
        user?: { name?: string; links?: { html?: string } }
      }>
    }
    return data.results ?? []
  }

  try {
    for (const query of queries) {
      const results = await fetchQuery(query)
      const photo = pickPhoto(results)
      if (!photo?.urls?.regular) continue
      if (usedUrls) usedUrls.add(photo.urls.regular)
      return {
        url: photo.urls.regular,
        photographerName: photo.user?.name ?? '',
        photographerLink: photo.user?.links?.html ?? '',
      }
    }

    return { url: '', photographerName: '', photographerLink: '' }
  } catch (err) {
    console.error('Unsplash error:', err)
    return { url: '', photographerName: '', photographerLink: '' }
  }
}
