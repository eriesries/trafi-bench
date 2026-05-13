import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export type AIProvider = "openai"

export const OPENAI_VISION_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-4.1",
] as const

export type OpenAIModel = (typeof OPENAI_VISION_MODELS)[number]

const ENV_KEY = (import.meta.env.VITE_OPENAI_API_KEY ?? "").trim()
const ENV_MODEL_RAW = (import.meta.env.VITE_OPENAI_MODEL ?? "").trim()
const ENV_MODEL: OpenAIModel = (
  OPENAI_VISION_MODELS as readonly string[]
).includes(ENV_MODEL_RAW)
  ? (ENV_MODEL_RAW as OpenAIModel)
  : "gpt-4o-mini"

export const ENV_HAS_OPENAI_KEY = ENV_KEY.length > 0

interface SettingsState {
  provider: AIProvider
  openaiApiKey: string
  openaiModel: OpenAIModel
  /** True when the current key value came from .env.local (no user override) */
  openaiApiKeyFromEnv: boolean
  setOpenAIApiKey: (key: string) => void
  setOpenAIModel: (model: OpenAIModel) => void
  resetToEnv: () => void
  clear: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      provider: "openai",
      openaiApiKey: ENV_KEY,
      openaiModel: ENV_MODEL,
      openaiApiKeyFromEnv: ENV_HAS_OPENAI_KEY,
      setOpenAIApiKey: (key) => {
        const trimmed = key.trim()
        set({
          openaiApiKey: trimmed,
          openaiApiKeyFromEnv: trimmed.length > 0 && trimmed === ENV_KEY,
        })
      },
      setOpenAIModel: (model) => set({ openaiModel: model }),
      resetToEnv: () =>
        set({
          openaiApiKey: ENV_KEY,
          openaiApiKeyFromEnv: ENV_HAS_OPENAI_KEY,
          openaiModel: ENV_MODEL,
        }),
      clear: () => set({ openaiApiKey: "", openaiApiKeyFromEnv: false }),
    }),
    {
      name: "benchmark-settings-v1",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persisted, _version) => {
        const state = (persisted ?? {}) as Partial<SettingsState>
        // If the user has no key stored (cleared or first-run), fall back to env
        if (!state.openaiApiKey && ENV_HAS_OPENAI_KEY) {
          return {
            ...state,
            openaiApiKey: ENV_KEY,
            openaiApiKeyFromEnv: true,
            openaiModel: state.openaiModel ?? ENV_MODEL,
          } as never
        }
        return state as never
      },
      onRehydrateStorage: () => (state) => {
        if (state && !state.openaiApiKey && ENV_HAS_OPENAI_KEY) {
          state.openaiApiKey = ENV_KEY
          state.openaiApiKeyFromEnv = true
        }
      },
    }
  )
)
