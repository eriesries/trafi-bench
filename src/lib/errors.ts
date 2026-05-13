/**
 * Best-effort error → string formatter. Handles:
 *   - native Error (message)
 *   - Supabase / PostgrestError-style objects ({ message, details, hint, code })
 *   - plain strings
 *   - everything else (falls back to JSON.stringify)
 *
 * Always returns a useful, non-"[object Object]" string.
 */
export function formatError(err: unknown): string {
  if (err == null) return "Unknown error"
  if (typeof err === "string") return err
  if (err instanceof Error) return err.message || err.name || "Error"

  if (typeof err === "object") {
    const e = err as Record<string, unknown>
    const parts: string[] = []
    if (typeof e.message === "string" && e.message) parts.push(e.message)
    if (typeof e.details === "string" && e.details) parts.push(e.details)
    if (typeof e.hint === "string" && e.hint) parts.push(`Hint: ${e.hint}`)
    if (typeof e.code === "string" && e.code) parts.push(`(code ${e.code})`)
    if (parts.length > 0) return parts.join(" — ")

    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }

  return String(err)
}
