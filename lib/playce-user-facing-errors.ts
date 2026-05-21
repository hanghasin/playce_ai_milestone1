
export const PLAYCE_SOFT_ERROR = 'Taking a moment — try again shortly.'

export const PLAYCE_RATE_LIMIT_ERROR =
  "We're at capacity right now. Please wait a minute and try again."

export function isLikelyProviderRateLimit(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('rate limit') ||
    m.includes('rate_limit') ||
    m.includes('tokens per') ||
    m.includes('too many requests') ||
    m.includes('request too large') ||
    m.includes('daily limit') ||
    m.includes('usage limit') ||
    /\b429\b/.test(m)
  )
}

const TECHNICAL_ERROR_PATTERN =
  /groq|api[_-]?key|\.env|dev server|llama|openai|anthropic|model returned|missing_api_key/i

/** Never show provider / env / model details in product UI. */
export function sanitizeUserFacingErrorMessage(raw: string | null | undefined): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (!trimmed) return PLAYCE_SOFT_ERROR

  if (isLikelyProviderRateLimit(trimmed)) {
    return PLAYCE_RATE_LIMIT_ERROR
  }

  if (TECHNICAL_ERROR_PATTERN.test(trimmed)) {
    return PLAYCE_SOFT_ERROR
  }

  return trimmed
}

export function rateLimitUserMessage(_waitHint: string | null): string {
  return PLAYCE_RATE_LIMIT_ERROR
}

export function isPlayceCapacityError(message: string | null | undefined): boolean {
  if (!message?.trim()) return false
  return message.trim() === PLAYCE_RATE_LIMIT_ERROR || /at capacity right now/i.test(message)
}
