import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Plus,
  Save,
  Search,
  Trash2,
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
  CompetitorTier,
  Feature,
  FeatureSupport,
  Pricing,
} from "@/types/benchmark"
import { uid } from "@/lib/id"
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
  const VALID_TABS = ["info", "screens", "features", "pricing", "docs"] as const
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

  const addPricing = () => {
    setPricing((prev) => [...prev, { plan: "New plan", price: "" }])
  }

  const updatePricing = (idx: number, patch: Partial<Pricing>) => {
    setPricing((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }

  const removePricing = (idx: number) => {
    setPricing((prev) => prev.filter((_, i) => i !== idx))
  }

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
          <TabsTrigger value="screens">Screens</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="docs">Documentation</TabsTrigger>
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

        <TabsContent value="pricing">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Plans & pricing</CardTitle>
                <CardDescription>
                  Register the plans publicly disclosed by the competitor.
                </CardDescription>
              </div>
              <Button onClick={addPricing} variant="outline">
                <Plus className="size-4" />
                Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {pricing.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No plans registered.
                </div>
              ) : (
                pricing.map((p, idx) => (
                  <div
                    key={idx}
                    className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_180px_1fr_auto]"
                  >
                    <Input
                      value={p.plan}
                      onChange={(e) =>
                        updatePricing(idx, { plan: e.target.value })
                      }
                      placeholder="Plan"
                    />
                    <Input
                      value={p.price}
                      onChange={(e) =>
                        updatePricing(idx, { price: e.target.value })
                      }
                      placeholder="Price"
                    />
                    <Input
                      value={p.highlights ?? ""}
                      onChange={(e) =>
                        updatePricing(idx, { highlights: e.target.value })
                      }
                      placeholder="Highlights (optional)"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removePricing(idx)}
                      aria-label="Remove"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docs">
          <Card>
            <CardHeader>
              <CardTitle>Documentation</CardTitle>
              <CardDescription>
                Free-form markdown notes about the competitor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={14}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="# Summary\n\nWrite your notes here..."
                className="font-mono text-sm"
              />
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
