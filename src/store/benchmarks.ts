import { create } from "zustand"
import type {
  Benchmark,
  Competitor,
  Feature,
  Screen,
  ScreenFeature,
  ScreenImage,
} from "@/types/benchmark"
import * as api from "@/data/api"
import { uid } from "@/lib/id"
import { formatError } from "@/lib/errors"
import {
  groupFeatures as aiGroupFeatures,
  analyseCompetitor as aiAnalyseCompetitor,
} from "@/lib/ai"

interface BenchmarksState {
  benchmarks: Benchmark[]
  loading: boolean
  loaded: boolean
  error: string | null

  // Trash listing — loaded on demand via `loadTrash`.
  trash: api.TrashListing
  trashLoading: boolean
  trashError: string | null

  loadAll: () => Promise<void>
  loadTrash: () => Promise<void>

  // Benchmarks CRUD
  createBenchmark: (data: api.CreateBenchmarkInput) => Promise<Benchmark>
  updateBenchmark: (
    id: string,
    patch: Partial<Omit<Benchmark, "id" | "createdAt" | "competitors">>
  ) => Promise<void>
  /** Move a benchmark to Trash. Recoverable via `restoreBenchmark`. */
  deleteBenchmark: (id: string) => Promise<void>
  restoreBenchmark: (id: string) => Promise<void>
  /** Permanent delete — removes DB rows AND storage objects. NOT recoverable. */
  purgeBenchmark: (id: string) => Promise<void>

  // Competitors CRUD
  addCompetitor: (
    benchmarkId: string,
    data: Omit<api.CreateCompetitorInput, "benchmarkId">
  ) => Promise<Competitor>
  updateCompetitor: (
    benchmarkId: string,
    competitorId: string,
    patch: Partial<Omit<Competitor, "id" | "createdAt" | "screens">>
  ) => Promise<void>
  /** Move a competitor to Trash. Recoverable via `restoreCompetitor`. */
  deleteCompetitor: (benchmarkId: string, competitorId: string) => Promise<void>
  restoreCompetitor: (competitorId: string) => Promise<void>
  /** Permanent delete — removes DB rows AND storage objects. NOT recoverable. */
  purgeCompetitor: (competitorId: string) => Promise<void>

  /**
   * Push a list of screen-features into the competitor's feature matrix,
   * deduping by lowercased name. New entries default to support="yes"
   * since they originate from a captured screenshot of the product.
   * The optional `category` is assigned to new entries and back-filled on
   * existing entries that don't have one yet.
   * Returns the number of features that were actually added.
   */
  mergeScreenFeatures: (
    benchmarkId: string,
    competitorId: string,
    features: ScreenFeature[],
    category?: string
  ) => Promise<number>

  // Screens CRUD
  addScreen: (
    benchmarkId: string,
    competitorId: string,
    data: {
      imageUrl: string
      imageStoragePath: string
      title?: string
      section?: string
      sourceUrl?: string
      additionalImages?: ScreenImage[]
      analysisStatus?: Screen["analysisStatus"]
    }
  ) => Promise<Screen>

  /**
   * Ensure a given section name exists on the competitor's `sections`
   * list (case-insensitive dedup). Persists the change when something
   * new is added. Returns true when the list changed.
   */
  ensureCompetitorSection: (
    benchmarkId: string,
    competitorId: string,
    section: string
  ) => Promise<boolean>
  updateScreen: (
    benchmarkId: string,
    competitorId: string,
    screenId: string,
    patch: Partial<Omit<Screen, "id" | "createdAt">>
  ) => Promise<void>
  /** Move a screen to Trash. Storage files are kept until purge. */
  deleteScreen: (
    benchmarkId: string,
    competitorId: string,
    screenId: string
  ) => Promise<void>
  restoreScreen: (screenId: string) => Promise<void>
  /** Permanent delete — removes DB row AND storage objects. NOT recoverable. */
  purgeScreen: (screenId: string) => Promise<void>

  /** Upload an extra image into a screen's `additionalImages` list. */
  addScreenImage: (
    benchmarkId: string,
    competitorId: string,
    screenId: string,
    image: { url: string; storagePath: string; label?: string }
  ) => Promise<ScreenImage>

  /** Delete one of the additional images from a screen (and storage). */
  removeScreenImage: (
    benchmarkId: string,
    competitorId: string,
    screenId: string,
    imageId: string
  ) => Promise<void>

  /**
   * Cluster features across all competitors of a benchmark into canonical
   * groups using AI. Assigns a shared `groupKey` and `groupLabel` to each
   * feature in the same cluster and persists every affected competitor.
   * Returns the number of clusters created.
   */
  autoGroupFeatures: (
    benchmarkId: string,
    options: { apiKey: string; model: string; signal?: AbortSignal }
  ) => Promise<{ clusters: number; merged: number }>

  /**
   * Run a structured analysis on a single competitor: capability scores,
   * standout features, inferred strengths/weaknesses, risks and
   * opportunities. Persists the result as `competitor.insights`.
   */
  generateCompetitorInsights: (
    benchmarkId: string,
    competitorId: string,
    options: { apiKey: string; model: string; signal?: AbortSignal }
  ) => Promise<void>
}

// =====================================================================
// Helpers to update nested state immutably
// =====================================================================

function patchBenchmark(
  benchmarks: Benchmark[],
  id: string,
  fn: (b: Benchmark) => Benchmark
): Benchmark[] {
  return benchmarks.map((b) => (b.id === id ? fn(b) : b))
}

function patchCompetitor(
  benchmarks: Benchmark[],
  benchmarkId: string,
  competitorId: string,
  fn: (c: Competitor) => Competitor
): Benchmark[] {
  return patchBenchmark(benchmarks, benchmarkId, (b) => ({
    ...b,
    competitors: b.competitors.map((c) => (c.id === competitorId ? fn(c) : c)),
  }))
}

// =====================================================================
// Store
// =====================================================================

export const useBenchmarksStore = create<BenchmarksState>()((set, get) => ({
  benchmarks: [],
  loading: false,
  loaded: false,
  error: null,
  trash: { benchmarks: [], competitors: [], screens: [] },
  trashLoading: false,
  trashError: null,

  loadAll: async () => {
    set({ loading: true, error: null })
    try {
      const benchmarks = await api.fetchAllBenchmarks()
      set({ benchmarks, loading: false, loaded: true, error: null })
    } catch (e) {
      set({
        loading: false,
        loaded: true,
        error: formatError(e),
      })
    }
  },

  loadTrash: async () => {
    set({ trashLoading: true, trashError: null })
    try {
      const trash = await api.fetchTrash()
      set({ trash, trashLoading: false, trashError: null })
    } catch (e) {
      set({ trashLoading: false, trashError: formatError(e) })
    }
  },

  createBenchmark: async (data) => {
    const bm = await api.createBenchmark(data)
    set({ benchmarks: [bm, ...get().benchmarks] })
    return bm
  },

  updateBenchmark: async (id, patch) => {
    await api.updateBenchmark(id, patch)
    set({
      benchmarks: patchBenchmark(get().benchmarks, id, (b) => ({
        ...b,
        ...patch,
        updatedAt: new Date().toISOString(),
      })),
    })
  },

  deleteBenchmark: async (id) => {
    await api.deleteBenchmark(id)
    // Removed from the active list — still available via Trash until purged.
    set({ benchmarks: get().benchmarks.filter((b) => b.id !== id) })
  },

  restoreBenchmark: async (id) => {
    await api.restoreBenchmark(id)
    // Drop it from the cached trash listing and refresh the active list.
    set({
      trash: {
        ...get().trash,
        benchmarks: get().trash.benchmarks.filter((b) => b.id !== id),
      },
    })
    await get().loadAll()
  },

  purgeBenchmark: async (id) => {
    await api.purgeBenchmark(id)
    set({
      benchmarks: get().benchmarks.filter((b) => b.id !== id),
      trash: {
        ...get().trash,
        benchmarks: get().trash.benchmarks.filter((b) => b.id !== id),
      },
    })
  },

  addCompetitor: async (benchmarkId, data) => {
    const competitor = await api.createCompetitor({
      benchmarkId,
      ...data,
    })
    set({
      benchmarks: patchBenchmark(get().benchmarks, benchmarkId, (b) => ({
        ...b,
        competitors: [...b.competitors, competitor],
        updatedAt: new Date().toISOString(),
      })),
    })
    return competitor
  },

  updateCompetitor: async (benchmarkId, competitorId, patch) => {
    await api.updateCompetitor(competitorId, patch)
    set({
      benchmarks: patchCompetitor(
        get().benchmarks,
        benchmarkId,
        competitorId,
        (c) => ({
          ...c,
          ...patch,
          updatedAt: new Date().toISOString(),
        })
      ),
    })
  },

  deleteCompetitor: async (benchmarkId, competitorId) => {
    await api.deleteCompetitor(competitorId)
    set({
      benchmarks: patchBenchmark(get().benchmarks, benchmarkId, (b) => ({
        ...b,
        competitors: b.competitors.filter((c) => c.id !== competitorId),
        updatedAt: new Date().toISOString(),
      })),
    })
  },

  restoreCompetitor: async (competitorId) => {
    await api.restoreCompetitor(competitorId)
    set({
      trash: {
        ...get().trash,
        competitors: get().trash.competitors.filter(
          (c) => c.id !== competitorId
        ),
      },
    })
    await get().loadAll()
  },

  purgeCompetitor: async (competitorId) => {
    await api.purgeCompetitor(competitorId)
    set({
      trash: {
        ...get().trash,
        competitors: get().trash.competitors.filter(
          (c) => c.id !== competitorId
        ),
      },
    })
    // No-op for the active list (purge only acts on already-trashed rows).
  },

  mergeScreenFeatures: async (
    benchmarkId,
    competitorId,
    screenFeatures,
    category
  ) => {
    const bm = get().benchmarks.find((b) => b.id === benchmarkId)
    const competitor = bm?.competitors.find((c) => c.id === competitorId)
    if (!competitor) return 0

    const trimmedCategory = category?.trim() || undefined

    // Map existing features by lowercased name for quick lookup + edit
    const existing = new Map<string, Feature>()
    for (const f of competitor.features ?? []) {
      existing.set(f.name.trim().toLowerCase(), f)
    }

    const additions: Feature[] = []
    let mutatedExisting = false

    for (const sf of screenFeatures) {
      const name = sf.name.trim()
      if (!name) continue
      const key = name.toLowerCase()
      const current = existing.get(key)
      if (current) {
        // Back-fill category on legacy rows that don't have one yet.
        if (!current.category && trimmedCategory) {
          existing.set(key, { ...current, category: trimmedCategory })
          mutatedExisting = true
        }
        continue
      }
      const newFeature: Feature = {
        id: uid("feat"),
        name,
        description: sf.description?.trim() || undefined,
        support: "yes",
        category: trimmedCategory,
      }
      existing.set(key, newFeature)
      additions.push(newFeature)
    }

    if (additions.length === 0 && !mutatedExisting) return 0

    // Preserve original ordering for already-known features, append new ones.
    const oldIdsInOrder = (competitor.features ?? []).map((f) =>
      f.name.trim().toLowerCase()
    )
    const ordered: Feature[] = []
    const seen = new Set<string>()
    for (const key of oldIdsInOrder) {
      const f = existing.get(key)
      if (f) {
        ordered.push(f)
        seen.add(key)
      }
    }
    for (const f of additions) {
      const key = f.name.trim().toLowerCase()
      if (!seen.has(key)) ordered.push(f)
    }

    await api.updateCompetitor(competitorId, { features: ordered })

    set({
      benchmarks: patchCompetitor(
        get().benchmarks,
        benchmarkId,
        competitorId,
        (c) => ({
          ...c,
          features: ordered,
          updatedAt: new Date().toISOString(),
        })
      ),
    })

    return additions.length
  },

  addScreen: async (benchmarkId, competitorId, data) => {
    const screen = await api.createScreen({
      competitorId,
      title: data.title ?? "New screen",
      section: data.section,
      imageUrl: data.imageUrl,
      imageStoragePath: data.imageStoragePath,
      sourceUrl: data.sourceUrl,
      additionalImages: data.additionalImages,
      analysisStatus: data.analysisStatus,
    })
    set({
      benchmarks: patchCompetitor(
        get().benchmarks,
        benchmarkId,
        competitorId,
        (c) => ({
          ...c,
          screens: [...(c.screens ?? []), screen],
          updatedAt: new Date().toISOString(),
        })
      ),
    })
    return screen
  },

  ensureCompetitorSection: async (benchmarkId, competitorId, section) => {
    const name = section.trim()
    if (!name) return false
    const bm = get().benchmarks.find((b) => b.id === benchmarkId)
    const competitor = bm?.competitors.find((c) => c.id === competitorId)
    if (!competitor) return false
    const current = competitor.sections ?? []
    if (current.some((s) => s.trim().toLowerCase() === name.toLowerCase())) {
      return false
    }
    const next = [...current, name]
    await api.updateCompetitor(competitorId, { sections: next })
    set({
      benchmarks: patchCompetitor(
        get().benchmarks,
        benchmarkId,
        competitorId,
        (c) => ({
          ...c,
          sections: next,
          updatedAt: new Date().toISOString(),
        })
      ),
    })
    return true
  },

  updateScreen: async (benchmarkId, competitorId, screenId, patch) => {
    // Optimistic local update so the UI feels instant.
    set({
      benchmarks: patchCompetitor(
        get().benchmarks,
        benchmarkId,
        competitorId,
        (c) => ({
          ...c,
          screens: (c.screens ?? []).map((s) =>
            s.id === screenId
              ? { ...s, ...patch, updatedAt: new Date().toISOString() }
              : s
          ),
        })
      ),
    })
    try {
      await api.updateScreen(screenId, patch)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[updateScreen] supabase error", e)
      throw e
    }
  },

  deleteScreen: async (benchmarkId, competitorId, screenId) => {
    // Soft delete only — files stay in Storage until purge.
    await api.deleteScreen(screenId)
    set({
      benchmarks: patchCompetitor(
        get().benchmarks,
        benchmarkId,
        competitorId,
        (c) => ({
          ...c,
          screens: (c.screens ?? []).filter((s) => s.id !== screenId),
          updatedAt: new Date().toISOString(),
        })
      ),
    })
  },

  restoreScreen: async (screenId) => {
    await api.restoreScreen(screenId)
    set({
      trash: {
        ...get().trash,
        screens: get().trash.screens.filter((s) => s.id !== screenId),
      },
    })
    await get().loadAll()
  },

  purgeScreen: async (screenId) => {
    // Find the trashed screen to learn which storage paths to remove.
    const trashed = get().trash.screens.find((s) => s.id === screenId)
    const paths: string[] = []
    if (trashed?.imageStoragePath) paths.push(trashed.imageStoragePath)
    for (const img of trashed?.additionalImages ?? []) {
      if (img.storagePath) paths.push(img.storagePath)
    }
    await api.purgeScreen(screenId, paths)
    set({
      trash: {
        ...get().trash,
        screens: get().trash.screens.filter((s) => s.id !== screenId),
      },
    })
  },

  addScreenImage: async (benchmarkId, competitorId, screenId, image) => {
    const bm = get().benchmarks.find((b) => b.id === benchmarkId)
    const competitor = bm?.competitors.find((c) => c.id === competitorId)
    const screen = competitor?.screens.find((s) => s.id === screenId)
    if (!screen) throw new Error("Screen not found")

    const newImage: ScreenImage = {
      id: uid("img"),
      url: image.url,
      storagePath: image.storagePath,
      label: image.label,
    }
    const nextImages = [...(screen.additionalImages ?? []), newImage]

    await api.updateScreen(screenId, { additionalImages: nextImages })

    set({
      benchmarks: patchCompetitor(
        get().benchmarks,
        benchmarkId,
        competitorId,
        (c) => ({
          ...c,
          screens: (c.screens ?? []).map((s) =>
            s.id === screenId
              ? {
                  ...s,
                  additionalImages: nextImages,
                  updatedAt: new Date().toISOString(),
                }
              : s
          ),
        })
      ),
    })

    return newImage
  },

  removeScreenImage: async (benchmarkId, competitorId, screenId, imageId) => {
    const bm = get().benchmarks.find((b) => b.id === benchmarkId)
    const competitor = bm?.competitors.find((c) => c.id === competitorId)
    const screen = competitor?.screens.find((s) => s.id === screenId)
    if (!screen) throw new Error("Screen not found")

    const target = screen.additionalImages?.find((i) => i.id === imageId)
    const nextImages = (screen.additionalImages ?? []).filter(
      (i) => i.id !== imageId
    )

    await api.updateScreen(screenId, { additionalImages: nextImages })

    if (target?.storagePath) {
      // Best-effort storage cleanup; ignore failure.
      api.removeStorageObject(target.storagePath).catch(() => {})
    }

    set({
      benchmarks: patchCompetitor(
        get().benchmarks,
        benchmarkId,
        competitorId,
        (c) => ({
          ...c,
          screens: (c.screens ?? []).map((s) =>
            s.id === screenId
              ? {
                  ...s,
                  additionalImages: nextImages,
                  updatedAt: new Date().toISOString(),
                }
              : s
          ),
        })
      ),
    })
  },

  autoGroupFeatures: async (benchmarkId, options) => {
    const benchmark = get().benchmarks.find((b) => b.id === benchmarkId)
    if (!benchmark) throw new Error("Benchmark not found")

    // Build the input for the AI: each competitor name + its raw feature names.
    const competitorsInput = benchmark.competitors.map((c) => ({
      name: c.name,
      features: (c.features ?? []).map((f) => f.name),
    }))

    const totalFeatures = competitorsInput.reduce(
      (acc, c) => acc + c.features.length,
      0
    )
    if (totalFeatures === 0) return { clusters: 0, merged: 0 }

    const groups = await aiGroupFeatures({
      apiKey: options.apiKey,
      model: options.model,
      competitors: competitorsInput,
      signal: options.signal,
    })

    if (groups.length === 0) return { clusters: 0, merged: 0 }

    // For each cluster, give all of its members a shared key. Re-running
    // overwrites the previous grouping so the latest model output wins.
    // We touch only clusters that actually merge across competitors OR
    // that the user might want to rename later — i.e. EVERY group gets
    // a key so the matrix is fully canonicalised.
    const featureUpdatesByCompetitor = new Map<string, Feature[]>()
    for (const c of benchmark.competitors) {
      featureUpdatesByCompetitor.set(
        c.id,
        (c.features ?? []).map((f) => ({ ...f }))
      )
    }

    let mergedCount = 0
    for (const group of groups) {
      const key = uid("grp")
      const label = group.canonical.trim()
      const involvedCompetitors = new Set<string>()
      for (const member of group.members) {
        const competitor = benchmark.competitors.find(
          (c) => c.name === member.competitor
        )
        if (!competitor) continue
        const features = featureUpdatesByCompetitor.get(competitor.id)
        if (!features) continue
        const idx = features.findIndex((f) => f.name === member.name)
        if (idx === -1) continue
        features[idx] = {
          ...features[idx],
          groupKey: key,
          groupLabel: label,
        }
        involvedCompetitors.add(competitor.id)
      }
      if (involvedCompetitors.size > 1) {
        mergedCount += group.members.length
      }
    }

    // Persist every competitor whose feature array actually changed.
    const tasks: Promise<void>[] = []
    for (const c of benchmark.competitors) {
      const updated = featureUpdatesByCompetitor.get(c.id)
      if (!updated) continue
      tasks.push(api.updateCompetitor(c.id, { features: updated }))
    }
    await Promise.all(tasks)

    set({
      benchmarks: patchBenchmark(get().benchmarks, benchmarkId, (b) => ({
        ...b,
        competitors: b.competitors.map((c) => ({
          ...c,
          features: featureUpdatesByCompetitor.get(c.id) ?? c.features,
          updatedAt: new Date().toISOString(),
        })),
        updatedAt: new Date().toISOString(),
      })),
    })

    return { clusters: groups.length, merged: mergedCount }
  },

  generateCompetitorInsights: async (benchmarkId, competitorId, options) => {
    const benchmark = get().benchmarks.find((b) => b.id === benchmarkId)
    const competitor = benchmark?.competitors.find(
      (c) => c.id === competitorId
    )
    if (!benchmark || !competitor) throw new Error("Competitor not found")

    const insights = await aiAnalyseCompetitor({
      apiKey: options.apiKey,
      model: options.model,
      competitor,
      signal: options.signal,
    })

    await api.updateCompetitor(competitorId, { insights })

    set({
      benchmarks: patchCompetitor(
        get().benchmarks,
        benchmarkId,
        competitorId,
        (c) => ({
          ...c,
          insights,
          updatedAt: new Date().toISOString(),
        })
      ),
    })
  },
}))

export function useBenchmark(id?: string) {
  return useBenchmarksStore((s) =>
    id ? s.benchmarks.find((b) => b.id === id) : undefined
  )
}

export function useCompetitor(benchmarkId?: string, competitorId?: string) {
  return useBenchmarksStore((s) => {
    if (!benchmarkId || !competitorId) return undefined
    const bm = s.benchmarks.find((b) => b.id === benchmarkId)
    return bm?.competitors.find((c) => c.id === competitorId)
  })
}
