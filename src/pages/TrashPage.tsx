import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  AlertTriangle,
  ExternalLink,
  FolderTree,
  ImageIcon,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"

import { useBenchmarksStore } from "@/store/benchmarks"
import { formatError } from "@/lib/errors"

type PurgeTarget =
  | { kind: "benchmark"; id: string; title: string }
  | { kind: "competitor"; id: string; title: string }
  | { kind: "screen"; id: string; title: string }

function formatDeletedAt(value?: string) {
  if (!value) return ""
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

export function TrashPage() {
  const trash = useBenchmarksStore((s) => s.trash)
  const trashLoading = useBenchmarksStore((s) => s.trashLoading)
  const trashError = useBenchmarksStore((s) => s.trashError)
  const loadTrash = useBenchmarksStore((s) => s.loadTrash)
  const restoreBenchmark = useBenchmarksStore((s) => s.restoreBenchmark)
  const purgeBenchmark = useBenchmarksStore((s) => s.purgeBenchmark)
  const restoreCompetitor = useBenchmarksStore((s) => s.restoreCompetitor)
  const purgeCompetitor = useBenchmarksStore((s) => s.purgeCompetitor)
  const restoreScreen = useBenchmarksStore((s) => s.restoreScreen)
  const purgeScreen = useBenchmarksStore((s) => s.purgeScreen)

  const [pendingPurge, setPendingPurge] = useState<PurgeTarget | null>(null)

  useEffect(() => {
    void loadTrash()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const total = useMemo(
    () =>
      trash.benchmarks.length +
      trash.competitors.length +
      trash.screens.length,
    [trash]
  )

  const handleRestoreBenchmark = async (id: string, title: string) => {
    try {
      await restoreBenchmark(id)
      toast.success(`Restored "${title}"`)
    } catch (e) {
      toast.error("Failed to restore benchmark", {
        description: formatError(e),
      })
    }
  }

  const handleRestoreCompetitor = async (id: string, title: string) => {
    try {
      await restoreCompetitor(id)
      toast.success(`Restored "${title}"`)
    } catch (e) {
      toast.error("Failed to restore competitor", {
        description: formatError(e),
      })
    }
  }

  const handleRestoreScreen = async (id: string, title: string) => {
    try {
      await restoreScreen(id)
      toast.success(`Restored "${title}"`)
    } catch (e) {
      toast.error("Failed to restore screen", {
        description: formatError(e),
      })
    }
  }

  const handleConfirmPurge = async () => {
    if (!pendingPurge) return
    try {
      switch (pendingPurge.kind) {
        case "benchmark":
          await purgeBenchmark(pendingPurge.id)
          break
        case "competitor":
          await purgeCompetitor(pendingPurge.id)
          break
        case "screen":
          await purgeScreen(pendingPurge.id)
          break
      }
      toast.success(`Permanently deleted "${pendingPurge.title}"`)
    } catch (e) {
      toast.error("Failed to permanently delete", {
        description: formatError(e),
      })
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Trash</h1>
          <p className="text-muted-foreground">
            Deleted items stay here until you restore or permanently remove
            them. Storage files are kept intact until a permanent delete.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadTrash()}
            disabled={trashLoading}
          >
            {trashLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCcw className="size-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {trashError ? (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" />
              Couldn't load Trash
            </CardTitle>
            <CardDescription>{trashError}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {!trashLoading && total === 0 && !trashError ? (
        <Card>
          <CardHeader>
            <CardTitle>Empty</CardTitle>
            <CardDescription>
              Nothing in the trash right now. Items you delete will appear here
              and stay until you permanently remove them.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {trash.benchmarks.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Benchmarks ({trash.benchmarks.length})</CardTitle>
            <CardDescription>
              Restoring a benchmark brings back the whole study. Competitors
              and screens that were deleted on their own remain in their own
              sections below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {trash.benchmarks.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <div className="font-medium">{b.title}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-1.5 py-0.5 mr-2">
                      {b.category}
                    </span>
                    Deleted {formatDeletedAt(b.deletedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestoreBenchmark(b.id, b.title)}
                  >
                    <RotateCcw className="size-3.5" />
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() =>
                      setPendingPurge({
                        kind: "benchmark",
                        id: b.id,
                        title: b.title,
                      })
                    }
                  >
                    <Trash2 className="size-3.5" />
                    Delete forever
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {trash.competitors.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Competitors ({trash.competitors.length})</CardTitle>
            <CardDescription>
              These competitors were deleted on their own. Their parent
              benchmark is still active.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {trash.competitors.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {c.name}
                    <Badge variant="outline" className="text-[10px]">
                      {c.tier}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <Link
                      to={`/benchmarks/${c.benchmarkId}`}
                      className="underline hover:text-foreground"
                    >
                      {c.benchmarkTitle}
                    </Link>{" "}
                    · Deleted {formatDeletedAt(c.deletedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestoreCompetitor(c.id, c.name)}
                  >
                    <RotateCcw className="size-3.5" />
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() =>
                      setPendingPurge({
                        kind: "competitor",
                        id: c.id,
                        title: c.name,
                      })
                    }
                  >
                    <Trash2 className="size-3.5" />
                    Delete forever
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {trash.screens.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Screens ({trash.screens.length})</CardTitle>
            <CardDescription>
              Individual screens deleted from competitors. The screenshot
              files are still in Storage until a permanent delete.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {trash.screens.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex min-w-0 items-start gap-3">
                  {s.imageUrl ? (
                    <img
                      src={s.imageUrl}
                      alt={s.title}
                      className="size-16 shrink-0 rounded-md border object-cover"
                    />
                  ) : (
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                      <ImageIcon className="size-5" />
                    </div>
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-medium">{s.title}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Link
                        to={`/benchmarks/${s.benchmarkId}`}
                        className="underline hover:text-foreground"
                      >
                        {s.benchmarkTitle}
                      </Link>
                      <span>→</span>
                      <span>{s.competitorName}</span>
                      {s.section ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5">
                          <FolderTree className="size-3" />
                          {s.section}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Deleted {formatDeletedAt(s.deletedAt)}
                      {s.sourceUrl ? (
                        <>
                          {" · "}
                          <a
                            href={s.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 underline hover:text-foreground"
                          >
                            <ExternalLink className="size-3" />
                            source
                          </a>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestoreScreen(s.id, s.title)}
                  >
                    <RotateCcw className="size-3.5" />
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() =>
                      setPendingPurge({
                        kind: "screen",
                        id: s.id,
                        title: s.title,
                      })
                    }
                  >
                    <Trash2 className="size-3.5" />
                    Delete forever
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={!!pendingPurge}
        onOpenChange={(open) => {
          if (!open) setPendingPurge(null)
        }}
        title={
          pendingPurge?.kind === "benchmark"
            ? "Permanently delete benchmark?"
            : pendingPurge?.kind === "competitor"
              ? "Permanently delete competitor?"
              : "Permanently delete screen?"
        }
        description={
          pendingPurge
            ? `"${pendingPurge.title}" will be removed from the database. Storage files (screenshots) will also be deleted. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete permanently"
        variant="danger"
        onConfirm={handleConfirmPurge}
      />
    </div>
  )
}
