import { SCREENS_BUCKET, supabase } from "@/lib/supabase"
import type {
  Benchmark,
  Competitor,
  Feature,
  Pricing,
  Screen,
  ScreenAnalysisStatus,
  ScreenFeature,
  ScreenImage,
} from "@/types/benchmark"

// ============================================================
// Row types (snake_case as returned from Supabase)
// ============================================================

interface BenchmarkRow {
  id: string
  title: string
  category: string
  summary: string | null
  owner: string | null
  status: Benchmark["status"]
  criteria: string[] | null
  deleted_at: string | null
  created_at: string
  updated_at: string
  competitors?: CompetitorRow[]
}

interface CompetitorRow {
  id: string
  benchmark_id: string
  name: string
  website: string | null
  logo_url: string | null
  tagline: string | null
  description: string | null
  tier: Competitor["tier"]
  founded: string | null
  hq_location: string | null
  pricing: Pricing[] | null
  strengths: string[] | null
  weaknesses: string[] | null
  features: Feature[] | null
  sections: string[] | null
  overall_score: number | null
  notes: string | null
  position: number
  deleted_at: string | null
  created_at: string
  updated_at: string
  screens?: ScreenRow[]
}

interface ScreenRow {
  id: string
  competitor_id: string
  title: string
  section: string | null
  image_url: string
  image_storage_path: string
  source_url: string | null
  additional_images: ScreenImage[] | null
  ai_summary: string | null
  features: ScreenFeature[] | null
  notes: string | null
  analysis_status: ScreenAnalysisStatus
  analysis_error: string | null
  analyzed_with: string | null
  position: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// Mappers
// ============================================================

function mapScreen(row: ScreenRow): Screen {
  return {
    id: row.id,
    title: row.title,
    section: row.section ?? undefined,
    imageUrl: row.image_url,
    imageStoragePath: row.image_storage_path,
    sourceUrl: row.source_url ?? undefined,
    additionalImages: Array.isArray(row.additional_images)
      ? row.additional_images
      : [],
    aiSummary: row.ai_summary ?? undefined,
    features: row.features ?? [],
    notes: row.notes ?? undefined,
    analysisStatus: row.analysis_status,
    analysisError: row.analysis_error ?? undefined,
    analyzedWith: row.analyzed_with ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  }
}

function mapCompetitor(row: CompetitorRow): Competitor {
  return {
    id: row.id,
    name: row.name,
    website: row.website ?? undefined,
    logoUrl: row.logo_url ?? undefined,
    tagline: row.tagline ?? undefined,
    description: row.description ?? undefined,
    tier: row.tier,
    founded: row.founded ?? undefined,
    hqLocation: row.hq_location ?? undefined,
    pricing: row.pricing ?? [],
    strengths: row.strengths ?? [],
    weaknesses: row.weaknesses ?? [],
    features: row.features ?? [],
    sections: row.sections ?? [],
    overallScore: row.overall_score ?? undefined,
    notes: row.notes ?? undefined,
    screens: (row.screens ?? [])
      .slice()
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
      .map(mapScreen),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  }
}

function mapBenchmark(row: BenchmarkRow): Benchmark {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    summary: row.summary ?? undefined,
    owner: row.owner ?? undefined,
    status: row.status,
    criteria: row.criteria ?? [],
    competitors: (row.competitors ?? [])
      .slice()
      .sort(
        (a, b) =>
          a.position - b.position || a.created_at.localeCompare(b.created_at)
      )
      .map(mapCompetitor),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  }
}

// ============================================================
// Benchmarks
// ============================================================

export async function fetchAllBenchmarks(): Promise<Benchmark[]> {
  // PostgREST supports filtering embedded resources via dot-notation —
  // we hide anything that has a `deleted_at` value at any level of the
  // tree (benchmark → competitor → screen).
  const { data, error } = await supabase
    .from("benchmarks")
    .select(
      `*,
       competitors:competitors (
         *,
         screens:screens (*)
       )`
    )
    .is("deleted_at", null)
    .is("competitors.deleted_at", null)
    .is("competitors.screens.deleted_at", null)
    .order("updated_at", { ascending: false })

  if (error) throw error
  return (data as BenchmarkRow[]).map(mapBenchmark)
}

export interface CreateBenchmarkInput {
  title: string
  category: string
  summary?: string
  owner?: string
  status?: Benchmark["status"]
  criteria?: string[]
}

export async function createBenchmark(
  input: CreateBenchmarkInput
): Promise<Benchmark> {
  const { data, error } = await supabase
    .from("benchmarks")
    .insert({
      title: input.title,
      category: input.category,
      summary: input.summary ?? null,
      owner: input.owner ?? null,
      status: input.status ?? "draft",
      criteria: input.criteria ?? [],
    })
    .select("*")
    .single()
  if (error) throw error
  return mapBenchmark({ ...(data as BenchmarkRow), competitors: [] })
}

export async function updateBenchmark(
  id: string,
  patch: Partial<Omit<Benchmark, "id" | "createdAt" | "updatedAt" | "competitors">>
): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (patch.title !== undefined) payload.title = patch.title
  if (patch.category !== undefined) payload.category = patch.category
  if (patch.summary !== undefined) payload.summary = patch.summary ?? null
  if (patch.owner !== undefined) payload.owner = patch.owner ?? null
  if (patch.status !== undefined) payload.status = patch.status
  if (patch.criteria !== undefined) payload.criteria = patch.criteria

  const { error } = await supabase
    .from("benchmarks")
    .update(payload)
    .eq("id", id)
  if (error) throw error
}

/**
 * Move a benchmark to the Trash (soft delete). Storage files are kept
 * untouched so a restore is fully recoverable. Use `purgeBenchmark` to
 * actually remove rows + storage objects permanently.
 */
export async function deleteBenchmark(id: string): Promise<void> {
  const { error } = await supabase
    .from("benchmarks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw error
}

/** Restore a soft-deleted benchmark. Children stay in whatever state they were in. */
export async function restoreBenchmark(id: string): Promise<void> {
  const { error } = await supabase
    .from("benchmarks")
    .update({ deleted_at: null })
    .eq("id", id)
  if (error) throw error
}

/**
 * Permanently delete a benchmark plus all of its competitors and screens
 * (DB cascade) and their storage objects. NOT recoverable.
 */
export async function purgeBenchmark(id: string): Promise<void> {
  const { data: comps } = await supabase
    .from("competitors")
    .select("id")
    .eq("benchmark_id", id)
  const compIds = (comps ?? []).map((c) => c.id)

  if (compIds.length > 0) {
    const { data: screens } = await supabase
      .from("screens")
      .select("image_storage_path, additional_images")
      .in("competitor_id", compIds)
    const paths = collectScreenPaths(screens ?? [])
    if (paths.length > 0) {
      await supabase.storage.from(SCREENS_BUCKET).remove(paths)
    }
  }

  const { error } = await supabase.from("benchmarks").delete().eq("id", id)
  if (error) throw error
}

// ============================================================
// Competitors
// ============================================================

export interface CreateCompetitorInput {
  benchmarkId: string
  name: string
  website?: string
  logoUrl?: string
  tagline?: string
  description?: string
  tier?: Competitor["tier"]
  founded?: string
  hqLocation?: string
  pricing?: Pricing[]
  strengths?: string[]
  weaknesses?: string[]
  features?: Feature[]
  sections?: string[]
  overallScore?: number
  notes?: string
}

export async function createCompetitor(
  input: CreateCompetitorInput
): Promise<Competitor> {
  const { data, error } = await supabase
    .from("competitors")
    .insert({
      benchmark_id: input.benchmarkId,
      name: input.name,
      website: input.website ?? null,
      logo_url: input.logoUrl ?? null,
      tagline: input.tagline ?? null,
      description: input.description ?? null,
      tier: input.tier ?? "emerging",
      founded: input.founded ?? null,
      hq_location: input.hqLocation ?? null,
      pricing: input.pricing ?? [],
      strengths: input.strengths ?? [],
      weaknesses: input.weaknesses ?? [],
      features: input.features ?? [],
      sections: input.sections ?? [],
      overall_score: input.overallScore ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single()
  if (error) throw error
  return mapCompetitor({ ...(data as CompetitorRow), screens: [] })
}

export async function updateCompetitor(
  id: string,
  patch: Partial<Omit<Competitor, "id" | "createdAt" | "updatedAt" | "screens">>
): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (patch.name !== undefined) payload.name = patch.name
  if (patch.website !== undefined) payload.website = patch.website ?? null
  if (patch.logoUrl !== undefined) payload.logo_url = patch.logoUrl ?? null
  if (patch.tagline !== undefined) payload.tagline = patch.tagline ?? null
  if (patch.description !== undefined)
    payload.description = patch.description ?? null
  if (patch.tier !== undefined) payload.tier = patch.tier
  if (patch.founded !== undefined) payload.founded = patch.founded ?? null
  if (patch.hqLocation !== undefined)
    payload.hq_location = patch.hqLocation ?? null
  if (patch.pricing !== undefined) payload.pricing = patch.pricing
  if (patch.strengths !== undefined) payload.strengths = patch.strengths
  if (patch.weaknesses !== undefined) payload.weaknesses = patch.weaknesses
  if (patch.features !== undefined) payload.features = patch.features
  if (patch.sections !== undefined) payload.sections = patch.sections
  if (patch.overallScore !== undefined)
    payload.overall_score = patch.overallScore ?? null
  if (patch.notes !== undefined) payload.notes = patch.notes ?? null

  const { error } = await supabase
    .from("competitors")
    .update(payload)
    .eq("id", id)
  if (error) throw error
}

export async function deleteCompetitor(id: string): Promise<void> {
  const { error } = await supabase
    .from("competitors")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw error
}

export async function restoreCompetitor(id: string): Promise<void> {
  const { error } = await supabase
    .from("competitors")
    .update({ deleted_at: null })
    .eq("id", id)
  if (error) throw error
}

export async function purgeCompetitor(id: string): Promise<void> {
  const { data: screens } = await supabase
    .from("screens")
    .select("image_storage_path, additional_images")
    .eq("competitor_id", id)
  const paths = collectScreenPaths(screens ?? [])
  if (paths.length > 0) {
    await supabase.storage.from(SCREENS_BUCKET).remove(paths)
  }
  const { error } = await supabase.from("competitors").delete().eq("id", id)
  if (error) throw error
}

function collectScreenPaths(
  rows: Array<{
    image_storage_path?: string | null
    additional_images?: ScreenImage[] | null
  }>
): string[] {
  const out: string[] = []
  for (const r of rows) {
    if (r.image_storage_path) out.push(r.image_storage_path)
    for (const img of r.additional_images ?? []) {
      if (img?.storagePath) out.push(img.storagePath)
    }
  }
  return out
}

// ============================================================
// Screens + Storage
// ============================================================

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } {
  const [meta, b64] = dataUrl.split(",")
  const mime = /data:([^;]+);base64/.exec(meta)?.[1] ?? "image/jpeg"
  const ext =
    mime === "image/png"
      ? "png"
      : mime === "image/webp"
        ? "webp"
        : "jpg"
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { blob: new Blob([bytes], { type: mime }), ext }
}

export async function uploadScreenImage(
  competitorId: string,
  dataUrl: string
): Promise<{ imageUrl: string; imageStoragePath: string }> {
  const { blob, ext } = dataUrlToBlob(dataUrl)
  const filename = `${crypto.randomUUID()}.${ext}`
  const path = `${competitorId}/${filename}`
  const { error } = await supabase.storage
    .from(SCREENS_BUCKET)
    .upload(path, blob, {
      contentType: blob.type,
      upsert: false,
    })
  if (error) throw error

  const { data } = supabase.storage.from(SCREENS_BUCKET).getPublicUrl(path)
  return { imageUrl: data.publicUrl, imageStoragePath: path }
}

export async function removeStorageObject(storagePath: string): Promise<void> {
  if (!storagePath) return
  await supabase.storage.from(SCREENS_BUCKET).remove([storagePath])
}

export interface CreateScreenInput {
  competitorId: string
  title: string
  section?: string
  imageUrl: string
  imageStoragePath: string
  sourceUrl?: string
  additionalImages?: ScreenImage[]
  analysisStatus?: ScreenAnalysisStatus
}

export async function createScreen(
  input: CreateScreenInput
): Promise<Screen> {
  const { data, error } = await supabase
    .from("screens")
    .insert({
      competitor_id: input.competitorId,
      title: input.title,
      section: input.section ?? null,
      image_url: input.imageUrl,
      image_storage_path: input.imageStoragePath,
      source_url: input.sourceUrl ?? null,
      additional_images: input.additionalImages ?? [],
      analysis_status: input.analysisStatus ?? "idle",
    })
    .select("*")
    .single()
  if (error) throw error
  return mapScreen(data as ScreenRow)
}

export async function updateScreen(
  id: string,
  patch: Partial<Omit<Screen, "id" | "createdAt" | "updatedAt">>
): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (patch.title !== undefined) payload.title = patch.title
  if (patch.section !== undefined) payload.section = patch.section ?? null
  if (patch.imageUrl !== undefined) payload.image_url = patch.imageUrl
  if (patch.imageStoragePath !== undefined)
    payload.image_storage_path = patch.imageStoragePath
  if (patch.sourceUrl !== undefined)
    payload.source_url = patch.sourceUrl ?? null
  if (patch.additionalImages !== undefined)
    payload.additional_images = patch.additionalImages
  if (patch.aiSummary !== undefined)
    payload.ai_summary = patch.aiSummary ?? null
  if (patch.features !== undefined) payload.features = patch.features
  if (patch.notes !== undefined) payload.notes = patch.notes ?? null
  if (patch.analysisStatus !== undefined)
    payload.analysis_status = patch.analysisStatus
  if (patch.analysisError !== undefined)
    payload.analysis_error = patch.analysisError ?? null
  if (patch.analyzedWith !== undefined)
    payload.analyzed_with = patch.analyzedWith ?? null

  const { error } = await supabase.from("screens").update(payload).eq("id", id)
  if (error) throw error
}

export async function deleteScreen(id: string): Promise<void> {
  const { error } = await supabase
    .from("screens")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw error
}

export async function restoreScreen(id: string): Promise<void> {
  const { error } = await supabase
    .from("screens")
    .update({ deleted_at: null })
    .eq("id", id)
  if (error) throw error
}

export async function purgeScreen(
  id: string,
  storagePaths: string[] = []
): Promise<void> {
  const paths = storagePaths.filter(Boolean)
  if (paths.length > 0) {
    await supabase.storage.from(SCREENS_BUCKET).remove(paths)
  }
  const { error } = await supabase.from("screens").delete().eq("id", id)
  if (error) throw error
}

// ============================================================
// Trash listing
// ============================================================

export interface TrashListing {
  benchmarks: Benchmark[]
  competitors: Array<Competitor & { benchmarkId: string; benchmarkTitle: string }>
  screens: Array<Screen & {
    competitorId: string
    competitorName: string
    benchmarkId: string
    benchmarkTitle: string
  }>
}

/**
 * Fetch everything currently in the Trash. Three independent buckets,
 * because a child can be soft-deleted on its own without its parent
 * being deleted.
 */
export async function fetchTrash(): Promise<TrashListing> {
  const [{ data: bms, error: bmErr }, { data: comps, error: cErr }, { data: scrs, error: sErr }] =
    await Promise.all([
      supabase
        .from("benchmarks")
        .select("*")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
      supabase
        .from("competitors")
        .select("*, benchmarks:benchmark_id(id, title)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
      supabase
        .from("screens")
        .select(
          "*, competitors:competitor_id(id, name, benchmark_id, benchmarks:benchmark_id(id, title))"
        )
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
    ])
  if (bmErr) throw bmErr
  if (cErr) throw cErr
  if (sErr) throw sErr

  return {
    benchmarks: (bms ?? []).map((b) =>
      mapBenchmark({ ...(b as BenchmarkRow), competitors: [] })
    ),
    competitors: (comps ?? []).map((row) => {
      const r = row as CompetitorRow & {
        benchmarks?: { id: string; title: string } | null
      }
      const competitor = mapCompetitor({ ...r, screens: [] })
      return {
        ...competitor,
        benchmarkId: r.benchmark_id,
        benchmarkTitle: r.benchmarks?.title ?? "(unknown benchmark)",
      }
    }),
    screens: (scrs ?? []).map((row) => {
      const r = row as ScreenRow & {
        competitors?: {
          id: string
          name: string
          benchmark_id: string
          benchmarks?: { id: string; title: string } | null
        } | null
      }
      const screen = mapScreen(r)
      return {
        ...screen,
        competitorId: r.competitor_id,
        competitorName: r.competitors?.name ?? "(unknown competitor)",
        benchmarkId: r.competitors?.benchmark_id ?? "",
        benchmarkTitle:
          r.competitors?.benchmarks?.title ?? "(unknown benchmark)",
      }
    }),
  }
}
