import { useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  ExternalLink,
  ImageIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScreensSection } from "@/components/screens/ScreensSection"
import { useBenchmark, useBenchmarksStore } from "@/store/benchmarks"
import {
  statusLabel,
  statusVariant,
  supportColor,
  supportLabel,
  tierLabel,
} from "@/lib/labels"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { formatError } from "@/lib/errors"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { AddCompetitorDialog } from "@/components/competitors/AddCompetitorDialog"
import type { Competitor, Feature, Screen } from "@/types/benchmark"
import { useSettingsStore } from "@/store/settings"

export function BenchmarkDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const benchmark = useBenchmark(id)
  const removeBenchmark = useBenchmarksStore((s) => s.deleteBenchmark)
  const autoGroupFeatures = useBenchmarksStore((s) => s.autoGroupFeatures)
  const apiKey = useSettingsStore((s) => s.openaiApiKey)
  const model = useSettingsStore((s) => s.openaiModel)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [grouping, setGrouping] = useState(false)

  if (!benchmark) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Benchmark not found</CardTitle>
            <CardDescription>
              The requested benchmark doesn't exist or was deleted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/benchmarks">
                <ArrowLeft className="size-4" />
                Back to list
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  /**
   * Build the matrix rows by clustering features across competitors.
   * Rule of thumb for the grouping key:
   *   1. If the feature has an explicit `groupKey` (set by AI auto-group
   *      or a future manual override), use that.
   *   2. Otherwise, fall back to a normalised name (lowercase, strip the
   *      "Section — " prefix, collapse punctuation/stopwords) so that
   *      simple lexical variations still merge automatically.
   * Each row tracks the canonical label and the feature each competitor
   * contributed to that row.
   */
  const matrixRows = useMemo(
    () => buildMatrixRows(benchmark.competitors),
    [benchmark.competitors]
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/benchmarks">
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to={`/benchmarks/${benchmark.id}/edit`}>
              <Pencil className="size-4" />
              Edit
            </Link>
          </Button>
          <Button
            variant="destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(benchmark.status)}>
            {statusLabel(benchmark.status)}
          </Badge>
          <Badge variant="outline">{benchmark.category}</Badge>
          {benchmark.owner ? (
            <span className="text-sm text-muted-foreground">
              · owner: {benchmark.owner}
            </span>
          ) : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {benchmark.title}
        </h1>
        {benchmark.summary ? (
          <p className="max-w-3xl text-muted-foreground">{benchmark.summary}</p>
        ) : null}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="screens">
            Screens
            {benchmark.competitors.reduce(
              (acc, c) => acc + (c.screens?.length ?? 0),
              0
            ) > 0 ? (
              <Badge variant="secondary" className="ml-1">
                {benchmark.competitors.reduce(
                  (acc, c) => acc + (c.screens?.length ?? 0),
                  0
                )}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="matrix">Feature matrix</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="docs">Documentation</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {benchmark.competitors.length} competitor
              {benchmark.competitors.length === 1 ? "" : "s"} in this benchmark.
            </div>
            <AddCompetitorDialog
              benchmarkId={benchmark.id}
              onCreated={(c) =>
                navigate(`/benchmarks/${benchmark.id}/competitors/${c.id}`)
              }
            />
          </div>
          {benchmark.competitors.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No competitors added yet. Click <strong>Add competitor</strong>{" "}
                above to start.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {benchmark.competitors.map((c) => (
                <Card key={c.id} className="overflow-hidden">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="flex items-center gap-2">
                          {c.name}
                          {c.website ? (
                            <a
                              href={c.website}
                              target="_blank"
                              rel="noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="size-3.5" />
                            </a>
                          ) : null}
                        </CardTitle>
                        {c.tagline ? (
                          <CardDescription>{c.tagline}</CardDescription>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <Badge variant="secondary">{tierLabel(c.tier)}</Badge>
                        {typeof c.overallScore === "number" ? (
                          <div className="mt-1 text-2xl font-semibold leading-none tracking-tight">
                            {c.overallScore.toFixed(1)}
                            <span className="text-xs text-muted-foreground">
                              /10
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {c.description ? (
                      <p className="text-sm text-muted-foreground">
                        {c.description}
                      </p>
                    ) : null}

                    <ScreensPreview
                      benchmarkId={benchmark.id}
                      competitorId={c.id}
                      screens={c.screens ?? []}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">
                          Strengths
                        </div>
                        <ul className="mt-1 space-y-0.5 text-sm">
                          {c.strengths.length === 0 ? (
                            <li className="text-muted-foreground">—</li>
                          ) : (
                            c.strengths.map((s) => <li key={s}>• {s}</li>)
                          )}
                        </ul>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">
                          Weaknesses
                        </div>
                        <ul className="mt-1 space-y-0.5 text-sm">
                          {c.weaknesses.length === 0 ? (
                            <li className="text-muted-foreground">—</li>
                          ) : (
                            c.weaknesses.map((s) => <li key={s}>• {s}</li>)
                          )}
                        </ul>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button asChild variant="outline" size="sm">
                        <Link
                          to={`/benchmarks/${benchmark.id}/competitors/${c.id}`}
                        >
                          <Pencil className="size-4" />
                          Edit competitor
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="screens" className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              Screens grouped by competitor. Each competitor has its own
              gallery and AI-extracted features.
            </div>
            <AddCompetitorDialog
              benchmarkId={benchmark.id}
              triggerLabel="Add competitor"
              triggerVariant="outline"
              onCreated={(c) =>
                navigate(`/benchmarks/${benchmark.id}/competitors/${c.id}`)
              }
            />
          </div>
          {benchmark.competitors.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Add at least one competitor before uploading screens.
              </CardContent>
            </Card>
          ) : (
            benchmark.competitors.map((c) => (
              <div key={c.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      {c.name}
                    </div>
                    {c.tagline ? (
                      <div className="text-xs text-muted-foreground">
                        {c.tagline}
                      </div>
                    ) : null}
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link
                      to={`/benchmarks/${benchmark.id}/competitors/${c.id}`}
                    >
                      Open competitor
                    </Link>
                  </Button>
                </div>
                <ScreensSection
                  benchmarkId={benchmark.id}
                  competitorId={c.id}
                  competitorName={c.name}
                />
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="matrix">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1.5">
                <CardTitle>Comparison matrix</CardTitle>
                <CardDescription>
                  Support for each capability per competitor. Features with
                  the same name (or AI-clustered) collapse into a single row.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    grouping ||
                    benchmark.competitors.length < 1 ||
                    matrixRows.length === 0
                  }
                  onClick={async () => {
                    if (!apiKey) {
                      toast.error(
                        "Set your OpenAI API key in Settings to auto-group features."
                      )
                      return
                    }
                    setGrouping(true)
                    try {
                      const res = await autoGroupFeatures(benchmark.id, {
                        apiKey,
                        model,
                      })
                      toast.success(
                        `Grouped into ${res.clusters} cluster${res.clusters === 1 ? "" : "s"} — ${res.merged} feature${res.merged === 1 ? "" : "s"} merged across competitors.`
                      )
                    } catch (err) {
                      toast.error(formatError(err))
                    } finally {
                      setGrouping(false)
                    }
                  }}
                >
                  {grouping ? "Grouping…" : "Auto-group with AI"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {benchmark.competitors.length === 0 || matrixRows.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Add competitors and features to generate the matrix.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[240px]">
                          Capability
                        </TableHead>
                        {benchmark.competitors.map((c) => (
                          <TableHead key={c.id} className="text-center">
                            {c.name}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matrixRows.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell className="font-medium">
                            <div>{row.label}</div>
                            {row.reach > 1 ? (
                              <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                                {row.reach} competitors
                              </div>
                            ) : null}
                          </TableCell>
                          {benchmark.competitors.map((c) => {
                            const f = row.byCompetitor.get(c.id)
                            const support = f?.support ?? "unknown"
                            const tooltip = [
                              f?.name && f.name !== row.label
                                ? `Named here: ${f.name}`
                                : null,
                              f?.description,
                              f?.notes,
                            ]
                              .filter(Boolean)
                              .join("\n\n")
                            return (
                              <TableCell key={c.id} className="text-center">
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                    f
                                      ? supportColor(support)
                                      : "bg-muted text-muted-foreground"
                                  )}
                                  title={tooltip || undefined}
                                >
                                  {f ? supportLabel(support) : "—"}
                                </span>
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {benchmark.competitors.map((c) => (
              <Card key={c.id}>
                <CardHeader>
                  <CardTitle>{c.name}</CardTitle>
                  <CardDescription>
                    {c.pricing.length} plan
                    {c.pricing.length === 1 ? "" : "s"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {c.pricing.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No plans registered.
                    </div>
                  ) : (
                    c.pricing.map((p, idx) => (
                      <div
                        key={`${p.plan}-${idx}`}
                        className="rounded-md border p-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{p.plan}</div>
                          <div className="text-sm font-semibold">
                            {p.price}
                          </div>
                        </div>
                        {p.highlights ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {p.highlights}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="docs">
          <div className="space-y-4">
            {benchmark.competitors.map((c) => (
              <Card key={c.id}>
                <CardHeader>
                  <CardTitle>{c.name}</CardTitle>
                  {c.tagline ? (
                    <CardDescription>{c.tagline}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {c.notes ? (
                    <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-4 text-sm leading-relaxed">
                      {c.notes}
                    </pre>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No documentation registered.
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Move benchmark to trash?"
        description={`"${benchmark.title}" will be hidden from active views along with its ${benchmark.competitors.length} competitor(s) and their screens. You can restore it from Trash later.`}
        confirmLabel="Move to trash"
        variant="danger"
        onConfirm={async () => {
          try {
            await removeBenchmark(benchmark.id)
            toast.success("Moved to trash")
            navigate("/benchmarks")
          } catch (e) {
            toast.error("Failed to delete benchmark", {
              description: formatError(e),
            })
          }
        }}
      />
    </div>
  )
}

/**
 * Compact horizontal strip of screen thumbnails shown on the
 * benchmark-overview competitor cards. Up to 4 thumbnails are shown
 * inline; anything beyond becomes a "+N" tile.
 */
function ScreensPreview({
  benchmarkId,
  competitorId,
  screens,
}: {
  benchmarkId: string
  competitorId: string
  screens: Screen[]
}) {
  const total = screens.length
  const competitorLink = `/benchmarks/${benchmarkId}/competitors/${competitorId}?tab=screens`

  if (total === 0) {
    return (
      <div className="flex items-center justify-between rounded-md border border-dashed bg-muted/30 px-3 py-2.5 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <ImageIcon className="size-4" />
          No screens yet
        </div>
        <Link
          to={competitorLink}
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
        >
          <Plus className="size-3" />
          Add screens
        </Link>
      </div>
    )
  }

  const visible = screens.slice(0, 4)
  const overflow = Math.max(0, total - visible.length)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
            {total}
          </span>{" "}
          screen{total === 1 ? "" : "s"}
        </div>
        <Link
          to={competitorLink}
          className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          View all →
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {visible.map((s) => (
          <Link
            key={s.id}
            to={competitorLink}
            title={s.title}
            className="group relative block overflow-hidden rounded-md border bg-muted/30 transition hover:border-foreground/30"
          >
            <div className="aspect-video w-full overflow-hidden">
              {s.imageUrl ? (
                <img
                  src={s.imageUrl}
                  alt={s.title}
                  className="size-full object-cover transition group-hover:scale-[1.03]"
                  loading="lazy"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageIcon className="size-4" />
                </div>
              )}
            </div>
          </Link>
        ))}
        {overflow > 0 ? (
          <Link
            to={competitorLink}
            className="flex aspect-video items-center justify-center rounded-md border bg-muted/40 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            +{overflow} more
          </Link>
        ) : null}
      </div>
    </div>
  )
}

// =====================================================================
// Feature matrix grouping helpers
// =====================================================================

/**
 * Lightweight, deterministic normalisation used as the FALLBACK matrix
 * grouping key when a feature has no AI-assigned `groupKey`. Strips a
 * leading "Section — " prefix (the convention used by the screen-analysis
 * prompt), lowercases, removes punctuation and a small stop-word list,
 * and collapses whitespace. Two features that differ only by these
 * variations will still merge into the same matrix row.
 */
function normalizeFeatureName(raw: string): string {
  if (!raw) return ""
  // Strip the section prefix produced by the AI ("Section — Feature").
  const trimmed = raw.split(/—|–|-->/).slice(-1)[0] ?? raw
  return trimmed
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(
      /\b(the|a|an|to|of|in|with|on|for|by|and|or|page|tab|section)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim()
}

interface MatrixRow {
  key: string
  label: string
  /** Which competitor contributed which feature, indexed by competitor id. */
  byCompetitor: Map<string, Feature>
  /** How many distinct competitors are represented in this row. */
  reach: number
}

function buildMatrixRows(competitors: Competitor[]): MatrixRow[] {
  const rowsByKey = new Map<string, MatrixRow>()

  for (const c of competitors) {
    for (const f of c.features ?? []) {
      const key = f.groupKey || `norm:${normalizeFeatureName(f.name)}` || f.id
      let row = rowsByKey.get(key)
      if (!row) {
        row = {
          key,
          label: f.groupLabel || f.name,
          byCompetitor: new Map(),
          reach: 0,
        }
        rowsByKey.set(key, row)
      } else if (f.groupLabel && !row.label.toLowerCase().includes("—")) {
        // Prefer an AI-assigned canonical label when available.
        row.label = f.groupLabel
      }
      if (!row.byCompetitor.has(c.id)) {
        row.byCompetitor.set(c.id, f)
        row.reach += 1
      }
    }
  }

  return Array.from(rowsByKey.values()).sort((a, b) => {
    if (a.reach !== b.reach) return b.reach - a.reach
    return a.label.localeCompare(b.label)
  })
}

