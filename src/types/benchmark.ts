export type CompetitorTier = "leader" | "challenger" | "niche" | "emerging"

export type FeatureSupport = "yes" | "partial" | "no" | "unknown"

export interface Feature {
  id: string
  name: string
  description?: string
  support: FeatureSupport
  notes?: string
  /**
   * Folder/group this feature belongs to. When the feature was auto-created
   * from a product screen, this is pre-filled with the screen's title.
   * Free-form text; the editor offers autocomplete from existing categories.
   */
  category?: string
  /**
   * Cross-competitor cluster identifier. Two features that share the same
   * `groupKey` are considered the same conceptual capability and collapse
   * into a single row on the Feature Matrix. Populated automatically by the
   * "Auto-group with AI" action; a manual override is possible from the
   * matrix UI in the future.
   */
  groupKey?: string
  /**
   * Optional canonical display label for the group (e.g. "Product
   * categories"). When set, this is the name shown on the matrix row
   * instead of the raw per-competitor feature name.
   */
  groupLabel?: string
}

export interface Pricing {
  plan: string
  price: string
  highlights?: string
}

export interface ScreenFeature {
  name: string
  description?: string
}

export type ScreenAnalysisStatus =
  | "idle"
  | "analyzing"
  | "done"
  | "error"

export interface ScreenImage {
  id: string
  url: string
  storagePath: string
  /** Optional caption — e.g. "Popup", "Empty state", "Mobile view". */
  label?: string
}

export interface Screen {
  id: string
  /** Human-friendly title (auto-filled by AI or set by user) */
  title: string
  /**
   * Macro section the screen belongs to inside the competitor's app
   * (e.g. "Marketing", "Orders", "Settings"). Maps to a name in
   * `Competitor.sections`.
   */
  section?: string
  /** Public URL of the primary screenshot (Supabase Storage) */
  imageUrl: string
  /** Path inside the Storage bucket — used to delete the object */
  imageStoragePath: string
  /**
   * Extra screenshots attached to this screen (popups, modals, hover
   * states). They are shown alongside the primary image and the AI
   * analyzes them together as a single context.
   */
  additionalImages: ScreenImage[]
  /** Source URL where the screenshot was captured from (optional) */
  sourceUrl?: string
  /** AI-generated short summary of what the screen does */
  aiSummary?: string
  /** AI-detected features */
  features: ScreenFeature[]
  /** Free-form notes from the user */
  notes?: string
  /** Last AI run status */
  analysisStatus: ScreenAnalysisStatus
  /** Last AI error message if any */
  analysisError?: string
  /** Model that produced the last analysis */
  analyzedWith?: string
  createdAt: string
  updatedAt: string
  /** When set, the screen is in the Trash and excluded from regular views. */
  deletedAt?: string
}

// =====================================================================
// Competitor insights — AI-generated structured analysis
// =====================================================================

export type InsightConfidence = "high" | "medium" | "low"

export interface CapabilityScore {
  /** e.g. "AI & automation", "Bulk operations", "Mobile experience". */
  dimension: string
  /** 0–10 score; 5 = solid coverage, 8+ = clearly differentiated. */
  score: number
  confidence: InsightConfidence
  /** 1–2 sentences citing feature names from the input. */
  rationale: string
  /** Feature names (verbatim) that contributed to the score. */
  evidence: string[]
}

export interface InsightTheme {
  /** Short label, e.g. "Powerful catalog import". */
  theme: string
  /** Why this is a strength/weakness, 1–2 sentences. */
  rationale: string
  /** Feature names cited as evidence. */
  evidence: string[]
}

export interface StandoutFeature {
  /** Feature name from the input (groupLabel preferred if present). */
  name: string
  /** Why it stands out, 1 sentence. */
  why: string
}

export interface CompetitorInsights {
  /** ISO timestamp the insights were generated. */
  generatedAt: string
  /** Model id used to generate, for traceability. */
  model: string
  /** 2–3 sentence executive summary of who this product is and what it does. */
  summary: string
  /** Inferred target audience. */
  targetAudience: string
  /** Inferred market positioning paragraph. */
  positioning: string
  /** Capability scores across standard + extra dimensions. */
  capabilities: CapabilityScore[]
  /** 3–5 features that genuinely differentiate this competitor. */
  standoutFeatures: StandoutFeature[]
  /** AI-inferred strengths (themes), different from the manual list. */
  inferredStrengths: InsightTheme[]
  /** AI-inferred weaknesses / gaps, different from the manual list. */
  inferredWeaknesses: InsightTheme[]
  /** Strategic competitive risks for someone building against this product. */
  risks: string[]
  /** Strategic opportunities a challenger could exploit. */
  opportunities: string[]
}

export interface Competitor {
  id: string
  name: string
  website?: string
  logoUrl?: string
  tagline?: string
  description?: string
  tier: CompetitorTier
  founded?: string
  hqLocation?: string
  pricing: Pricing[]
  strengths: string[]
  weaknesses: string[]
  features: Feature[]
  screens: Screen[]
  /**
   * Macro sections that organize this competitor's app (top-level menu
   * groups, e.g. "Orders", "Products", "Marketing"). Free-form list
   * used to group screens and features.
   */
  sections: string[]
  /** Score 0-10 calculated from features (or set manually) */
  overallScore?: number
  /** Free-form long-form notes / documentation in markdown */
  notes?: string
  /**
   * AI-generated structured analysis. Populated by the "Generate AI
   * insights" action and consumed both by the Dashboard UI and the
   * AI chat panel (so the chat can cite pre-computed judgments
   * instead of re-deriving them per query).
   */
  insights?: CompetitorInsights
  createdAt: string
  updatedAt: string
  /** When set, the competitor is in the Trash and excluded from regular views. */
  deletedAt?: string
}

export interface Benchmark {
  id: string
  title: string
  category: string
  summary?: string
  /** Owner team or person responsible */
  owner?: string
  status: "draft" | "in-review" | "published" | "archived"
  /** IDs of the competitors that are part of this benchmark */
  competitors: Competitor[]
  /** Dimensions / criteria used to compare competitors (used for radar charts later) */
  criteria: string[]
  createdAt: string
  updatedAt: string
  /** When set, the benchmark is in the Trash and excluded from regular views. */
  deletedAt?: string
}
