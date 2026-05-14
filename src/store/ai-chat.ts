import { create } from "zustand"
import { uid } from "@/lib/id"
import { streamChat, type ChatMessage } from "@/lib/ai-chat"

export interface AiChatTurn {
  id: string
  role: "user" | "assistant"
  content: string
  /** Filled while the assistant is still streaming. */
  streaming?: boolean
  /** ISO timestamp. */
  ts: string
}

interface SendOptions {
  text: string
  apiKey: string
  model: string
  /** Pre-built system prompt that describes the current scope (benchmark, etc). */
  systemPrompt: string
}

interface AiChatState {
  open: boolean
  busy: boolean
  error: string | null
  turns: AiChatTurn[]

  setOpen: (v: boolean) => void
  toggle: () => void

  /** Send a user message and stream the assistant's reply into `turns`. */
  send: (opts: SendOptions) => Promise<void>
  /** Abort the currently-streaming response, if any. */
  stop: () => void
  /** Clear the conversation. */
  reset: () => void
}

let activeController: AbortController | null = null

export const useAiChatStore = create<AiChatState>((set, get) => ({
  open: false,
  busy: false,
  error: null,
  turns: [],

  setOpen: (v) => set({ open: v }),
  toggle: () => set({ open: !get().open }),

  reset: () => {
    activeController?.abort()
    activeController = null
    set({ turns: [], busy: false, error: null })
  },

  stop: () => {
    activeController?.abort()
    activeController = null
    set({ busy: false })
  },

  send: async ({ text, apiKey, model, systemPrompt }) => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (get().busy) return

    const userTurn: AiChatTurn = {
      id: uid("turn"),
      role: "user",
      content: trimmed,
      ts: new Date().toISOString(),
    }
    const assistantTurn: AiChatTurn = {
      id: uid("turn"),
      role: "assistant",
      content: "",
      streaming: true,
      ts: new Date().toISOString(),
    }

    set((s) => ({
      turns: [...s.turns, userTurn, assistantTurn],
      busy: true,
      error: null,
    }))

    // Build the conversation payload for the API. We always rebuild the
    // system message from the current `systemPrompt` so the assistant sees
    // an up-to-date snapshot of the user's benchmark/competitor data.
    const history: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...get()
        .turns.filter(
          (t) => t.id !== assistantTurn.id && t.content.trim().length > 0
        )
        .map((t) => ({ role: t.role, content: t.content }) as ChatMessage),
    ]

    activeController = new AbortController()

    try {
      await streamChat({
        apiKey,
        model,
        messages: history,
        signal: activeController.signal,
        onDelta: (delta) => {
          set((s) => ({
            turns: s.turns.map((t) =>
              t.id === assistantTurn.id
                ? { ...t, content: t.content + delta }
                : t
            ),
          }))
        },
      })

      set((s) => ({
        turns: s.turns.map((t) =>
          t.id === assistantTurn.id ? { ...t, streaming: false } : t
        ),
        busy: false,
      }))
    } catch (err) {
      const aborted = (err as Error)?.name === "AbortError"
      set((s) => ({
        turns: s.turns.map((t) =>
          t.id === assistantTurn.id
            ? {
                ...t,
                streaming: false,
                content:
                  t.content +
                  (aborted
                    ? "\n\n_[stopped]_"
                    : `\n\n_[error: ${(err as Error).message}]_`),
              }
            : t
        ),
        busy: false,
        error: aborted ? null : (err as Error).message,
      }))
    } finally {
      activeController = null
    }
  },
}))
