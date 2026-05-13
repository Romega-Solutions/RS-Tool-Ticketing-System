// Thin client for Groq's OpenAI-compatible Chat Completions API.
// Free tier (Llama-3.3-70B): 14,400 RPD, 6,000 TPM. Pricing if/when you exceed
// free: $0.59/M in, $0.79/M out. See https://console.groq.com.

export const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
export const GROQ_FAST_MODEL    = 'llama-3.1-8b-instant'; // cheaper, faster, less smart

export type GroqMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type GroqResult = {
  text:       string;
  model:      string;
  tokensIn:   number;
  tokensOut:  number;
};

export async function groqChat(
  messages:   GroqMessage[],
  opts?:      { model?: string; maxTokens?: number; temperature?: number },
): Promise<GroqResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not configured');

  const model = opts?.model ?? GROQ_DEFAULT_MODEL;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens:  opts?.maxTokens  ?? 400,
      temperature: opts?.temperature ?? 0.3,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq API ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json() as {
    model: string;
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    text:      json.choices[0]?.message?.content?.trim() ?? '',
    model:     json.model,
    tokensIn:  json.usage.prompt_tokens,
    tokensOut: json.usage.completion_tokens,
  };
}
