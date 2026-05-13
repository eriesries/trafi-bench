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

interface BenchmarksState {
  benchmarks: Benchmark[]
  loading: boolean
  loaded: boolean
  error: string | null

  loadAll: () => Promise<void>

  // Benchmarks CRUD
  createBenchmark: (data: api.CreateBenchmarkInput) => Promise<Benchmark>
  updateBenchmark: (
    id: string,
    patch: Partial<Omit<Benchmark, "id" | "createdAt" | "competitors">>
  ) => Promise<void>
  deleteBenchmark: (id: string) => Promise<void>

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
  deleteCompetitor: (benchmarkId: string, competitorId: string) => Promise<void>

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
  deleteScreen: (
    benchmarkId: string,
    competitorId: string,
    screenId: string
  ) => Promise<void>

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
    set({ benchmarks: get().benchmarks.filter((b) => b.id !== id) })
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
    const benchmark = get().benchmarks.find((b) => b.id === benchmarkId)
    const competitor = benchmark?.competitors.find((c) => c.id === competitorId)
    const screen = competitor?.screens.find((s) => s.id === screenId)

    const paths: string[] = []
    if (screen?.imageStoragePath) paths.push(screen.imageStoragePath)
    for (const img of screen?.additionalImages ?? []) {
      if (img.storagePath) paths.push(img.storagePath)
    }

    await api.deleteScreen(screenId, paths)
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
