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
  createdAt: string
  updatedAt: string
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
}
