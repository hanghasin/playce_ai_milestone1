/**
 * Human-readable primary airport lines for itinerary / matrix copy.
 * Avoids "Main airport for [city]" placeholders.
 */

export function primaryAirportsLine(city: string, country: string): string {
  const c = `${city} ${country}`.toLowerCase()

  if (/new york|nyc|manhattan|brooklyn|queens/.test(c))
    return 'JFK — John F. Kennedy International · EWR — Newark Liberty International · LGA — LaGuardia (pick by airline/route)'

  if (/london|greater london/.test(c) && /uk|united kingdom|england/.test(c))
    return 'LHR — London Heathrow · LGW — Gatwick · STN — Stansted (match carrier)'

  if (/paris/.test(c) && /france/.test(c)) return 'CDG — Charles de Gaulle · ORY — Paris-Orly'

  if (/tokyo/.test(c) && /japan/.test(c))
    return 'HND — Haneda (closest to centre) · NRT — Narita (many long-haul)'

  if (/chamonix|mont blanc/.test(c)) return 'GVA — Geneva (closest major gateway) · ground transfer to Chamonix'

  if (/bali|denpasar/.test(c)) return 'DPS — Ngurah Rai International (Denpasar)'

  if (/lisbon|portugal/.test(c) && /lisbon/.test(c)) return 'LIS — Humberto Delgado (Lisbon)'

  if (/san francisco|bay area/.test(c) && /usa|united states/.test(c))
    return 'SFO — San Francisco International · OAK — Oakland'

  if (/chicago/.test(c) && /usa|united states|illinois/.test(c)) return 'ORD — O\'Hare International · MDW — Midway International'

  if (/boston/.test(c) && /usa|united states|massachusetts/.test(c)) return 'BOS — Logan International'

  if (/berlin/.test(c) && /germany/.test(c)) return 'BER — Berlin Brandenburg'

  if (/\bbangkok\b|krung thep/.test(c) && /thailand/.test(c))
    return 'BKK — Suvarnabhumi · DMK — Don Mueang (match the IATA on your ticket — domestic & LCC often use DMK)'

  if (/chiang\s*mai/.test(c) && /thailand/.test(c)) return 'CNX — Chiang Mai International'

  if (/phuket/.test(c) && /thailand/.test(c)) return 'HKT — Phuket International'

  return ''
}

/**
 * When we have no city-specific line, show traveller-facing copy — never internal
 * “prompt to the model” language in the UI.
 */
export function airportFallbackInstruction(city: string, country: string): string {
  const line = primaryAirportsLine(city, country)
  if (line) return line
  return `Check the 3-letter IATA code on your booking — that names your gateway into ${city} (${country}). Large cities may use more than one airport.`
}
