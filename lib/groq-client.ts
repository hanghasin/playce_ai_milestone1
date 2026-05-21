const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export type GroqChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type GroqChatPayload = {
  model: string
  messages: GroqChatMessage[]
  max_tokens?: number
  temperature?: number
  response_format?: { type: 'json_object' }
}

type GroqChatJson = {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string }
}

/** Collect keys from GROQ_API_KEY, GROQ_API_KEYS (comma/newline), GROQ_API_KEY_2…_10. */
export function getGroqApiKeys(): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  const pushRaw = (raw: string | undefined) => {
    if (!raw?.trim()) return
    for (const part of raw.split(/[\n,;]+/)) {
      const key = part.trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(key)
    }
  }

  pushRaw(process.env.GROQ_API_KEY)
  pushRaw(process.env.GROQ_API_KEYS)

  for (let i = 2; i <= 10; i += 1) {
    pushRaw(process.env[`GROQ_API_KEY_${i}`])
  }

  return out
}

export function hasGroqApiKeys(): boolean {
  return getGroqApiKeys().length > 0
}

function isRetryableGroqFailure(status: number, message: string): boolean {
  const m = message.toLowerCase()
  if (status === 429 || status === 401 || status === 403) return true
  if (status >= 500) return true
  return /rate limit|rate_limit|too many requests|tokens per|capacity|timeout|quota|invalid api key/i.test(m)
}

async function postGroq(payload: GroqChatPayload, apiKey: string): Promise<{ res: Response; json: GroqChatJson }> {
  let res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  let json = (await res.json()) as GroqChatJson

  if (
    !res.ok &&
    payload.response_format &&
    typeof json.error?.message === 'string' &&
    /response_format|json_object/i.test(json.error.message)
  ) {
    const { response_format: _rf, ...withoutFormat } = payload
    res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(withoutFormat),
    })
    json = (await res.json()) as GroqChatJson
  }

  return { res, json }
}

/**
 * Call Groq chat completions, rotating through configured API keys when a key is
 * rate-limited or otherwise retryable.
 */
export async function fetchGroqChatCompletion(
  payload: GroqChatPayload,
  options?: { keys?: string[] }
): Promise<string> {
  const keys = options?.keys ?? getGroqApiKeys()
  if (!keys.length) {
    throw new Error('No Groq API keys configured')
  }

  let lastStatus = 502
  let lastMessage = 'Groq request failed'

  for (let ki = 0; ki < keys.length; ki += 1) {
    const { res, json } = await postGroq(payload, keys[ki])

    if (res.ok) {
      const content = json.choices?.[0]?.message?.content?.trim()
      if (content) {
        if (ki > 0) {
          console.info(`[groq] request succeeded with backup key #${ki + 1}`)
        }
        return content
      }
      lastStatus = 502
      lastMessage = 'empty_completion'
      if (ki < keys.length - 1) {
        console.warn(`[groq] key #${ki + 1} returned empty completion, trying next key`)
        continue
      }
      break
    }

    lastStatus = res.status
    lastMessage = json.error?.message ?? res.statusText

    if (isRetryableGroqFailure(res.status, lastMessage) && ki < keys.length - 1) {
      console.warn(`[groq] key #${ki + 1} failed (${res.status}), trying next key`)
      continue
    }

    break
  }

  throw new Error(`Groq API error: ${lastStatus} — ${lastMessage}`)
}

export function defaultGroqModels(): string[] {
  return [
    ...new Set([
      process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile',
      process.env.GROQ_MODEL_FALLBACK?.trim() || 'llama-3.1-8b-instant',
    ]),
  ]
}

/** Try each model; within each model rotate keys via {@link fetchGroqChatCompletion}. */
export async function fetchGroqChatWithModelFallback(
  buildPayload: (model: string) => GroqChatPayload
): Promise<string> {
  const models = defaultGroqModels()
  let lastError = 'Groq request failed'

  for (let mi = 0; mi < models.length; mi += 1) {
    try {
      return await fetchGroqChatCompletion(buildPayload(models[mi]))
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      const retryable = isRetryableGroqFailure(502, lastError)
      if (retryable && mi < models.length - 1) {
        await new Promise((r) => setTimeout(r, 400))
        continue
      }
      if (mi < models.length - 1) {
        await new Promise((r) => setTimeout(r, 300))
        continue
      }
    }
  }

  throw new Error(lastError)
}
