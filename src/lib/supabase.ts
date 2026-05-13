import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim()
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim()

export const SUPABASE_CONFIGURED = url.length > 0 && key.length > 0

if (!SUPABASE_CONFIGURED) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. " +
      "Add them to .env.local and restart the dev server."
  )
}

export const supabase: SupabaseClient = createClient(
  url || "http://localhost:54321",
  key || "anon-placeholder",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
)

export const SCREENS_BUCKET = "screens"
