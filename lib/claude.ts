import { fetchGroqChatCompletion } from '@/lib/groq-client'

const GROQ_MODEL = 'llama-3.3-70b-versatile'

export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 2000
): Promise<string> {
  return fetchGroqChatCompletion({
    model: GROQ_MODEL,
    max_tokens: maxTokens,
    temperature: 0.65,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  })
}

/** Strip markdown code fences that the model sometimes wraps JSON in. */
export function cleanJsonText(raw: string): string {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/m, '')
    .trim()
}
