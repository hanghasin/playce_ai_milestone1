/** Strip/replace characters that Helvetica (react-pdf built-ins) cannot render reliably. */
export function sanitizePdfText(text: string): string {
  return text
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/฿/g, 'THB ')
    .replace(/€/g, 'EUR ')
    .replace(/£/g, 'GBP ')
    .replace(/¥/g, 'JPY ')
    .replace(/₩/g, 'KRW ')
    .replace(/₹/g, 'INR ')
    .replace(/✓|✔|☑/g, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
