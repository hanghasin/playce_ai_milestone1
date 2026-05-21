/**
 * Display: remove calendar month before "annually" (e.g. "November annually" → "annually",
 * "Early December annually" → "Early annually"). Parsing elsewhere can still use the raw string.
 */
const MONTH_BEFORE_ANNUALLY = new RegExp(
  String.raw`(?:january|february|march|april|may|june|july|august|september|october|november|december|jan\.?|feb\.?|mar\.?|apr\.?|jun\.?|jul\.?|aug\.?|sep\.?|sept\.?|oct\.?|nov\.?|dec\.?)`,
  'i'
)

export function stripMonthBeforeAnnuallyForDisplay(dateStr: string): string {
  const s = dateStr.trim()
  if (!s || !/\bannually\b/i.test(s)) return s
  let t = s.replace(
    new RegExp(
      String.raw`\b(early|mid|late)\s+${MONTH_BEFORE_ANNUALLY.source}\s+(?=annually\b)`,
      'gi'
    ),
    '$1 '
  )
  t = t.replace(new RegExp(String.raw`\b${MONTH_BEFORE_ANNUALLY.source}\s+(?=annually\b)`, 'gi'), '')
  return t.replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').trim()
}
