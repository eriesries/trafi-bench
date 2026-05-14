export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface StreamChatOptions {
  apiKey: string
  model: string
  messages: ChatMessage[]
  signal?: AbortSignal
  /** Called once per token chunk as the response streams in. */
  onDelta?: (delta: string) => void
  /** Sampling temperature, defaults to 0.3 for analytical answers. */
  temperature?: number
  /** Hard cap on the response length. */
  maxTokens?: number
}

/**
 * Call OpenAI Chat Completions with Server-Sent-Events streaming.
 *
 * The function resolves with the full assembled assistant message once the
 * stream completes (or rejects if the underlying request fails / is
 * aborted). `onDelta` is invoked for every content chunk so the UI can
 * render tokens as they arrive.
 */
export async function streamChat(opts: StreamChatOptions): Promise<string> {
  const {
    apiKey,
    model,
    messages,
    signal,
    onDelta,
    temperature = 0.3,
    maxTokens = 4096,
  } = opts

  if (!apiKey) {
    throw new Error(
      "Set your OpenAI API key in Settings to use the AI chat."
    )
  }
  if (!messages.length) {
    throw new Error("Cannot send an empty conversation.")
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
    }),
    signal,
  })

  if (!res.ok || !res.body) {
    let detail = ""
    try {
      const errJson = await res.json()
      detail = errJson?.error?.message ?? JSON.stringify(errJson)
    } catch {
      detail = await res.text()
    }
    throw new Error(`OpenAI ${res.status}: ${detail || res.statusText}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let assembled = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE frames are separated by blank lines; events come as `data: <json>`.
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line.startsWith("data:")) continue
      const data = line.slice(5).trim()
      if (!data || data === "[DONE]") continue
      try {
        const payload = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const delta = payload.choices?.[0]?.delta?.content
        if (delta) {
          assembled += delta
          onDelta?.(delta)
        }
      } catch {
        // Ignore non-JSON lines (occasional keep-alives or partial frames).
      }
    }
  }

  return assembled
}
