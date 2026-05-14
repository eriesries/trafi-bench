import { useEffect } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  LayoutDashboard,
  Loader2,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useBenchmarksStore } from "@/store/benchmarks"
import { useAiChatStore } from "@/store/ai-chat"
import { SettingsDialog } from "@/components/settings/SettingsDialog"
import { AiChatPanel } from "@/components/ai/AiChatPanel"
import { SUPABASE_CONFIGURED } from "@/lib/supabase"
import { toast } from "sonner"
import { formatError } from "@/lib/errors"

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/benchmarks", label: "Benchmarks", icon: BarChart3 },
  { to: "/competitors", label: "Competitors", icon: Target },
  { to: "/trash", label: "Trash", icon: Trash2 },
]

export function AppLayout() {
  const navigate = useNavigate()
  const create = useBenchmarksStore((s) => s.createBenchmark)
  const loadAll = useBenchmarksStore((s) => s.loadAll)
  const loading = useBenchmarksStore((s) => s.loading)
  const loaded = useBenchmarksStore((s) => s.loaded)
  const error = useBenchmarksStore((s) => s.error)
  const chatOpen = useAiChatStore((s) => s.open)
  const toggleChat = useAiChatStore((s) => s.toggle)

  useEffect(() => {
    if (SUPABASE_CONFIGURED) {
      void loadAll()
    }
  }, [loadAll])

  const handleNewBenchmark = async () => {
    try {
      const bm = await create({
        title: "New benchmark",
        category: "Uncategorized",
        status: "draft",
      })
      toast.success("Benchmark created")
      navigate(`/benchmarks/${bm.id}/edit`)
    } catch (e) {
      toast.error("Failed to create benchmark", {
        description: formatError(e),
      })
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        className={cn(
          "grid min-h-screen grid-cols-1",
          chatOpen
            ? "lg:grid-cols-[260px_1fr_380px]"
            : "lg:grid-cols-[260px_1fr]"
        )}
      >
        <aside className="hidden border-r bg-sidebar lg:flex lg:flex-col">
          <div className="flex h-16 items-center gap-2 px-6">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BarChart3 className="size-4" />
            </div>
            <div className="font-semibold tracking-tight">Benchmark Studio</div>
          </div>
          <Separator />
          <nav className="flex-1 space-y-1 p-3">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="p-3">
            <Button className="w-full" onClick={handleNewBenchmark}>
              <Plus className="size-4" />
              New benchmark
            </Button>
          </div>
        </aside>

        <main className="flex min-w-0 flex-col">
          <header className="flex h-16 items-center justify-between border-b px-4 lg:px-8">
            <div className="lg:hidden flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <BarChart3 className="size-4" />
              </div>
              <div className="font-semibold">Benchmark Studio</div>
            </div>
            <div className="hidden lg:block text-sm text-muted-foreground">
              Document and compare your competitors with clarity.
            </div>
            <div className="flex items-center gap-2">
              <SyncStatus
                loading={loading}
                loaded={loaded}
                error={error}
                onRetry={() => void loadAll()}
              />
              <Button
                size="sm"
                variant={chatOpen ? "secondary" : "outline"}
                onClick={toggleChat}
                title={chatOpen ? "Hide AI Chat" : "Open AI Chat"}
                className="hidden lg:inline-flex"
              >
                <Sparkles className="size-4" />
                <span>{chatOpen ? "AI Chat" : "Ask AI"}</span>
              </Button>
              <SettingsDialog
                trigger={
                  <Button size="sm" variant="ghost">
                    <SettingsIcon className="size-4" />
                    <span className="hidden sm:inline">Settings</span>
                  </Button>
                }
              />
              <Button
                size="sm"
                variant="outline"
                className="lg:hidden"
                onClick={handleNewBenchmark}
              >
                <Plus className="size-4" />
                New
              </Button>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 lg:py-10">
            {!SUPABASE_CONFIGURED ? (
              <SupabaseNotConfigured />
            ) : !loaded ? (
              <LoadingFromSupabase />
            ) : (
              <Outlet />
            )}
          </div>
        </main>

        <AiChatPanel />
      </div>
    </div>
  )
}

function SyncStatus({
  loading,
  loaded,
  error,
  onRetry,
}: {
  loading: boolean
  loaded: boolean
  error: string | null
  onRetry: () => void
}) {
  if (!SUPABASE_CONFIGURED) {
    return (
      <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
        <AlertTriangle className="size-3" />
        Supabase not configured
      </span>
    )
  }
  if (error) {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-500/20 dark:text-red-300"
        title={error}
      >
        <AlertTriangle className="size-3" />
        Sync error · retry
      </button>
    )
  }
  if (loading) {
    return (
      <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-muted-foreground/20 bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Syncing…
      </span>
    )
  }
  if (loaded) {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300"
        title="Refresh from Supabase"
      >
        <CheckCircle2 className="size-3" />
        Synced
        <RefreshCw className="size-3 opacity-60" />
      </button>
    )
  }
  return null
}

function LoadingFromSupabase() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 py-24 text-center text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
      <p className="text-sm">Loading benchmarks from Supabase…</p>
    </div>
  )
}

function SupabaseNotConfigured() {
  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-amber-500/30 bg-amber-500/5 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 text-amber-600" />
        <div className="space-y-2">
          <h2 className="text-base font-semibold">Supabase not configured</h2>
          <p className="text-sm text-muted-foreground">
            Add the following to your{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              .env.local
            </code>{" "}
            and restart the dev server:
          </p>
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs">
            {`VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`}
          </pre>
          <p className="text-sm text-muted-foreground">
            Then run the SQL in{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              supabase/schema.sql
            </code>{" "}
            inside your Supabase project's SQL editor.
          </p>
        </div>
      </div>
    </div>
  )
}
