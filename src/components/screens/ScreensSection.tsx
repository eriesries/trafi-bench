import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ExternalLink,
  FolderTree,
  ImageIcon,
  Link as LinkIcon,
  Loader2,
  Maximize2,
  Plus,
  Settings2,
  Sparkles,
  SquareStack,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogOverlay,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Dialog as DialogPrimitive } from "radix-ui"
import { Separator } from "@/components/ui/separator"
import { useBenchmarksStore } from "@/store/benchmarks"
import { useSettingsStore } from "@/store/settings"
import { compressImage } from "@/lib/image"
import { uploadScreenImage } from "@/data/api"
import { uid } from "@/lib/id"
import { analyzeScreenshot } from "@/lib/ai"
import { formatError } from "@/lib/errors"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { SettingsDialog } from "@/components/settings/SettingsDialog"
import type { Screen, ScreenFeature } from "@/types/benchmark"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Props {
  benchmarkId: string
  competitorId: string
  competitorName: string
  readOnly?: boolean
}

/** Common e-commerce admin sections offered as quick suggestions. */
export const SUGGESTED_ECOMMERCE_SECTIONS = [
  "Home",
  "Orders",
  "Products",
  "Customers",
  "Storefront",
  "Marketing",
  "Analytics",
  "Apps",
  "Channels",
  "Finance",
  "Settings",
] as const

/**
 * Tracks which competitor IDs have already had their screen-features
 * back-filled into the feature matrix during this session.
 * Reset on full page reload — that's intentional: a single redundant
 * (idempotent) merge per session is cheaper than missing a backfill.
 */
const autoSyncedCompetitors = new Set<string>()

export function ScreensSection({
  benchmarkId,
  competitorId,
  competitorName,
  readOnly = false,
}: Props) {
  const benchmark = useBenchmarksStore((s) =>
    s.benchmarks.find((b) => b.id === benchmarkId)
  )
  const competitor = benchmark?.competitors.find((c) => c.id === competitorId)
  const screens = competitor?.screens ?? []

  const addScreen = useBenchmarksStore((s) => s.addScreen)
  const updateScreen = useBenchmarksStore((s) => s.updateScreen)
  const deleteScreen = useBenchmarksStore((s) => s.deleteScreen)
  const mergeScreenFeatures = useBenchmarksStore((s) => s.mergeScreenFeatures)
  const addScreenImage = useBenchmarksStore((s) => s.addScreenImage)
  const removeScreenImage = useBenchmarksStore((s) => s.removeScreenImage)
  const ensureCompetitorSection = useBenchmarksStore(
    (s) => s.ensureCompetitorSection
  )

  const competitorSections = competitor?.sections ?? []

  const apiKey = useSettingsStore((s) => s.openaiApiKey)
  const model = useSettingsStore((s) => s.openaiModel)

  const [uploading, setUploading] = useState(false)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [viewingScreenId, setViewingScreenId] = useState<string | null>(null)
  const [pendingScreenDelete, setPendingScreenDelete] = useState<Screen | null>(
    null
  )
  const [addOpen, setAddOpen] = useState(false)
  const [prefillFiles, setPrefillFiles] = useState<File[] | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [uploadingExtra, setUploadingExtra] = useState(false)

  // Count of screen-features whose names aren't yet in the competitor's
  // feature matrix — used to enable / label the "Sync to matrix" button.
  const syncableCount = useMemo(() => {
    if (!competitor) return 0
    const matrix = new Set(
      (competitor.features ?? []).map((f) => f.name.trim().toLowerCase())
    )
    const pending = new Set<string>()
    for (const s of screens) {
      for (const f of s.features ?? []) {
        const key = f.name.trim().toLowerCase()
        if (key && !matrix.has(key)) pending.add(key)
      }
    }
    return pending.size
  }, [competitor, screens])

  // One-shot backfill: when ScreensSection mounts for a competitor we
  // haven't auto-synced yet AND there are pending screen-features, merge
  // them silently into the matrix, preserving each screen's title as the
  // feature category.
  useEffect(() => {
    if (readOnly) return
    if (!competitor) return
    if (autoSyncedCompetitors.has(competitor.id)) return
    if (screens.length === 0) return
    const haveAny = screens.some((s) => (s.features ?? []).length > 0)
    if (!haveAny) return
    autoSyncedCompetitors.add(competitor.id)
    void (async () => {
      let total = 0
      for (const s of screens) {
        if (!s.features?.length) continue
        try {
          total += await mergeScreenFeatures(
            benchmarkId,
            competitorId,
            s.features,
            s.title || undefined
          )
        } catch {
          /* best effort */
        }
      }
      if (total > 0) {
        toast.info(
          `${total} feature${total === 1 ? "" : "s"} synced from screens to the feature matrix`
        )
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitor?.id, readOnly])

  const handleSyncAll = async () => {
    if (syncableCount === 0) return
    setSyncing(true)
    try {
      let total = 0
      for (const s of screens) {
        if (!s.features?.length) continue
        total += await mergeScreenFeatures(
          benchmarkId,
          competitorId,
          s.features,
          s.title || undefined
        )
      }
      if (total > 0) {
        toast.success(
          `${total} feature${total === 1 ? "" : "s"} added to the matrix`
        )
      } else {
        toast.info("Feature matrix is already up to date")
      }
    } catch (e) {
      toast.error("Failed to sync features", {
        description: formatError(e),
      })
    } finally {
      setSyncing(false)
    }
  }

  const viewingScreen =
    screens.find((s) => s.id === viewingScreenId) ?? null

  const runAnalysis = async (
    screen: Screen,
    opts?: { silent?: boolean }
  ): Promise<boolean> => {
    if (!apiKey) {
      if (!opts?.silent) {
        toast.error("Set your OpenAI API key first")
        setSettingsOpen(true)
      }
      return false
    }
    setAnalyzingId(screen.id)
    await updateScreen(benchmarkId, competitorId, screen.id, {
      analysisStatus: "analyzing",
      analysisError: undefined,
    }).catch(() => {})
    try {
      const result = await analyzeScreenshot({
        imageUrls: [
          screen.imageUrl,
          ...(screen.additionalImages?.map((i) => i.url) ?? []),
        ],
        apiKey,
        model,
        competitorName,
      })
      await updateScreen(benchmarkId, competitorId, screen.id, {
        title:
          screen.title && screen.title !== "New screen"
            ? screen.title
            : result.title,
        aiSummary: result.summary,
        features: result.features,
        analysisStatus: "done",
        analyzedWith: model,
        analysisError: undefined,
      })

      let mergedCount = 0
      try {
        mergedCount = await mergeScreenFeatures(
          benchmarkId,
          competitorId,
          result.features,
          (screen.title && screen.title !== "New screen"
            ? screen.title
            : result.title) || undefined
        )
      } catch {
        /* non-fatal: matrix merge is best-effort */
      }

      toast.success("Analysis complete", {
        description:
          mergedCount > 0
            ? `${mergedCount} new feature${mergedCount === 1 ? "" : "s"} added to the feature matrix.`
            : undefined,
      })
      return true
    } catch (e) {
      const msg = formatError(e)
      await updateScreen(benchmarkId, competitorId, screen.id, {
        analysisStatus: "error",
        analysisError: msg,
      }).catch(() => {})
      toast.error("Analysis failed", { description: msg })
      return false
    } finally {
      setAnalyzingId(null)
    }
  }

  const openAddDialog = (files?: File[]) => {
    setPrefillFiles(files ?? null)
    setAddOpen(true)
  }

  const handleDropFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return
    const images = Array.from(files).filter((f) =>
      f.type.startsWith("image/")
    )
    if (images.length === 0) {
      toast.error("Please drop image files")
      return
    }
    openAddDialog(images)
  }

  const submitNewScreen = async (data: {
    files: File[]
    primaryIndex: number
    title: string
    section?: string
    sourceUrl?: string
  }) => {
    if (data.files.length === 0) return
    setUploading(true)
    try {
      // Make sure new sections become persistent on the competitor.
      if (data.section?.trim()) {
        try {
          await ensureCompetitorSection(
            benchmarkId,
            competitorId,
            data.section.trim()
          )
        } catch {
          /* non-fatal */
        }
      }
      // Upload every selected file, in input order.
      const uploaded = await Promise.all(
        data.files.map(async (f) => {
          const dataUrl = await compressImage(f)
          return uploadScreenImage(competitorId, dataUrl)
        })
      )

      const primary = uploaded[data.primaryIndex]
      const additional = uploaded
        .map((u, i) => ({ u, i }))
        .filter((x) => x.i !== data.primaryIndex)
        .map(({ u }) => ({
          id: uid("img"),
          url: u.imageUrl,
          storagePath: u.imageStoragePath,
        }))

      const screen = await addScreen(benchmarkId, competitorId, {
        imageUrl: primary.imageUrl,
        imageStoragePath: primary.imageStoragePath,
        title: data.title.trim() || "New screen",
        section: data.section?.trim() || undefined,
        sourceUrl: data.sourceUrl?.trim() || undefined,
        additionalImages: additional,
        analysisStatus: "idle",
      })
      toast.success(
        data.files.length > 1
          ? `Screen added with ${data.files.length} images`
          : "Screen added"
      )
      setAddOpen(false)
      setPrefillFiles(null)
      if (apiKey) {
        void runAnalysis(screen, { silent: true })
      }
    } catch (e) {
      toast.error("Failed to add screen", {
        description: formatError(e),
      })
      throw e
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="size-4" />
            Product screens
          </CardTitle>
          <CardDescription>
            {readOnly
              ? `${screens.length} screen${screens.length === 1 ? "" : "s"} documented.`
              : "Upload screenshots and let AI describe the visible features."}
          </CardDescription>
        </div>
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            {syncableCount > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncAll}
                disabled={syncing}
                title="Push features from screens into the competitor's feature matrix"
              >
                {syncing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <SquareStack className="size-4" />
                )}
                Sync {syncableCount} to matrix
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 className="size-4" />
              AI
              {apiKey ? null : (
                <Badge variant="destructive" className="ml-1">
                  no key
                </Badge>
              )}
            </Button>
            <Button
              onClick={() => openAddDialog()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add screen
            </Button>
          </div>
        ) : null}
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && screens.length === 0 ? (
          <>
            <button
              type="button"
              onClick={() => openAddDialog()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                handleDropFiles(e.dataTransfer.files)
              }}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-sm transition-colors",
                dragOver
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-muted-foreground/25 text-muted-foreground hover:bg-muted/50"
              )}
            >
              <Upload className="size-5" />
              <div className="font-medium">
                Click to add a screen, or drop an image here
              </div>
              <div className="text-xs">PNG, JPG, WEBP.</div>
            </button>
            {!apiKey ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 text-amber-600" />
                <div className="flex-1">
                  <div className="font-medium text-amber-700 dark:text-amber-300">
                    OpenAI API key not configured
                  </div>
                  <div className="text-muted-foreground">
                    You can still upload screenshots, but AI analysis is
                    disabled until you set a key.
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSettingsOpen(true)}
                >
                  Configure
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {screens.length === 0 ? (
          readOnly ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No screens documented yet.
            </div>
          ) : null
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {screens.map((s) => (
              <ScreenCard
                key={s.id}
                screen={s}
                analyzing={analyzingId === s.id}
                onOpen={() => setViewingScreenId(s.id)}
              />
            ))}
          </div>
        )}
      </CardContent>

      <ScreenViewerDialog
        screen={viewingScreen}
        analyzing={analyzingId === viewingScreen?.id}
        readOnly={readOnly}
        existingSections={competitorSections}
        onOpenChange={(open) => {
          if (!open) setViewingScreenId(null)
        }}
        onSave={async (patch) => {
          if (!viewingScreen) return
          try {
            if (patch.section?.trim()) {
              try {
                await ensureCompetitorSection(
                  benchmarkId,
                  competitorId,
                  patch.section.trim()
                )
              } catch {
                /* non-fatal */
              }
            }
            await updateScreen(benchmarkId, competitorId, viewingScreen.id, patch)
            let mergedCount = 0
            if (patch.features) {
              try {
                mergedCount = await mergeScreenFeatures(
                  benchmarkId,
                  competitorId,
                  patch.features,
                  (patch.title ?? viewingScreen.title) || undefined
                )
              } catch {
                /* non-fatal */
              }
            }
            toast.success("Screen saved", {
              description:
                mergedCount > 0
                  ? `${mergedCount} new feature${mergedCount === 1 ? "" : "s"} added to the feature matrix.`
                  : undefined,
            })
          } catch (e) {
            toast.error("Failed to save screen", {
              description: formatError(e),
            })
          }
        }}
        onAnalyze={async () => {
          if (!viewingScreen) return
          await runAnalysis(viewingScreen)
        }}
        onDelete={() => {
          if (!viewingScreen) return
          setPendingScreenDelete(viewingScreen)
        }}
        onConfigureKey={() => setSettingsOpen(true)}
        hasApiKey={!!apiKey}
        uploadingImage={uploadingExtra}
        onAddImage={async (file) => {
          if (!viewingScreen) return
          if (!file.type.startsWith("image/")) {
            toast.error("Please pick an image file")
            return
          }
          setUploadingExtra(true)
          try {
            const dataUrl = await compressImage(file)
            const { imageUrl, imageStoragePath } = await uploadScreenImage(
              competitorId,
              dataUrl
            )
            await addScreenImage(
              benchmarkId,
              competitorId,
              viewingScreen.id,
              {
                url: imageUrl,
                storagePath: imageStoragePath,
              }
            )
            toast.success("Image added")
          } catch (e) {
            toast.error("Failed to add image", {
              description: formatError(e),
            })
            throw e
          } finally {
            setUploadingExtra(false)
          }
        }}
        onRemoveImage={async (imageId) => {
          if (!viewingScreen) return
          try {
            await removeScreenImage(
              benchmarkId,
              competitorId,
              viewingScreen.id,
              imageId
            )
            toast.success("Image removed")
          } catch (e) {
            toast.error("Failed to remove image", {
              description: formatError(e),
            })
          }
        }}
      />

      <AddScreenDialog
        open={addOpen}
        prefillFiles={prefillFiles}
        uploading={uploading}
        existingSections={competitorSections}
        onOpenChange={(open) => {
          setAddOpen(open)
          if (!open) setPrefillFiles(null)
        }}
        onSubmit={submitNewScreen}
      />

      <ConfirmDialog
        open={!!pendingScreenDelete}
        onOpenChange={(open) => {
          if (!open) setPendingScreenDelete(null)
        }}
        title="Move screen to trash?"
        description={
          pendingScreenDelete
            ? `"${pendingScreenDelete.title}" and its ${
                (pendingScreenDelete.features?.length ?? 0) +
                (pendingScreenDelete.additionalImages?.length ?? 0)
              } associated item(s) will be hidden. The screenshot files stay safe in Storage and you can restore it from the Trash page.`
            : undefined
        }
        confirmLabel="Move to trash"
        variant="danger"
        onConfirm={async () => {
          if (!pendingScreenDelete) return
          try {
            await deleteScreen(
              benchmarkId,
              competitorId,
              pendingScreenDelete.id
            )
            toast.success("Moved to trash")
            setPendingScreenDelete(null)
            setViewingScreenId(null)
          } catch (e) {
            toast.error("Failed to delete screen", {
              description: formatError(e),
            })
          }
        }}
      />
    </Card>
  )
}

interface ScreenCardProps {
  screen: Screen
  analyzing: boolean
  onOpen: () => void
}

function ScreenCard({ screen, analyzing, onOpen }: ScreenCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition hover:border-foreground/20 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="relative bg-muted/40">
        <img
          src={screen.imageUrl}
          alt={screen.title}
          className="aspect-video w-full object-cover"
        />
        <div className="absolute right-2 top-2">
          <AnalysisBadge screen={screen} analyzing={analyzing} />
        </div>
        {screen.additionalImages && screen.additionalImages.length > 0 ? (
          <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur">
            <ImageIcon className="size-3" />
            {screen.additionalImages.length + 1}
          </div>
        ) : null}
      </div>
      <div className="space-y-1 p-3">
        {screen.section ? (
          <div className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <FolderTree className="size-3" />
            <span className="truncate">{screen.section}</span>
          </div>
        ) : null}
        <div className="truncate font-medium">{screen.title}</div>
        {screen.aiSummary ? (
          <div className="line-clamp-2 text-sm text-muted-foreground">
            {screen.aiSummary}
          </div>
        ) : (
          <div className="text-sm italic text-muted-foreground">
            No description
          </div>
        )}
        {screen.sourceUrl ? (
          <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <LinkIcon className="size-3 shrink-0" />
            <span className="truncate">{prettyUrl(screen.sourceUrl)}</span>
          </div>
        ) : null}
      </div>
    </button>
  )
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.host + (u.pathname === "/" ? "" : u.pathname)
  } catch {
    return url
  }
}

function AnalysisBadge({
  screen,
  analyzing,
}: {
  screen: Screen
  analyzing: boolean
}) {
  if (analyzing || screen.analysisStatus === "analyzing") {
    return (
      <Badge variant="secondary" className="gap-1 shadow-sm">
        <Loader2 className="size-3 animate-spin" /> Analyzing
      </Badge>
    )
  }
  if (screen.analysisStatus === "done") {
    return <Badge className="shadow-sm">Analyzed</Badge>
  }
  if (screen.analysisStatus === "error") {
    return (
      <Badge variant="destructive" className="shadow-sm">
        Error
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-background/80 shadow-sm">
      Pending
    </Badge>
  )
}

interface ScreenViewerDialogProps {
  screen: Screen | null
  analyzing: boolean
  readOnly: boolean
  hasApiKey: boolean
  existingSections: string[]
  onOpenChange: (open: boolean) => void
  onSave: (patch: Partial<Omit<Screen, "id" | "createdAt">>) => void
  onAnalyze: () => Promise<void>
  onDelete: () => void
  onConfigureKey: () => void
  /** Upload an additional image into the current screen. */
  onAddImage?: (file: File) => Promise<void>
  /** Remove a non-primary image from the current screen. */
  onRemoveImage?: (imageId: string) => Promise<void>
  /** True while an additional image upload is in flight. */
  uploadingImage?: boolean
}

function ScreenViewerDialog({
  screen,
  analyzing,
  readOnly,
  hasApiKey,
  existingSections,
  onOpenChange,
  onSave,
  onAnalyze,
  onDelete,
  onConfigureKey,
  onAddImage,
  onRemoveImage,
  uploadingImage,
}: ScreenViewerDialogProps) {
  const isOpen = !!screen

  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [notes, setNotes] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [section, setSection] = useState("")
  const [features, setFeatures] = useState<ScreenFeature[]>([])
  const [dirty, setDirty] = useState(false)

  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    if (!screen) return
    setTitle(screen.title)
    setSummary(screen.aiSummary ?? "")
    setNotes(screen.notes ?? "")
    setSourceUrl(screen.sourceUrl ?? "")
    setSection(screen.section ?? "")
    setFeatures(screen.features.map((f) => ({ ...f })))
    setDirty(false)
    setZoom(1)
  }, [screen?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const markDirty = () => setDirty(true)

  const handleSave = () => {
    onSave({
      title: title.trim() || "Untitled screen",
      aiSummary: summary.trim() || undefined,
      notes: notes.trim() || undefined,
      sourceUrl: sourceUrl.trim() || undefined,
      section: section.trim() || undefined,
      features: features
        .map((f) => ({
          name: f.name.trim(),
          description: f.description?.trim() || undefined,
        }))
        .filter((f) => f.name.length > 0),
    })
    setDirty(false)
  }


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 grid translate-x-[-50%] translate-y-[-50%] gap-0 rounded-xl border bg-background shadow-lg duration-200",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "w-[96vw] h-[92vh] max-w-[1600px] overflow-hidden p-0"
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {screen?.title ?? "Screen viewer"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            View and edit the captured screen.
          </DialogPrimitive.Description>

          <DialogPrimitive.Close
            className="absolute right-3 top-3 z-10 rounded-md bg-background/80 p-1.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>

          {screen ? (
            <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(340px,420px)_1fr]">
              {/* LEFT: editable info & features */}
              <div className="flex min-h-0 flex-col border-b lg:border-b-0 lg:border-r">
                <div className="space-y-3 border-b px-5 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <Input
                      value={title}
                      readOnly={readOnly}
                      onChange={(e) => {
                        setTitle(e.target.value)
                        markDirty()
                      }}
                      className="h-auto border-0 px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
                    />
                    <AnalysisBadge screen={screen} analyzing={analyzing} />
                  </div>
                  {screen.analyzedWith ? (
                    <div className="text-xs text-muted-foreground">
                      Analyzed with {screen.analyzedWith}
                    </div>
                  ) : null}
                  <Textarea
                    value={summary}
                    readOnly={readOnly}
                    onChange={(e) => {
                      setSummary(e.target.value)
                      markDirty()
                    }}
                    rows={3}
                    placeholder="Screen summary"
                    className="resize-none"
                  />

                  <div className="space-y-1">
                    <Label
                      htmlFor="screen-section"
                      className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      <FolderTree className="size-3" />
                      Section
                    </Label>
                    <Input
                      id="screen-section"
                      list="screen-section-suggestions"
                      value={section}
                      readOnly={readOnly}
                      placeholder="e.g. Marketing, Orders, Settings"
                      onChange={(e) => {
                        setSection(e.target.value)
                        markDirty()
                      }}
                    />
                    <datalist id="screen-section-suggestions">
                      {existingSections.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>

                  <div className="space-y-1">
                    <Label
                      htmlFor="screen-source-url"
                      className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      <LinkIcon className="size-3" />
                      Source URL
                    </Label>
                    <div className="flex items-center gap-1">
                      <Input
                        id="screen-source-url"
                        type="url"
                        inputMode="url"
                        value={sourceUrl}
                        readOnly={readOnly}
                        placeholder="https://example.com/page"
                        onChange={(e) => {
                          setSourceUrl(e.target.value)
                          markDirty()
                        }}
                      />
                      {sourceUrl ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          asChild
                          aria-label="Open source URL"
                        >
                          <a
                            href={sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="size-4" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {screen.analysisStatus === "error" && screen.analysisError ? (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
                      <AlertTriangle className="mt-0.5 size-3.5 text-destructive" />
                      <div className="text-destructive">
                        {screen.analysisError}
                      </div>
                    </div>
                  ) : null}

                  {!readOnly ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!hasApiKey) {
                            onConfigureKey()
                            return
                          }
                          await onAnalyze()
                        }}
                        disabled={analyzing}
                      >
                        {analyzing ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Sparkles className="size-4" />
                        )}
                        {screen.aiSummary ? "Re-analyze" : "Analyze with AI"}
                      </Button>
                      <Button
                        size="sm"
                        variant={dirty ? "default" : "outline"}
                        onClick={handleSave}
                        disabled={!dirty}
                      >
                        Save changes
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-destructive hover:text-destructive"
                        onClick={onDelete}
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                  <div className="mb-1 flex items-center justify-between">
                    <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Features ({features.length})
                    </Label>
                    {!readOnly ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setFeatures((prev) => [
                            ...prev,
                            { name: "New feature", description: "" },
                          ])
                          markDirty()
                        }}
                      >
                        <Plus className="size-4" />
                        Add
                      </Button>
                    ) : null}
                  </div>
                  {!readOnly ? (
                    <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
                      Features saved here are added to the competitor's
                      feature matrix (deduped by name).
                    </p>
                  ) : null}
                  <div className="space-y-2">
                    {features.length === 0 ? (
                      <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                        No features documented yet.
                        {readOnly
                          ? null
                          : " Run AI or add manually above."}
                      </div>
                    ) : (
                      features.map((f, idx) => (
                        <div
                          key={idx}
                          className="group/feat space-y-1 rounded-md border bg-card p-3 transition hover:border-foreground/10"
                        >
                          <div className="flex items-start gap-2">
                            <Input
                              value={f.name}
                              readOnly={readOnly}
                              onChange={(e) => {
                                setFeatures((prev) =>
                                  prev.map((p, i) =>
                                    i === idx
                                      ? { ...p, name: e.target.value }
                                      : p
                                  )
                                )
                                markDirty()
                              }}
                              className="h-auto border-0 bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-0"
                              placeholder="Feature name"
                            />
                            {!readOnly ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 opacity-0 transition group-hover/feat:opacity-100"
                                onClick={() => {
                                  setFeatures((prev) =>
                                    prev.filter((_, i) => i !== idx)
                                  )
                                  markDirty()
                                }}
                                aria-label="Remove"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            ) : null}
                          </div>
                          <Textarea
                            value={f.description ?? ""}
                            readOnly={readOnly}
                            onChange={(e) => {
                              setFeatures((prev) =>
                                prev.map((p, i) =>
                                  i === idx
                                    ? { ...p, description: e.target.value }
                                    : p
                                )
                              )
                              markDirty()
                            }}
                            rows={2}
                            placeholder="Feature description"
                            className="resize-none border-0 bg-transparent px-0 text-xs text-muted-foreground shadow-none focus-visible:ring-0"
                          />
                        </div>
                      ))
                    )}
                  </div>

                  <Separator className="my-4" />

                  <Label
                    htmlFor="screen-notes"
                    className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Notes
                  </Label>
                  <Textarea
                    id="screen-notes"
                    value={notes}
                    readOnly={readOnly}
                    onChange={(e) => {
                      setNotes(e.target.value)
                      markDirty()
                    }}
                    rows={4}
                    placeholder="Manual notes about this screen"
                    className="mt-2 resize-none"
                  />
                </div>
              </div>

              {/* RIGHT: image viewer */}
              <ImageViewer
                images={[
                  {
                    key: "primary",
                    url: screen.imageUrl,
                    isPrimary: true,
                  },
                  ...(screen.additionalImages ?? []).map((img) => ({
                    key: img.id,
                    url: img.url,
                    label: img.label,
                    isPrimary: false,
                  })),
                ]}
                alt={screen.title}
                zoom={zoom}
                onZoomChange={setZoom}
                readOnly={readOnly}
                uploading={uploadingImage}
                onAddImage={onAddImage}
                onRemoveImage={
                  onRemoveImage
                    ? async (img) =>
                        img.isPrimary
                          ? undefined
                          : onRemoveImage(img.key)
                    : undefined
                }
              />
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

interface ImageViewerImage {
  /** Unique key for the entry; "primary" for the main image. */
  key: string
  url: string
  label?: string
  isPrimary: boolean
}

interface ImageViewerProps {
  images: ImageViewerImage[]
  alt: string
  zoom: number
  onZoomChange: (z: number) => void
  readOnly?: boolean
  uploading?: boolean
  onAddImage?: (file: File) => Promise<void>
  onRemoveImage?: (image: ImageViewerImage) => Promise<void>
}

function ImageViewer({
  images,
  alt,
  zoom,
  onZoomChange,
  readOnly,
  uploading,
  onAddImage,
  onRemoveImage,
}: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [fitZoom, setFitZoom] = useState(1)
  const [activeIdx, setActiveIdx] = useState(0)

  const safeImages = images.length > 0 ? images : []
  const activeImage =
    safeImages[Math.min(activeIdx, safeImages.length - 1)] ?? safeImages[0]

  // Reset to primary whenever the screen changes (different image list).
  useEffect(() => {
    setActiveIdx(0)
    setNatural(null)
  }, [safeImages.length === 0 ? null : safeImages[0]?.url])

  // Recompute natural size + fit zoom when active image swaps.
  useEffect(() => {
    setNatural(null)
  }, [activeImage?.url])

  useEffect(() => {
    if (!natural || !containerRef.current) return
    const cw = containerRef.current.clientWidth - 32
    const ratio = Math.min(1, cw / natural.w)
    setFitZoom(ratio)
    onZoomChange(ratio)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural])

  const setZoom = (z: number) => {
    const clamped = Math.max(0.1, Math.min(5, z))
    onZoomChange(clamped)
  }

  const zoomPct = Math.round(zoom * 100)

  const handlePickFile: React.ChangeEventHandler<HTMLInputElement> = async (
    e
  ) => {
    const file = e.target.files?.[0]
    if (file && onAddImage) {
      try {
        await onAddImage(file)
      } catch {
        /* caller toasts */
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  if (!activeImage) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/30 text-sm text-muted-foreground">
        No image
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-0 flex-col bg-muted/30"
    >
      <div className="flex items-center justify-between gap-2 border-b bg-background/80 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => setZoom(zoom - 0.1)}
            aria-label="Zoom out"
          >
            <ZoomOut className="size-4" />
          </Button>
          <div className="min-w-[3.5rem] text-center text-xs font-medium">
            {zoomPct}%
          </div>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => setZoom(zoom + 0.1)}
            aria-label="Zoom in"
          >
            <ZoomIn className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="ml-1 h-8"
            onClick={() => setZoom(fitZoom)}
          >
            Fit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setZoom(1)}
          >
            100%
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setZoom(2)}
          >
            <Maximize2 className="size-3.5" />
            200%
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {natural ? `${natural.w} × ${natural.h}` : ""}
        </div>
      </div>

      {/* Thumbnail strip */}
      {safeImages.length > 1 || !readOnly ? (
        <div className="flex items-center gap-2 overflow-x-auto border-b bg-background/60 px-3 py-2">
          {safeImages.map((img, i) => (
            <div key={img.key} className="group/thumb relative shrink-0">
              <button
                type="button"
                onClick={() => setActiveIdx(i)}
                className={cn(
                  "block h-14 w-20 overflow-hidden rounded-md border bg-card transition",
                  i === activeIdx
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-muted-foreground/20 hover:border-foreground/30"
                )}
                title={img.isPrimary ? "Primary image" : img.label ?? `Image ${i + 1}`}
              >
                <img
                  src={img.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
              {img.isPrimary ? (
                <span className="absolute left-1 top-1 rounded bg-background/80 px-1 text-[10px] font-medium text-foreground shadow">
                  Main
                </span>
              ) : !readOnly && onRemoveImage ? (
                <button
                  type="button"
                  onClick={() => void onRemoveImage(img)}
                  className="absolute -right-1 -top-1 hidden size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow group-hover/thumb:flex"
                  aria-label="Remove image"
                  title="Remove image"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          ))}

          {!readOnly && onAddImage ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePickFile}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={cn(
                  "flex h-14 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-card/40 text-xs text-muted-foreground transition",
                  uploading
                    ? "opacity-50"
                    : "hover:border-foreground/30 hover:text-foreground"
                )}
                title="Add another image (popup, modal, hover state…)"
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                <span>Add</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="relative flex-1 overflow-auto p-4">
        <div
          style={{
            width: natural ? natural.w * zoom : "auto",
            height: natural ? natural.h * zoom : "auto",
          }}
          className="origin-top-left"
        >
          <img
            ref={imgRef}
            src={activeImage.url}
            alt={alt}
            onLoad={(e) => {
              const el = e.currentTarget
              setNatural({ w: el.naturalWidth, h: el.naturalHeight })
            }}
            style={{
              width: natural ? natural.w * zoom : undefined,
              height: natural ? natural.h * zoom : undefined,
            }}
            className="block max-w-none rounded-md shadow-sm"
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Add screen dialog: upload + title + source URL
// ============================================================

interface AddScreenDialogProps {
  open: boolean
  prefillFiles: File[] | null
  uploading: boolean
  existingSections: string[]
  onOpenChange: (open: boolean) => void
  onSubmit: (data: {
    files: File[]
    primaryIndex: number
    title: string
    section?: string
    sourceUrl?: string
  }) => Promise<void>
}

function AddScreenDialog({
  open,
  prefillFiles,
  uploading,
  existingSections,
  onOpenChange,
  onSubmit,
}: AddScreenDialogProps) {
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [primaryIndex, setPrimaryIndex] = useState(0)
  const [title, setTitle] = useState("")
  const [section, setSection] = useState("")
  const [sourceUrl, setSourceUrl] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const moreInputRef = useRef<HTMLInputElement>(null)

  // Union of suggested defaults + sections the user already added,
  // deduped case-insensitively, in stable presentation order.
  const dialogSectionOptions = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    const push = (s: string) => {
      const key = s.trim().toLowerCase()
      if (!key || seen.has(key)) return
      seen.add(key)
      result.push(s.trim())
    }
    for (const s of SUGGESTED_ECOMMERCE_SECTIONS) push(s)
    for (const s of existingSections) push(s)
    return result
  }, [existingSections])

  // Reset state every time the dialog opens
  useEffect(() => {
    if (!open) return
    if (prefillFiles && prefillFiles.length > 0) {
      setFiles(prefillFiles)
      setTitle(prefillFiles[0].name.replace(/\.[^.]+$/, ""))
    } else {
      setFiles([])
      setTitle("")
    }
    setPrimaryIndex(0)
    setSourceUrl("")
    setSection("")
  }, [open, prefillFiles])

  // Maintain object URLs for previews
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [files])

  const addFiles = (incoming: FileList | File[] | null | undefined) => {
    if (!incoming) return
    const arr = Array.from(incoming).filter((f) =>
      f.type.startsWith("image/")
    )
    if (arr.length === 0) {
      toast.error("Please select image files")
      return
    }
    setFiles((prev) => {
      const next = [...prev, ...arr]
      if (prev.length === 0 && !title.trim()) {
        setTitle(arr[0].name.replace(/\.[^.]+$/, ""))
      }
      return next
    })
  }

  const removeFileAt = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
    setPrimaryIndex((p) => {
      if (idx === p) return 0
      if (idx < p) return Math.max(0, p - 1)
      return p
    })
  }

  const handleSubmit = async () => {
    if (files.length === 0) {
      toast.error("Please add at least one image")
      return
    }
    if (!title.trim()) {
      toast.error("Please add a title for this screen")
      return
    }
    const url = sourceUrl.trim()
    if (url) {
      try {
        new URL(url.includes("://") ? url : `https://${url}`)
      } catch {
        toast.error("The URL looks invalid")
        return
      }
    }
    try {
      await onSubmit({
        files,
        primaryIndex: Math.min(primaryIndex, files.length - 1),
        title: title.trim(),
        section: section.trim() || undefined,
        sourceUrl: url ? (url.includes("://") ? url : `https://${url}`) : undefined,
      })
    } catch {
      /* caller already toasted */
    }
  }

  const hasFiles = files.length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (uploading) return
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add screen</DialogTitle>
          <DialogDescription>
            Add one or more images of the SAME screen (main view plus
            popups, modals, hover states). The AI will analyze them all
            together as a single context.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files)
              if (fileInputRef.current) fileInputRef.current.value = ""
            }}
          />
          <input
            ref={moreInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files)
              if (moreInputRef.current) moreInputRef.current.value = ""
            }}
          />

          {!hasFiles ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                addFiles(e.dataTransfer.files)
              }}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed py-10 text-sm transition-colors",
                dragOver
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-muted-foreground/25 text-muted-foreground hover:bg-muted/50"
              )}
            >
              <Upload className="size-5" />
              <div className="font-medium">
                Click to choose, or drop one or more images here
              </div>
              <div className="text-xs">PNG, JPG, WEBP — multiple supported</div>
            </button>
          ) : (
            <div className="space-y-3">
              {/* Big preview of the primary image */}
              <div className="relative overflow-hidden rounded-md border bg-muted/40">
                <img
                  src={previews[Math.min(primaryIndex, previews.length - 1)]}
                  alt={files[Math.min(primaryIndex, files.length - 1)]?.name}
                  className="aspect-video w-full object-contain"
                />
                <span className="absolute left-2 top-2 rounded bg-background/85 px-2 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur">
                  Main
                </span>
              </div>

              {/* Thumb strip */}
              <div className="flex flex-wrap items-start gap-2">
                {files.map((f, i) => (
                  <div key={i} className="group/thumb relative">
                    <button
                      type="button"
                      onClick={() => setPrimaryIndex(i)}
                      title={
                        i === primaryIndex ? "Main image" : "Set as main image"
                      }
                      className={cn(
                        "block h-16 w-24 overflow-hidden rounded-md border bg-card transition",
                        i === primaryIndex
                          ? "border-primary ring-2 ring-primary/40"
                          : "border-muted-foreground/20 hover:border-foreground/30"
                      )}
                    >
                      <img
                        src={previews[i]}
                        alt={f.name}
                        className="h-full w-full object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFileAt(i)}
                      disabled={uploading}
                      className="absolute -right-1 -top-1 hidden size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow group-hover/thumb:flex"
                      aria-label="Remove image"
                      title="Remove image"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => moreInputRef.current?.click()}
                  disabled={uploading}
                  className={cn(
                    "flex h-16 w-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/30 text-xs text-muted-foreground transition",
                    uploading
                      ? "opacity-50"
                      : "hover:border-foreground/30 hover:bg-muted hover:text-foreground"
                  )}
                  title="Add more images"
                >
                  <Plus className="size-4" />
                  <span>Add</span>
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tip: click a thumbnail to choose which one is the main image
                (used as the card cover and the default in the viewer).
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label
              htmlFor="add-screen-section"
              className="flex items-center gap-1"
            >
              <FolderTree className="size-3.5" />
              Section
              <span className="text-xs font-normal text-muted-foreground">
                (macro area in the app)
              </span>
            </Label>
            <Select
              value={section || "__none__"}
              onValueChange={(v) => setSection(v === "__none__" ? "" : v)}
            >
              <SelectTrigger id="add-screen-section" className="w-full">
                <SelectValue placeholder="Pick a section…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="text-muted-foreground">No section</span>
                </SelectItem>
                {dialogSectionOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-screen-title">Title</Label>
            <Input
              id="add-screen-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sales dashboard"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="add-screen-url"
              className="flex items-center gap-1"
            >
              <LinkIcon className="size-3.5" />
              Source URL
              <span className="text-xs font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="add-screen-url"
              type="url"
              inputMode="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://example.com/page"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={uploading || !hasFiles}>
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {hasFiles && files.length > 1
              ? `Add screen (${files.length} images)`
              : "Add screen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
