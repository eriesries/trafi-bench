import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowUpRight,
  ExternalLink,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useBenchmarksStore } from "@/store/benchmarks"
import { useCanvas } from "@/hooks/useCanvas"
import { cn } from "@/lib/utils"
import type { Benchmark, Competitor, Screen } from "@/types/benchmark"

const UNCATEGORISED = "Uncategorised"

interface ScreenNode {
  benchmark: Benchmark
  competitor: Competitor
  screen: Screen
}

interface CompetitorRow {
  competitor: Competitor
  benchmark: Benchmark
  screens: Screen[]
}

interface SectionArtboard {
  section: string
  rows: CompetitorRow[]
  totalScreens: number
}

export function WorkspacePage() {
  const benchmarks = useBenchmarksStore((s) => s.benchmarks)

  // --- Filters -------------------------------------------------------
  const [benchmarkFilter, setBenchmarkFilter] = useState<string>("all")
  const [sectionFilter, setSectionFilter] = useState<string>("all")
  const [search, setSearch] = useState("")
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null)

  const flatScreens: ScreenNode[] = useMemo(() => {
    const out: ScreenNode[] = []
    for (const b of benchmarks) {
      for (const c of b.competitors) {
        for (const s of c.screens ?? []) {
          out.push({ benchmark: b, competitor: c, screen: s })
        }
      }
    }
    return out
  }, [benchmarks])

  const allSections = useMemo(() => {
    const set = new Set<string>()
    for (const n of flatScreens) set.add(n.screen.section || UNCATEGORISED)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [flatScreens])

  const filteredScreens = useMemo(() => {
    const q = search.trim().toLowerCase()
    return flatScreens.filter((n) => {
      if (benchmarkFilter !== "all" && n.benchmark.id !== benchmarkFilter)
        return false
      const sectionLabel = n.screen.section || UNCATEGORISED
      if (sectionFilter !== "all" && sectionLabel !== sectionFilter)
        return false
      if (q) {
        const haystack = [
          n.screen.title,
          n.screen.section,
          n.screen.notes,
          n.competitor.name,
          n.benchmark.title,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [flatScreens, benchmarkFilter, sectionFilter, search])

  const artboards: SectionArtboard[] = useMemo(() => {
    const bySection = new Map<string, Map<string, CompetitorRow>>()
    for (const n of filteredScreens) {
      const sectionKey = n.screen.section || UNCATEGORISED
      if (!bySection.has(sectionKey)) bySection.set(sectionKey, new Map())
      const competitorMap = bySection.get(sectionKey)!
      const competitorKey = `${n.benchmark.id}__${n.competitor.id}`
      if (!competitorMap.has(competitorKey)) {
        competitorMap.set(competitorKey, {
          competitor: n.competitor,
          benchmark: n.benchmark,
          screens: [],
        })
      }
      competitorMap.get(competitorKey)!.screens.push(n.screen)
    }
    return Array.from(bySection.entries())
      .map(([section, competitorMap]) => {
        const rows = Array.from(competitorMap.values()).sort((a, b) =>
          a.competitor.name.localeCompare(b.competitor.name)
        )
        const totalScreens = rows.reduce((acc, r) => acc + r.screens.length, 0)
        return { section, rows, totalScreens }
      })
      .sort((a, b) => {
        // Push "Uncategorised" to the end, otherwise alphabetical.
        if (a.section === UNCATEGORISED) return 1
        if (b.section === UNCATEGORISED) return -1
        return a.section.localeCompare(b.section)
      })
  }, [filteredScreens])

  // --- Canvas controller --------------------------------------------
  const canvas = useCanvas({ initialZoom: 0.55 })

  // Fit the canvas to content the first time data is available and any
  // time the filtered set changes meaningfully (count of screens).
  const hasFitRef = useRef(false)
  const lastCountRef = useRef(0)
  useEffect(() => {
    const count = filteredScreens.length
    if (count === 0) return
    if (!hasFitRef.current || Math.abs(count - lastCountRef.current) > 0) {
      // Wait for the world to lay out before measuring.
      const id = requestAnimationFrame(() => canvas.fitToContent(80))
      hasFitRef.current = true
      lastCountRef.current = count
      return () => cancelAnimationFrame(id)
    }
  }, [filteredScreens.length, canvas])

  // --- Preview -------------------------------------------------------
  const selectedNode = useMemo(
    () =>
      selectedScreenId
        ? flatScreens.find((n) => n.screen.id === selectedScreenId) ?? null
        : null,
    [flatScreens, selectedScreenId]
  )

  return (
    <div className="-mx-4 -my-6 lg:-mx-8 lg:-my-10 flex h-[calc(100vh-4rem)] flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2">
        <div className="flex items-center gap-1.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Layers className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">Workspace</div>
            <div className="text-[11px] leading-tight text-muted-foreground">
              {filteredScreens.length} screen
              {filteredScreens.length === 1 ? "" : "s"} · {artboards.length}{" "}
              artboard{artboards.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search screens"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48 pl-7 text-xs"
            />
          </div>
          <Select value={benchmarkFilter} onValueChange={setBenchmarkFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="All benchmarks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All benchmarks</SelectItem>
              {benchmarks.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="All sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {allSections.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-0.5 rounded-md border bg-card p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={canvas.zoomOut}
              title="Zoom out (-)"
            >
              <Minus className="size-3.5" />
            </Button>
            <span className="w-12 text-center text-[11px] tabular-nums">
              {Math.round(canvas.state.zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={canvas.zoomIn}
              title="Zoom in (+)"
            >
              <Plus className="size-3.5" />
            </Button>
            <div className="mx-0.5 h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => canvas.fitToContent(80)}
              title="Fit to content (1)"
            >
              <Maximize2 className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={canvas.resetView}
              title="Reset view (0)"
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Canvas viewport */}
      <div
        ref={canvas.viewportRef}
        {...canvas.bind}
        className={cn(
          "relative flex-1 select-none overflow-hidden bg-[radial-gradient(circle_at_1px_1px,_theme(colors.border)_1px,_transparent_0)]",
          "[background-size:24px_24px] cursor-grab",
          "[&:active]:cursor-grabbing"
        )}
        data-canvas-background="true"
      >
        {filteredScreens.length === 0 ? (
          <EmptyState />
        ) : (
          <div
            ref={canvas.worldRef}
            style={canvas.worldStyle}
            className="absolute inset-0 origin-top-left will-change-transform"
            data-canvas-background="true"
          >
            <div
              className="flex flex-col gap-12 p-12"
              data-canvas-background="true"
            >
              {artboards.map((ab) => (
                <Artboard
                  key={ab.section}
                  artboard={ab}
                  onScreenClick={(s) => setSelectedScreenId(s.id)}
                />
              ))}
            </div>
          </div>
        )}

        <HelpHint />
      </div>

      {/* Preview Sheet */}
      <Sheet
        open={!!selectedNode}
        onOpenChange={(o) => !o && setSelectedScreenId(null)}
      >
        <SheetContent side="right" className="sm:max-w-2xl">
          {selectedNode ? (
            <ScreenPreview node={selectedNode} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// =====================================================================
// Artboard / cards
// =====================================================================

const THUMB_WIDTH = 280
const THUMB_HEIGHT = Math.round((THUMB_WIDTH * 9) / 16)
const COMPETITOR_LABEL_WIDTH = 170

function Artboard({
  artboard,
  onScreenClick,
}: {
  artboard: SectionArtboard
  onScreenClick: (s: Screen) => void
}) {
  return (
    <section className="rounded-2xl border border-foreground/15 bg-card/95 shadow-sm">
      <header className="flex items-center gap-3 border-b px-5 py-3">
        <h3 className="text-base font-semibold tracking-tight">
          {artboard.section}
        </h3>
        <Badge variant="secondary" className="font-normal">
          {artboard.rows.length} competitor
          {artboard.rows.length === 1 ? "" : "s"}
        </Badge>
        <Badge variant="outline" className="font-normal">
          {artboard.totalScreens} screen
          {artboard.totalScreens === 1 ? "" : "s"}
        </Badge>
      </header>
      <div className="space-y-4 p-5">
        {artboard.rows.map((row) => (
          <div
            key={`${row.benchmark.id}__${row.competitor.id}`}
            className="flex items-start gap-4"
          >
            <div
              className="shrink-0 pt-1"
              style={{ width: COMPETITOR_LABEL_WIDTH }}
            >
              <div className="text-sm font-medium leading-tight">
                {row.competitor.name}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {row.benchmark.title}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {row.screens.length} screen
                {row.screens.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {row.screens.map((s) => (
                <ScreenCard
                  key={s.id}
                  screen={s}
                  onClick={() => onScreenClick(s)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ScreenCard({
  screen,
  onClick,
}: {
  screen: Screen
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group/screen relative overflow-hidden rounded-lg border bg-muted/40 text-left transition",
        "hover:border-foreground/40 hover:shadow-md"
      )}
      style={{ width: THUMB_WIDTH }}
    >
      <div
        className="relative overflow-hidden bg-muted"
        style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
      >
        {screen.imageUrl ? (
          <img
            src={screen.imageUrl}
            alt={screen.title}
            className="size-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageIcon className="size-6" />
          </div>
        )}
        {screen.additionalImages?.length ? (
          <span className="absolute right-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            +{screen.additionalImages.length}
          </span>
        ) : null}
      </div>
      <div className="space-y-0.5 px-3 py-2">
        <div className="truncate text-xs font-medium leading-tight">
          {screen.title}
        </div>
        {screen.notes ? (
          <div className="truncate text-[11px] text-muted-foreground">
            {screen.notes}
          </div>
        ) : null}
      </div>
    </button>
  )
}

// =====================================================================
// Helpers
// =====================================================================

function EmptyState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-8">
      <div className="max-w-md space-y-2 rounded-lg border border-dashed bg-card/80 p-6 text-center">
        <Layers className="mx-auto size-6 text-muted-foreground" />
        <div className="text-sm font-semibold">No screens to show</div>
        <div className="text-xs text-muted-foreground">
          Add screens to a competitor (with a section assigned) to see them
          here grouped by section.
        </div>
      </div>
    </div>
  )
}

function HelpHint() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 select-none rounded-md border bg-card/85 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
      <div>
        <kbd className="rounded border bg-muted px-1">drag</kbd> pan ·{" "}
        <kbd className="rounded border bg-muted px-1">⌘/ctrl + wheel</kbd> zoom
        ·{" "}
        <kbd className="rounded border bg-muted px-1">1</kbd> fit ·{" "}
        <kbd className="rounded border bg-muted px-1">0</kbd> reset
      </div>
    </div>
  )
}

function ScreenPreview({ node }: { node: ScreenNode }) {
  const { screen, competitor, benchmark } = node
  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-base">{screen.title}</SheetTitle>
        <SheetDescription>
          {competitor.name} · {benchmark.title}
          {screen.section ? ` · ${screen.section}` : ""}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-3 overflow-y-auto px-4 pb-4">
        <div className="overflow-hidden rounded-lg border bg-muted">
          {screen.imageUrl ? (
            <img
              src={screen.imageUrl}
              alt={screen.title}
              className="w-full"
              draggable={false}
            />
          ) : (
            <div className="flex aspect-video items-center justify-center text-muted-foreground">
              <ImageIcon className="size-8" />
            </div>
          )}
        </div>

        {screen.additionalImages?.length ? (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              {screen.additionalImages.length} additional image
              {screen.additionalImages.length === 1 ? "" : "s"}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {screen.additionalImages.map((img) => (
                <div
                  key={img.id}
                  className="overflow-hidden rounded-md border bg-muted"
                >
                  <img
                    src={img.url}
                    alt={img.label ?? ""}
                    className="aspect-video w-full object-cover"
                    draggable={false}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {screen.notes ? (
          <div className="rounded-md border bg-card/50 p-3 text-xs text-muted-foreground">
            {screen.notes}
          </div>
        ) : null}

        {screen.sourceUrl ? (
          <a
            href={screen.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <ExternalLink className="size-3.5" />
            Open source URL
          </a>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button asChild size="sm" variant="outline">
            <Link
              to={`/benchmarks/${benchmark.id}/competitors/${competitor.id}?tab=screens`}
            >
              <ArrowUpRight className="size-3.5" />
              Open in editor
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to={`/benchmarks/${benchmark.id}`}>
              <X className="size-3.5" />
              {benchmark.title}
            </Link>
          </Button>
        </div>
      </div>
    </>
  )
}
