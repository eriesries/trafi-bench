import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Gauge,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScreensSection } from "@/components/screens/ScreensSection"
import { useBenchmark, useBenchmarksStore } from "@/store/benchmarks"
import { supportLabel, tierLabel } from "@/lib/labels"
import type {
  CapabilityScore,
  CompetitorInsights,
  CompetitorTier,
  Feature,
  FeatureSupport,
  InsightTheme,
  Pricing,
} from "@/types/benchmark"
import { useSettingsStore } from "@/store/settings"
import { uid } from "@/lib/id"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { formatError } from "@/lib/errors"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"

const tiers: CompetitorTier[] = ["leader", "challenger", "niche", "emerging"]
const supports: FeatureSupport[] = ["yes", "partial", "no", "unknown"]

export function CompetitorEditPage() {
  const { id, competitorId } = useParams<{
    id: string
    competitorId: string
  }>()
  const navigate = useNavigate()
  const benchmark = useBenchmark(id)
  const competitor = benchmark?.competitors.find((c) => c.id === competitorId)

  const updateCompetitor = useBenchmarksStore((s) => s.updateCompetitor)
  const deleteCompetitor = useBenchmarksStore((s) => s.deleteCompetitor)

  const [name, setName] = useState("")
  const [website, setWebsite] = useState("")
  const [tagline, setTagline] = useState("")
  const [description, setDescription] = useState("")
  const [tier, setTier] = useState<CompetitorTier>("emerging")
  const [founded, setFounded] = useState("")
  const [hqLocation, setHqLocation] = useState("")
  const [overallScore, setOverallScore] = useState<string>("")
  const [strengthsText, setStrengthsText] = useState("")
  const [weaknessesText, setWeaknessesText] = useState("")
  const [features, setFeatures] = useState<Feature[]>([])
  const [pricing, setPricing] = useState<Pricing[]>([])
  const [sections, setSections] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Tab is URL-driven so we can deep-link from the benchmark detail
  // (e.g. clicking a screen thumbnail jumps straight to the Screens tab).
  // NOTE: `pricing` and `docs` are kept here as accepted aliases so old
  // bookmarks still resolve gracefully — they fall back to `info` since
  // those tabs are no longer rendered. Data is still persisted on save.
  const VALID_TABS = ["info", "dashboard", "screens", "features"] as const
  type TabKey = (typeof VALID_TABS)[number]
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get("tab") as TabKey | null
  const activeTab: TabKey =
    tabParam && (VALID_TABS as readonly string[]).includes(tabParam)
      ? tabParam
      : "info"
  const setActiveTab = (next: string) => {
    const params = new URLSearchParams(searchParams)
    if (next === "info") params.delete("tab")
    else params.set("tab", next)
    setSearchParams(params, { replace: true })
  }

  useEffect(() => {
    if (!competitor) return
    setName(competitor.name)
    setWebsite(competitor.website ?? "")
    setTagline(competitor.tagline ?? "")
    setDescription(competitor.description ?? "")
    setTier(competitor.tier)
    setFounded(competitor.founded ?? "")
    setHqLocation(competitor.hqLocation ?? "")
    setOverallScore(
      typeof competitor.overallScore === "number"
        ? String(competitor.overallScore)
        : ""
    )
    setStrengthsText(competitor.strengths.join("\n"))
    setWeaknessesText(competitor.weaknesses.join("\n"))
    setFeatures(competitor.features.map((f) => ({ ...f })))
    setPricing(competitor.pricing.map((p) => ({ ...p })))
    setSections([...(competitor.sections ?? [])])
    setNotes(competitor.notes ?? "")
  }, [competitor])

  if (!benchmark || !competitor) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Competitor not found</CardTitle>
            <CardDescription>
              Go back to the benchmark and select a valid competitor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/benchmarks">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleSave = async () => {
    try {
      await updateCompetitor(benchmark.id, competitor.id, {
        name: name.trim() || "Unnamed",
        website: website.trim() || undefined,
        tagline: tagline.trim() || undefined,
        description: description.trim() || undefined,
        tier,
        founded: founded.trim() || undefined,
        hqLocation: hqLocation.trim() || undefined,
        overallScore:
          overallScore.trim() === "" ? undefined : Number(overallScore),
        strengths: strengthsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        weaknesses: weaknessesText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        features,
        pricing,
        sections,
        notes: notes.trim() || undefined,
      })
      toast.success("Competitor saved")
    } catch (e) {
      toast.error("Failed to save competitor", {
        description: formatError(e),
      })
    }
  }

  const [featureSearch, setFeatureSearch] = useState("")
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set()
  )

  const UNCATEGORIZED = "Uncategorized"
  const NO_SECTION = "Unsorted"

  /**
   * Build a Section→Category→Features tree. A feature's section is
   * inferred from the screen that owns its category (the screen whose
   * title matches the feature's category).
   */
  const categoryToSection = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of competitor?.screens ?? []) {
      if (s.section && s.title) {
        map.set(s.title.trim().toLowerCase(), s.section)
      }
    }
    return map
  }, [competitor?.screens])

  const knownCategories = useMemo(() => {
    return Array.from(
      new Set(
        features
          .map((f) => f.category?.trim())
          .filter((c): c is string => !!c)
      )
    ).sort((a, b) => a.localeCompare(b))
  }, [features])

  const groupedBySection = useMemo(() => {
    const q = featureSearch.trim().toLowerCase()
    const matches = (f: Feature) => {
      if (!q) return true
      return (
        f.name.toLowerCase().includes(q) ||
        (f.description ?? "").toLowerCase().includes(q) ||
        (f.notes ?? "").toLowerCase().includes(q) ||
        (f.category ?? "").toLowerCase().includes(q)
      )
    }

    // section -> category -> [feature]
    const sectionMap = new Map<
      string,
      Map<string, Array<{ feature: Feature; idx: number }>>
    >()

    features.forEach((f, idx) => {
      if (!matches(f)) return
      const cat = f.category?.trim() || UNCATEGORIZED
      const section =
        categoryToSection.get(cat.toLowerCase()) || NO_SECTION
      if (!sectionMap.has(section)) sectionMap.set(section, new Map())
      const catMap = sectionMap.get(section)!
      if (!catMap.has(cat)) catMap.set(cat, [])
      catMap.get(cat)!.push({ feature: f, idx })
    })

    const sortKeys = (
      keys: string[],
      placeholder: string
    ): string[] =>
      keys.sort((a, b) => {
        if (a === placeholder) return 1
        if (b === placeholder) return -1
        return a.localeCompare(b)
      })

    return sortKeys(Array.from(sectionMap.keys()), NO_SECTION).map(
      (section) => {
        const catMap = sectionMap.get(section)!
        const categories = sortKeys(
          Array.from(catMap.keys()),
          UNCATEGORIZED
        ).map((category) => ({
          category,
          items: catMap.get(category)!,
        }))
        const total = categories.reduce(
          (acc, c) => acc + c.items.length,
          0
        )
        return { section, total, categories }
      }
    )
  }, [features, featureSearch, categoryToSection])

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const addFeature = (category?: string) => {
    setFeatures((prev) => [
      ...prev,
      {
        id: uid("feat"),
        name: "New feature",
        support: "unknown",
        category,
      },
    ])
  }

  const updateFeature = (idx: number, patch: Partial<Feature>) => {
    setFeatures((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)))
  }

  const removeFeature = (idx: number) => {
    setFeatures((prev) => prev.filter((_, i) => i !== idx))
  }

  const removeCategory = (category: string) => {
    if (
      !window.confirm(
        `Delete all ${features.filter((f) => (f.category?.trim() || UNCATEGORIZED) === category).length} feature(s) in "${category}"?`
      )
    )
      return
    setFeatures((prev) =>
      prev.filter((f) => (f.category?.trim() || UNCATEGORIZED) !== category)
    )
  }

  // Dashboard metrics — derived from the (potentially unsaved) edits so the
  // user sees the impact of in-flight changes immediately.
  const supportCounts = useMemo(() => {
    const acc: Record<FeatureSupport, number> = {
      yes: 0,
      partial: 0,
      no: 0,
      unknown: 0,
    }
    for (const f of features) acc[f.support] = (acc[f.support] ?? 0) + 1
    return acc
  }, [features])

  const groupedFeaturesCount = useMemo(
    () => features.filter((f) => Boolean(f.groupKey)).length,
    [features]
  )

  const sectionsCoverage = useMemo(() => {
    const map = new Map<string, { screens: number; features: number }>()
    for (const s of sections) map.set(s, { screens: 0, features: 0 })
    for (const sc of competitor?.screens ?? []) {
      const key = sc.section
      if (!key) continue
      if (!map.has(key)) map.set(key, { screens: 0, features: 0 })
      map.get(key)!.screens += 1
    }
    for (const f of features) {
      const key = f.category
      if (!key) continue
      if (!map.has(key)) map.set(key, { screens: 0, features: 0 })
      map.get(key)!.features += 1
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.features + b.screens - (a.features + a.screens))
  }, [sections, competitor?.screens, features])

  const topCategories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const f of features) {
      const k = (f.category?.trim() || "Uncategorized")
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [features])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to={`/benchmarks/${benchmark.id}/edit`}>
            <ArrowLeft className="size-4" />
            Back to benchmark
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave}>
            <Save className="size-4" />
            Save
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

      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          {benchmark.title} → competitor
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="screens">Screens</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>
                General data and competitor positioning.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="c-name">Name</Label>
                <Input
                  id="c-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-website">Website</Label>
                <Input
                  id="c-website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="c-tagline">Tagline</Label>
                <Input
                  id="c-tagline"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="c-description">Description</Label>
                <Textarea
                  id="c-description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Tier</Label>
                <Select
                  value={tier}
                  onValueChange={(v) => setTier(v as CompetitorTier)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tiers.map((t) => (
                      <SelectItem key={t} value={t}>
                        {tierLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-score">Overall score (0–10)</Label>
                <Input
                  id="c-score"
                  type="number"
                  min={0}
                  max={10}
                  step="0.1"
                  value={overallScore}
                  onChange={(e) => setOverallScore(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-founded">Founded</Label>
                <Input
                  id="c-founded"
                  value={founded}
                  onChange={(e) => setFounded(e.target.value)}
                  placeholder="2013"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="c-hq">Headquarters</Label>
                <Input
                  id="c-hq"
                  value={hqLocation}
                  onChange={(e) => setHqLocation(e.target.value)}
                  placeholder="San Francisco, USA"
                />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="c-strengths">Strengths (one per line)</Label>
                <Textarea
                  id="c-strengths"
                  rows={4}
                  value={strengthsText}
                  onChange={(e) => setStrengthsText(e.target.value)}
                />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="c-weaknesses">Weaknesses (one per line)</Label>
                <Textarea
                  id="c-weaknesses"
                  rows={4}
                  value={weaknessesText}
                  onChange={(e) => setWeaknessesText(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Sections</CardTitle>
                <CardDescription>
                  Top-level menu groups in this competitor's app (e.g.
                  Orders, Marketing, Settings). Used to group screens and
                  features.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {sections.length === 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const presets = [
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
                      ]
                      setSections(presets)
                      toast.success(
                        `${presets.length} sections seeded (don't forget to Save)`
                      )
                    }}
                  >
                    <Plus className="size-3.5" />
                    Use common e-commerce sections
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  onClick={() => setSections((prev) => [...prev, ""])}
                >
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {sections.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No sections defined yet.
                </div>
              ) : (
                sections.map((s, idx) => (
                  <div
                    key={idx}
                    className="grid gap-2 rounded-md border p-2 md:grid-cols-[1fr_auto]"
                  >
                    <Input
                      value={s}
                      onChange={(e) =>
                        setSections((prev) =>
                          prev.map((v, i) => (i === idx ? e.target.value : v))
                        )
                      }
                      placeholder="Section name (e.g. Marketing)"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove"
                      onClick={() =>
                        setSections((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dashboard">
          <DashboardTab
            benchmarkId={benchmark.id}
            competitorId={competitor.id}
            competitorName={name}
            insights={competitor.insights}
            screenCount={competitor.screens?.length ?? 0}
            sectionCount={sections.length}
            featureCount={features.length}
            groupedFeatureCount={groupedFeaturesCount}
            supportCounts={supportCounts}
            sectionsCoverage={sectionsCoverage}
            topCategories={topCategories}
            strengths={strengthsText
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)}
            weaknesses={weaknessesText
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)}
            pricing={pricing}
          />
        </TabsContent>

        <TabsContent value="screens">
          <ScreensSection
            benchmarkId={benchmark.id}
            competitorId={competitor.id}
            competitorName={competitor.name}
          />
        </TabsContent>

        <TabsContent value="features">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Features</CardTitle>
                <CardDescription>
                  Grouped by category. The category is auto-filled with the
                  source screen's title when synced from a screenshot.
                </CardDescription>
              </div>
              <Button onClick={() => addFeature()} variant="outline">
                <Plus className="size-4" />
                Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {features.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No features registered.
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={featureSearch}
                      onChange={(e) => setFeatureSearch(e.target.value)}
                      placeholder="Search features by name, description, notes, category…"
                      className="pl-8"
                    />
                  </div>

                  <datalist id="feature-category-suggestions">
                    {knownCategories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>

                  {groupedBySection.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No features match "{featureSearch}".
                    </div>
                  ) : (
                    groupedBySection.map(({ section, total, categories }) => {
                      const sectionKey = `__section__:${section}`
                      const sectionCollapsed =
                        collapsedCategories.has(sectionKey)
                      return (
                        <div
                          key={sectionKey}
                          className="overflow-hidden rounded-lg border bg-card"
                        >
                          <div className="flex items-center gap-2 border-b bg-foreground/[0.04] px-3 py-2">
                            <button
                              type="button"
                              onClick={() => toggleCategory(sectionKey)}
                              className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-foreground transition hover:text-foreground"
                              aria-label={
                                sectionCollapsed
                                  ? "Expand section"
                                  : "Collapse section"
                              }
                            >
                              {sectionCollapsed ? (
                                <ChevronRight className="size-4" />
                              ) : (
                                <ChevronDown className="size-4" />
                              )}
                              <FolderOpen className="size-4 text-muted-foreground" />
                              <span>{section}</span>
                              <span className="ml-1 rounded-full bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {total}
                              </span>
                            </button>
                          </div>

                          {!sectionCollapsed ? (
                            <div className="space-y-2 p-3">
                              {categories.map(({ category, items }) => {
                                const collapsed =
                                  collapsedCategories.has(category)
                                return (
                                  <div
                                    key={category}
                                    className="overflow-hidden rounded-lg border bg-muted/20"
                                  >
                          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
                            <button
                              type="button"
                              onClick={() => toggleCategory(category)}
                              className="flex items-center gap-1.5 text-sm font-semibold transition hover:text-foreground"
                              aria-label={
                                collapsed ? "Expand category" : "Collapse category"
                              }
                            >
                              {collapsed ? (
                                <ChevronRight className="size-4" />
                              ) : (
                                <ChevronDown className="size-4" />
                              )}
                              <FolderOpen className="size-4 text-muted-foreground" />
                              <span>{category}</span>
                              <span className="ml-1 rounded-full bg-background px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                                {items.length}
                              </span>
                            </button>
                            <div className="ml-auto flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7"
                                onClick={() =>
                                  addFeature(
                                    category === UNCATEGORIZED
                                      ? undefined
                                      : category
                                  )
                                }
                              >
                                <Plus className="size-3.5" />
                                Add
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7 text-muted-foreground hover:text-destructive"
                                onClick={() => removeCategory(category)}
                                aria-label="Delete category"
                                title="Delete entire category"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>

                          {!collapsed ? (
                            <div className="space-y-2 bg-background p-3">
                              {items.map(({ feature: f, idx }) => (
                                <div
                                  key={f.id}
                                  className="space-y-2 rounded-md border p-3"
                                >
                                  <div className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
                                    <Input
                                      value={f.name}
                                      onChange={(e) =>
                                        updateFeature(idx, {
                                          name: e.target.value,
                                        })
                                      }
                                      placeholder="Feature name"
                                    />
                                    <Select
                                      value={f.support}
                                      onValueChange={(v) =>
                                        updateFeature(idx, {
                                          support: v as FeatureSupport,
                                        })
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {supports.map((s) => (
                                          <SelectItem key={s} value={s}>
                                            {supportLabel(s)}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeFeature(idx)}
                                      aria-label="Remove"
                                    >
                                      <Trash2 className="size-4" />
                                    </Button>
                                  </div>
                                  <Textarea
                                    value={f.description ?? ""}
                                    onChange={(e) =>
                                      updateFeature(idx, {
                                        description: e.target.value,
                                      })
                                    }
                                    placeholder="Description — what this feature does, fields/options it exposes, and how it relates to the product"
                                    rows={2}
                                    className="resize-none text-sm"
                                  />
                                  <div className="grid gap-2 md:grid-cols-[1fr_220px]">
                                    <Input
                                      value={f.notes ?? ""}
                                      onChange={(e) =>
                                        updateFeature(idx, {
                                          notes: e.target.value,
                                        })
                                      }
                                      placeholder="Internal notes (optional)"
                                      className="text-sm"
                                    />
                                    <Input
                                      list="feature-category-suggestions"
                                      value={f.category ?? ""}
                                      onChange={(e) =>
                                        updateFeature(idx, {
                                          category: e.target.value,
                                        })
                                      }
                                      placeholder="Category (folder)"
                                      className="text-sm"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Move competitor to trash?"
        description={`"${competitor.name}" will be hidden from this benchmark${
          competitor.screens?.length
            ? ` along with its ${competitor.screens.length} screen(s)`
            : ""
        }. You can restore it from Trash later.`}
        confirmLabel="Move to trash"
        variant="danger"
        onConfirm={async () => {
          try {
            await deleteCompetitor(benchmark.id, competitor.id)
            toast.success("Moved to trash")
            navigate(`/benchmarks/${benchmark.id}/edit`)
          } catch (e) {
            toast.error("Failed to delete competitor", {
              description: formatError(e),
            })
          }
        }}
      />
    </div>
  )
}

// =====================================================================
// Dashboard tab — read-only KPIs and quick summaries for the competitor.
// =====================================================================

interface DashboardTabProps {
  benchmarkId: string
  competitorId: string
  competitorName: string
  insights?: CompetitorInsights
  screenCount: number
  sectionCount: number
  featureCount: number
  groupedFeatureCount: number
  supportCounts: Record<FeatureSupport, number>
  sectionsCoverage: Array<{ name: string; screens: number; features: number }>
  topCategories: Array<{ name: string; count: number }>
  strengths: string[]
  weaknesses: string[]
  pricing: Pricing[]
}

function DashboardTab({
  benchmarkId,
  competitorId,
  competitorName,
  insights,
  screenCount,
  sectionCount,
  featureCount,
  groupedFeatureCount,
  supportCounts,
  sectionsCoverage,
  topCategories,
  strengths,
  weaknesses,
  pricing,
}: DashboardTabProps) {
  const groupedPct =
    featureCount > 0 ? Math.round((groupedFeatureCount / featureCount) * 100) : 0

  return (
    <div className="space-y-4">
      <InsightsSection
        benchmarkId={benchmarkId}
        competitorId={competitorId}
        competitorName={competitorName}
        insights={insights}
        featureCount={featureCount}
      />

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Screens"
          value={screenCount}
          hint={screenCount === 0 ? "No screens yet" : "Captured screenshots"}
        />
        <KpiCard
          label="Sections"
          value={sectionCount}
          hint={
            sectionCount === 0
              ? "No sections yet"
              : "Macro areas of the product"
          }
        />
        <KpiCard
          label="Features"
          value={featureCount}
          hint={
            featureCount === 0 ? "No features documented" : "Catalogued items"
          }
        />
        <KpiCard
          label="AI-grouped"
          value={`${groupedPct}%`}
          hint={
            featureCount === 0
              ? "Run Auto-group on the Feature Matrix"
              : `${groupedFeatureCount} of ${featureCount} features clustered`
          }
        />
      </div>

      {/* Support distribution + Sections coverage side by side */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Feature support</CardTitle>
            <CardDescription>
              How {competitorName || "this competitor"} performs across its
              catalogued features.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <SupportBar
              label="Supported"
              value={supportCounts.yes}
              total={featureCount}
              tone="emerald"
            />
            <SupportBar
              label="Partial"
              value={supportCounts.partial}
              total={featureCount}
              tone="amber"
            />
            <SupportBar
              label="Not supported"
              value={supportCounts.no}
              total={featureCount}
              tone="rose"
            />
            <SupportBar
              label="Unknown"
              value={supportCounts.unknown}
              total={featureCount}
              tone="muted"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sections coverage</CardTitle>
            <CardDescription>
              Distribution of screens and features per macro section.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sectionsCoverage.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No sections yet. Add screens with a section to get coverage.
              </div>
            ) : (
              <ul className="divide-y rounded-md border">
                {sectionsCoverage.map((s) => (
                  <li
                    key={s.name}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate font-medium">
                      {s.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {s.screens} screen{s.screens === 1 ? "" : "s"}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                      {s.features} feat
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top categories + Pricing snapshot */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top categories</CardTitle>
            <CardDescription>
              The eight most populated feature folders.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topCategories.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No features documented yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {topCategories.map((c) => {
                  const max = topCategories[0]?.count ?? 1
                  const pct = Math.max(4, Math.round((c.count / max) * 100))
                  return (
                    <li key={c.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate font-medium">{c.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {c.count}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing snapshot</CardTitle>
            <CardDescription>
              Plans previously registered for this competitor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pricing.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No plans registered yet.
              </div>
            ) : (
              <ul className="divide-y rounded-md border">
                {pricing.map((p, idx) => (
                  <li
                    key={idx}
                    className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[1fr_120px_1fr]"
                  >
                    <span className="truncate font-medium">
                      {p.plan || "—"}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {p.price || "—"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {p.highlights ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Strengths and Weaknesses */}
      <div className="grid gap-3 lg:grid-cols-2">
        <BulletCard
          title="Strengths"
          description="What this competitor does well."
          items={strengths}
          tone="emerald"
        />
        <BulletCard
          title="Weaknesses"
          description="Where there's room to compete."
          items={weaknesses}
          tone="rose"
        />
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string
  value: number | string
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
        {hint ? (
          <div className="text-xs text-muted-foreground">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  )
}

const TONE_STYLES = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  muted: "bg-muted-foreground/40",
} as const

function SupportBar({
  label,
  value,
  total,
  tone,
}: {
  label: string
  value: number
  total: number
  tone: keyof typeof TONE_STYLES
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {value} · {pct}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${TONE_STYLES[tone]}`}
          style={{ width: total > 0 ? `${Math.max(4, pct)}%` : "0%" }}
        />
      </div>
    </div>
  )
}

function BulletCard({
  title,
  description,
  items,
  tone,
}: {
  title: string
  description?: string
  items: string[]
  tone: "emerald" | "rose"
}) {
  const dot = tone === "emerald" ? "bg-emerald-500" : "bg-rose-500"
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? (
          <CardDescription>{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            None registered. Edit on the Info tab.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {items.map((it, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span
                  className={`mt-1.5 size-1.5 shrink-0 rounded-full ${dot}`}
                />
                <span className="leading-relaxed">{it}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// =====================================================================
// AI Insights — pre-computed structured analysis of the competitor
// =====================================================================

interface InsightsSectionProps {
  benchmarkId: string
  competitorId: string
  competitorName: string
  insights?: CompetitorInsights
  featureCount: number
}

function InsightsSection({
  benchmarkId,
  competitorId,
  competitorName,
  insights,
  featureCount,
}: InsightsSectionProps) {
  const generateInsights = useBenchmarksStore(
    (s) => s.generateCompetitorInsights
  )
  const apiKey = useSettingsStore((s) => s.openaiApiKey)
  const model = useSettingsStore((s) => s.openaiModel)
  const [busy, setBusy] = useState(false)

  const handleGenerate = async () => {
    if (!apiKey) {
      toast.error("Set your OpenAI API key in Settings to generate insights.")
      return
    }
    if (featureCount === 0) {
      toast.error("Add features to this competitor before generating insights.")
      return
    }
    setBusy(true)
    try {
      await generateInsights(benchmarkId, competitorId, { apiKey, model })
      toast.success("Insights generated")
    } catch (e) {
      toast.error("Failed to generate insights", { description: formatError(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            AI insights
          </CardTitle>
          <CardDescription>
            Pre-computed structured analysis of{" "}
            {competitorName || "this competitor"}. The AI chat references
            these scores when answering comparison questions.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {insights ? (
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              Generated {formatGeneratedAt(insights.generatedAt)} ·{" "}
              {insights.model}
            </span>
          ) : null}
          <Button
            onClick={handleGenerate}
            disabled={busy || featureCount === 0}
            variant={insights ? "outline" : "default"}
            size="sm"
          >
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Analysing…
              </>
            ) : insights ? (
              <>
                <RefreshCw className="size-3.5" />
                Regenerate
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" />
                Generate insights
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!insights ? (
          <EmptyInsights featureCount={featureCount} />
        ) : (
          <InsightsBody insights={insights} />
        )}
      </CardContent>
    </Card>
  )
}

function EmptyInsights({ featureCount }: { featureCount: number }) {
  return (
    <div className="space-y-3 rounded-md border border-dashed bg-muted/30 p-6 text-center">
      <Gauge className="mx-auto size-6 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm font-medium">
          No insights generated for this competitor yet
        </p>
        <p className="text-xs text-muted-foreground">
          Click <strong>Generate insights</strong> to have the AI score this
          competitor across 8 capability dimensions, surface standout
          features, and infer strengths and weaknesses with evidence.
        </p>
        {featureCount === 0 ? (
          <p className="pt-2 text-xs text-amber-700 dark:text-amber-400">
            You need at least one documented feature before insights can be
            generated.
          </p>
        ) : null}
      </div>
    </div>
  )
}

function InsightsBody({ insights }: { insights: CompetitorInsights }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Summary
          </div>
          <p className="text-sm leading-relaxed">{insights.summary}</p>
        </div>
        <div className="grid gap-2">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Target audience
            </div>
            <p className="text-sm leading-relaxed">{insights.targetAudience}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Positioning
            </div>
            <p className="text-sm leading-relaxed">{insights.positioning}</p>
          </div>
        </div>
      </div>

      {/* Capabilities */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Gauge className="size-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Capability scores</h4>
          <span className="text-[11px] text-muted-foreground">
            0–10 per dimension
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {insights.capabilities.map((c) => (
            <CapabilityRow key={c.dimension} cap={c} />
          ))}
        </div>
      </div>

      {/* Standout features */}
      {insights.standoutFeatures.length ? (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-4 text-amber-500" />
            <h4 className="text-sm font-semibold">Standout features</h4>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {insights.standoutFeatures.map((sf, i) => (
              <div
                key={`${sf.name}-${i}`}
                className="rounded-md border bg-card p-2.5"
              >
                <div className="text-xs font-medium leading-tight">
                  {sf.name}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {sf.why}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Inferred strengths / weaknesses */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ThemeBlock
          title="Inferred strengths"
          icon={<TrendingUp className="size-4 text-emerald-600" />}
          tone="emerald"
          themes={insights.inferredStrengths}
        />
        <ThemeBlock
          title="Inferred weaknesses"
          icon={<TrendingDown className="size-4 text-rose-600" />}
          tone="rose"
          themes={insights.inferredWeaknesses}
        />
      </div>

      {/* Risks / opportunities */}
      <div className="grid gap-3 lg:grid-cols-2">
        <SimpleList
          title="Competitive risks"
          dot="bg-rose-500"
          items={insights.risks}
        />
        <SimpleList
          title="Opportunities"
          dot="bg-emerald-500"
          items={insights.opportunities}
        />
      </div>
    </div>
  )
}

const CONFIDENCE_BADGE: Record<CapabilityScore["confidence"], string> = {
  high: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  low: "bg-muted text-muted-foreground",
}

function CapabilityRow({ cap }: { cap: CapabilityScore }) {
  const pct = Math.max(2, Math.round((cap.score / 10) * 100))
  return (
    <div className="rounded-md border bg-card p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-xs font-medium">{cap.dimension}</div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-semibold tabular-nums">
            {cap.score.toFixed(1)}
          </span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
              CONFIDENCE_BADGE[cap.confidence]
            )}
          >
            {cap.confidence}
          </span>
        </div>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            cap.score >= 7
              ? "bg-emerald-500"
              : cap.score >= 4
                ? "bg-amber-500"
                : "bg-rose-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        {cap.rationale}
      </p>
      {cap.evidence?.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {cap.evidence.slice(0, 6).map((e, i) => (
            <span
              key={i}
              className="truncate rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground"
              title={e}
            >
              {e}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ThemeBlock({
  title,
  icon,
  tone,
  themes,
}: {
  title: string
  icon: React.ReactNode
  tone: "emerald" | "rose"
  themes: InsightTheme[]
}) {
  const pillBg =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : "bg-rose-500/10 text-rose-700 dark:text-rose-300"
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      {themes.length === 0 ? (
        <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
          None inferred.
        </div>
      ) : (
        <ul className="space-y-2">
          {themes.map((t, i) => (
            <li
              key={`${t.theme}-${i}`}
              className="rounded-md border bg-card p-2.5"
            >
              <div className="text-xs font-medium leading-tight">{t.theme}</div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {t.rationale}
              </p>
              {t.evidence?.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {t.evidence.slice(0, 6).map((e, j) => (
                    <span
                      key={j}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium",
                        pillBg
                      )}
                      title={e}
                    >
                      {e}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SimpleList({
  title,
  dot,
  items,
}: {
  title: string
  dot: string
  items: string[]
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
          None inferred.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span
                className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", dot)}
              />
              <span className="leading-relaxed">{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })
  return `${day}, ${time}`
}
