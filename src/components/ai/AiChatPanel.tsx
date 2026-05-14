import { forwardRef, useEffect, useMemo, useRef } from "react"
import { useLocation } from "react-router-dom"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  Bot,
  Eraser,
  Send,
  Sparkles,
  Square,
  User2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useAiChatStore } from "@/store/ai-chat"
import { useBenchmarksStore } from "@/store/benchmarks"
import { useSettingsStore } from "@/store/settings"
import type { Benchmark } from "@/types/benchmark"

const SUGGESTED_PROMPTS_BENCHMARK = [
  "Compare the strengths and weaknesses across the competitors.",
  "Which competitor has the most complete category management?",
  "List features that only one competitor supports.",
  "Summarise the pricing tiers I should highlight in a deck.",
]

const SUGGESTED_PROMPTS_GLOBAL = [
  "Which benchmark has the most competitors documented?",
  "Give me a one-line elevator pitch for each benchmark.",
  "Where should I focus my next research session?",
]

export function AiChatPanel() {
  const open = useAiChatStore((s) => s.open)
  const setOpen = useAiChatStore((s) => s.setOpen)
  const turns = useAiChatStore((s) => s.turns)
  const busy = useAiChatStore((s) => s.busy)
  const send = useAiChatStore((s) => s.send)
  const stop = useAiChatStore((s) => s.stop)
  const reset = useAiChatStore((s) => s.reset)

  const apiKey = useSettingsStore((s) => s.openaiApiKey)
  const model = useSettingsStore((s) => s.openaiModel)
  const benchmarks = useBenchmarksStore((s) => s.benchmarks)

  // Detect the current benchmark from the URL so the assistant gets the
  // right context without each page having to wire it in manually.
  const location = useLocation()
  const benchmarkId = useMemo(() => {
    const m = location.pathname.match(/^\/benchmarks\/([^/]+)/)
    return m?.[1]
  }, [location.pathname])

  const activeBenchmark = useMemo(
    () => (benchmarkId ? benchmarks.find((b) => b.id === benchmarkId) : undefined),
    [benchmarkId, benchmarks]
  )

  const systemPrompt = useMemo(
    () => buildSystemPrompt(activeBenchmark, benchmarks),
    [activeBenchmark, benchmarks]
  )

  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [turns])

  const handleSend = async (text: string) => {
    const value = text.trim()
    if (!value) return
    if (!apiKey) {
      toast.error("Set your OpenAI API key in Settings to use the AI chat.")
      return
    }
    if (inputRef.current) inputRef.current.value = ""
    await send({ text: value, apiKey, model, systemPrompt })
  }

  if (!open) return null

  const suggestions = activeBenchmark
    ? SUGGESTED_PROMPTS_BENCHMARK
    : SUGGESTED_PROMPTS_GLOBAL

  return (
    <aside className="hidden lg:flex h-screen sticky top-0 flex-col border-l bg-sidebar/40">
      <header className="flex h-16 items-center justify-between gap-2 border-b px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">AI Chat</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {activeBenchmark
                ? `Scope: ${activeBenchmark.title}`
                : `Scope: all benchmarks (${benchmarks.length})`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            title="Clear conversation"
            disabled={turns.length === 0 && !busy}
            onClick={reset}
          >
            <Eraser className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="Close"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <EmptyState
            scope={
              activeBenchmark
                ? `the **${activeBenchmark.title}** benchmark`
                : "all benchmarks"
            }
            suggestions={suggestions}
            onPick={handleSend}
            disabled={busy}
          />
        ) : (
          <div className="space-y-4">
            {turns.map((t) => (
              <MessageBubble key={t.id} role={t.role} content={t.content} streaming={t.streaming} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <Separator />

      <Composer
        ref={inputRef}
        busy={busy}
        onSend={handleSend}
        onStop={stop}
        disabled={!apiKey}
      />

      {!apiKey ? (
        <div className="border-t bg-amber-500/10 px-4 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          Set your OpenAI API key in Settings to enable the chat.
        </div>
      ) : null}
    </aside>
  )
}

// =====================================================================
// Sub-components
// =====================================================================

function EmptyState({
  scope,
  suggestions,
  onPick,
  disabled,
}: {
  scope: string
  suggestions: string[]
  onPick: (text: string) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card/60 p-3 text-sm text-muted-foreground">
        <div className="mb-1 flex items-center gap-1.5 text-foreground">
          <Sparkles className="size-3.5 text-primary" />
          <span className="font-medium">Ask anything about {renderInline(scope)}.</span>
        </div>
        The assistant sees competitor profiles, screens, features, group
        labels and pricing tiers as JSON context on every message.
      </div>
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Try a prompt
        </div>
        <div className="space-y-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onPick(s)}
              className={cn(
                "block w-full rounded-md border bg-card px-3 py-2 text-left text-xs text-foreground transition",
                "hover:border-foreground/30 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  role,
  content,
  streaming,
}: {
  role: "user" | "assistant"
  content: string
  streaming?: boolean
}) {
  const isUser = role === "user"
  return (
    <div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {isUser ? <User2 className="size-3.5" /> : <Bot className="size-3.5" />}
      </div>
      <div
        className={cn(
          "min-w-0 rounded-2xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "max-w-[85%] whitespace-pre-wrap bg-primary text-primary-foreground"
            : "max-w-[90%] border bg-card"
        )}
      >
        {isUser ? (
          content
        ) : content ? (
          <MarkdownContent content={content} />
        ) : streaming ? (
          <TypingDots />
        ) : null}
        {streaming && content ? (
          <span className="ml-0.5 inline-block size-1.5 translate-y-[-1px] animate-pulse rounded-full bg-current align-middle" />
        ) : null}
      </div>
    </div>
  )
}

// =====================================================================
// Markdown rendering with theme-aware styling
// =====================================================================

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="my-2 first:mt-0 last:mb-0">{children}</p>
          ),
          h1: ({ children }) => (
            <h2 className="mt-3 mb-1.5 text-base font-semibold tracking-tight">
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h3 className="mt-3 mb-1 text-sm font-semibold tracking-tight">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-3 mb-1 text-sm font-semibold tracking-tight">
              {children}
            </h4>
          ),
          h4: ({ children }) => (
            <h5 className="mt-2 mb-1 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              {children}
            </h5>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="my-1.5 ml-4 list-disc space-y-1 marker:text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1.5 ml-4 list-decimal space-y-1 marker:text-muted-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          hr: () => <hr className="my-2 border-border" />,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className?.includes("language-")
            if (isInline) {
              return (
                <code
                  className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
                  {...props}
                >
                  {children}
                </code>
              )
            }
            return (
              <code
                className="block whitespace-pre-wrap break-words font-mono text-[0.85em]"
                {...props}
              >
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-md border bg-muted/50 p-2 text-xs">
              {children}
            </pre>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-md border">
              <table className="w-full border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/60">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border-b px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b px-2 py-1 align-top">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-current" />
    </span>
  )
}

interface ComposerProps {
  busy: boolean
  disabled: boolean
  onSend: (text: string) => void
  onStop: () => void
}

const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(
  function Composer({ busy, disabled, onSend, onStop }, ref) {
    return (
      <form
        className="space-y-2 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          const el =
            (ref as React.MutableRefObject<HTMLTextAreaElement | null>)?.current
          if (!el) return
          onSend(el.value)
        }}
      >
        <Textarea
          ref={ref}
          placeholder="Ask anything about this benchmark…"
          rows={3}
          disabled={disabled}
          className="resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              const el = e.currentTarget
              onSend(el.value)
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className="font-normal">
            Enter to send · Shift+Enter for newline
          </Badge>
          {busy ? (
            <Button type="button" size="sm" variant="outline" onClick={onStop}>
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={disabled}>
              <Send className="size-3.5" />
              Send
            </Button>
          )}
        </div>
      </form>
    )
  }
)

// =====================================================================
// Context builder
// =====================================================================

const MAX_FEATURE_DESCRIPTION = 320
const MAX_NOTES = 240

function trim(s?: string, max = MAX_NOTES) {
  if (!s) return undefined
  const t = s.trim()
  if (!t) return undefined
  return t.length > max ? t.slice(0, max) + "…" : t
}

function snapshotBenchmark(b: Benchmark) {
  return {
    title: b.title,
    category: b.category,
    status: b.status,
    summary: trim(b.summary, 600),
    owner: b.owner,
    criteria: b.criteria,
    competitors: b.competitors.map((c) => ({
      name: c.name,
      tier: c.tier,
      website: c.website,
      tagline: trim(c.tagline),
      description: trim(c.description, 400),
      strengths: c.strengths,
      weaknesses: c.weaknesses,
      pricing: c.pricing?.map((p) => ({
        plan: p.plan,
        price: p.price,
        highlights: trim(p.highlights),
      })),
      sections: c.sections,
      screens: (c.screens ?? []).map((s) => ({
        title: s.title,
        section: s.section,
        sourceUrl: s.sourceUrl,
        notes: trim(s.notes),
      })),
      features: (c.features ?? []).map((f) => ({
        name: f.name,
        groupLabel: f.groupLabel,
        category: f.category,
        support: f.support,
        description: trim(f.description, MAX_FEATURE_DESCRIPTION),
        notes: trim(f.notes),
      })),
    })),
  }
}

function buildSystemPrompt(
  current: Benchmark | undefined,
  all: Benchmark[]
): string {
  const intro = `You are an embedded analyst inside Benchmark Studio, a tool
that documents competing products through screenshots, features and pricing.
You help the user reason about their benchmark data: comparing competitors,
identifying gaps, drafting summaries, and answering specific questions about
features or screens.

GROUND RULES
- Answer ONLY from the JSON CONTEXT provided below. Do not invent
  competitors, features, screens or numbers that aren't in the data.
- If the user's question can't be answered from the context, say so
  plainly and suggest what they could add to the benchmark.
- Cite competitor names verbatim. When you reference a feature, prefer the
  group label (canonical name) when available and mention the
  per-competitor name in parentheses when it differs.
- Be concise but specific: bullet lists when comparing 3+ items, short
  paragraphs otherwise.
- The data the user sees in the app is the truth — if numbers feel wrong,
  flag it as a data-entry issue, don't invent a correction.`

  if (current) {
    const payload = snapshotBenchmark(current)
    return `${intro}\n\nCONTEXT SCOPE: a single benchmark.\n\nJSON CONTEXT:\n${JSON.stringify(
      payload,
      null,
      2
    )}`
  }

  const overview = {
    benchmarks: all.map((b) => ({
      id: b.id,
      title: b.title,
      category: b.category,
      status: b.status,
      competitorCount: b.competitors.length,
      competitorNames: b.competitors.map((c) => c.name),
      summary: trim(b.summary, 280),
    })),
  }
  return `${intro}\n\nCONTEXT SCOPE: an overview of all benchmarks (no single benchmark selected). Encourage the user to open a benchmark for deeper analysis.\n\nJSON CONTEXT:\n${JSON.stringify(
    overview,
    null,
    2
  )}`
}

// =====================================================================
// Tiny inline markdown: turns `**bold**` into a <strong>.
// =====================================================================

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    )
  )
}
