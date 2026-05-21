/** Shared fallbacks when the model leaves name/country blank or uses placeholders. */

const GENERIC_PLACEHOLDER_NAME = /^(destination|unknown destination|unknown|n\/a|none|tbd|placeholder)$/i

export function isUnknownOrMissingCountry(value: string | undefined): boolean {
  const c = (value ?? '').trim()
  if (!c) return true
  return /^unknown region$/i.test(c) || /^unknown$/i.test(c)
}

export function isGenericPlaceName(value: string | undefined): boolean {
  const s = (value ?? '').trim()
  if (!s) return true
  return GENERIC_PLACEHOLDER_NAME.test(s)
}

export function parseCountryFromLocationLabel(label?: string): string | null {
  if (!label?.trim()) return null
  const parts = label.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const last = parts[parts.length - 1]
  if (isGenericPlaceName(last) || isUnknownOrMissingCountry(last)) return null
  return last
}

export function inferCountryFromPlaceName(place: string): string | null {
  const p = place.trim()
  if (!p) return null
  const rules: { re: RegExp; country: string }[] = [
    { re: /\bbig sur\b/i, country: 'United States' },
    { re: /\bcape town\b|\bjohannesburg\b|\bdurban\b|\bpretoria\b/i, country: 'South Africa' },
    { re: /\bnaples\b|\bnapoli\b/i, country: 'Italy' },
    { re: /\bnew york\b|\bnyc\b|\bboston\b|\bchicago\b|\blos angeles\b|\bsan francisco\b|\bdenver\b|\bseattle\b|\bmiami\b|\bhouston\b|\bphiladelphia\b|\bwashington dc\b|\bportland\b|\bsan diego\b/i, country: 'United States' },
    { re: /\blondon\b|\bedinburgh\b|\bmanchester\b|\bliverpool\b/i, country: 'United Kingdom' },
    { re: /\bparis\b|\blyon\b|\bnice\b|\bchamonix\b|\bannecy\b/i, country: 'France' },
    { re: /\bberlin\b|\bmunich\b|\bhamburg\b|\bfrankfurt\b/i, country: 'Germany' },
    { re: /\brome\b|\bmilan\b|\bvenice\b|\bflorence\b|\bturin\b/i, country: 'Italy' },
    { re: /\bathens\b|\bthessaloniki\b/i, country: 'Greece' },
    { re: /\bbarcelona\b|\bmadrid\b|\bvalencia\b|\bseville\b/i, country: 'Spain' },
    { re: /\blisbon\b|\bporto\b|\balgarve\b|\bpeniche\b|\bericeira\b/i, country: 'Portugal' },
    { re: /\bamsterdam\b|\brotterdam\b/i, country: 'Netherlands' },
    { re: /\bzurich\b|\bgeneva\b|\bzermatt\b|\binterlaken\b/i, country: 'Switzerland' },
    { re: /\bvienna\b|\bsalzburg\b/i, country: 'Austria' },
    { re: /\btokyo\b|\bosaka\b|\bkyoto\b|\bhokkaido\b/i, country: 'Japan' },
    { re: /\bsydney\b|\bmelbourne\b|\bperth\b|\bbrisbane\b/i, country: 'Australia' },
    { re: /\bauckland\b|\bqueenstown\b|\bwellington\b/i, country: 'New Zealand' },
    { re: /\bdubai\b|\babu dhabi\b/i, country: 'United Arab Emirates' },
    { re: /\bsingapore\b/i, country: 'Singapore' },
    { re: /\bhong kong\b/i, country: 'Hong Kong SAR' },
    { re: /\bbangkok\b|\bphuket\b|\bchiang mai\b|\bkoh samui\b/i, country: 'Thailand' },
    { re: /\bbali\b|\bjakarta\b|\byogyakarta\b/i, country: 'Indonesia' },
    { re: /\bvancouver\b|\btoronto\b|\bmontreal\b|\bcalgary\b/i, country: 'Canada' },
    { re: /\bmexico city\b|\bcancun\b|\bpuerto vallarta\b/i, country: 'Mexico' },
    { re: /\brio de janeiro\b|\bsão paulo\b|\bsao paulo\b/i, country: 'Brazil' },
    { re: /\bbuenos aires\b/i, country: 'Argentina' },
    { re: /\bistanbul\b|\bantalya\b/i, country: 'Türkiye' },
    { re: /\bseoul\b|\bbusan\b/i, country: 'South Korea' },
    { re: /\btaipei\b/i, country: 'Taiwan' },
    { re: /\bmumbai\b|\bgoa\b|\bdehli\b|\bdelhi\b/i, country: 'India' },
    { re: /\bcairo\b/i, country: 'Egypt' },
    { re: /\bnairobi\b/i, country: 'Kenya' },
    { re: /\breykjavík\b|\breykjavik\b/i, country: 'Iceland' },
    { re: /\bstockholm\b/i, country: 'Sweden' },
    { re: /\boslo\b/i, country: 'Norway' },
    { re: /\bcopenhagen\b/i, country: 'Denmark' },
  ]
  for (const { re, country } of rules) {
    if (re.test(p)) return country
  }
  return null
}
