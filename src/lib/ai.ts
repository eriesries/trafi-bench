import type {
  CompetitorInsights,
  Competitor,
  Feature,
  ScreenFeature,
} from "@/types/benchmark"

export interface ScreenAnalysis {
  title: string
  summary: string
  features: ScreenFeature[]
}

interface AnalyzeOptions {
  /**
   * One or more public URLs (or data URLs) of the screen. When multiple
   * are provided they are treated as the same screen captured in
   * different states (e.g. main view + a popup) and analyzed together.
   */
  imageUrls: string[]
  apiKey: string
  model: string
  competitorName?: string
  context?: string
  signal?: AbortSignal
}

const SYSTEM_PROMPT = `You are a senior product analyst documenting a competitor's
UI in fine-grained detail for a competitive benchmark. Your job is to convert
ONE OR MORE related screenshots of the SAME screen into a structured list of
features that another product team can later reproduce confidently.

MULTI-IMAGE INPUT
You may receive several images at once. They all represent the SAME screen
captured in different states (e.g. the main page plus a popup that opens
from it, a dropdown expanded, a modal, an empty state, a hover state, a
mobile view). Treat them as ONE unified context: combine the information
from every image when describing features. Do NOT emit duplicate features
just because the same control appears in multiple shots. If a state is only
visible in one of the images (e.g. a confirmation dialog), describe it once
and reference the state it represents.

SCOPE — WHAT TO ANALYZE AND WHAT TO IGNORE
Analyze ONLY the main content area of the page (the "miolo" / body
content). Specifically, IGNORE and do NOT emit features for:
  - The global top header / app bar (logo, global search, account menu,
    notifications, help icon, dark-mode toggle, language selector, etc.).
  - The left/right global navigation sidebar (sidebar menu items, section
    groupings, collapse toggle, navigation icons).
  - Persistent footers and chrome (copyright bar, status bar, version
    info, cookie banner).
  - Browser chrome captured in the screenshot (URL bar, tabs, OS window
    controls).
These elements describe the app shell, not the page's actual
functionality, and pollute the benchmark with cross-cutting noise.

DO analyze:
  - The page-level title, breadcrumbs and contextual page actions that
    apply specifically to the current view (e.g. "Save", "Publish",
    "Add product" buttons that act on this page's data).
  - Tabs that switch sub-views within the page content.
  - Every section, card, form group, table, filter, control, summary
    metric, empty-state, banner and contextual menu that belongs to the
    page body.

OPERATING PRINCIPLES
- Look DEEP at the page body. Inspect every section, card, table column,
  form field, toggle, button, badge, sub-tab, helper text and modal that
  lives inside the main content area.
- Drill into sub-sections. If a section like "Basic Information" contains
  sub-areas like "Categories", "SKU", "Brand", "Visibility" — emit each
  as its own feature (e.g. "Basic Information — Categories"). Do NOT
  collapse multiple fields into a single vague feature.
- For each feature, capture the FUNCTIONAL PURPOSE, not just the visual
  label. Explain what the user can DO with it, what data it manipulates,
  and how it relates to other parts of the product. Example, GOOD:
  "Basic Information — Categories: lets the merchant assign the product
  to one or more category folders. These categories drive storefront
  navigation, filters, and category-based promotions." Example, BAD:
  "Categories: a field for categories."
- Mention concrete UI affordances when visible: dropdowns, multi-select,
  type-ahead, drag-and-drop, inline editing, autosave, search,
  pagination, bulk actions, file upload, color pickers, rich-text
  editor, tabs, accordions, modals, side drawers, validation states.
- If a control exposes specific options or values that are visible
  (dropdown values, status pills, tab names, table columns, currency
  selectors, etc.), name them explicitly.
- Group naming convention: when a feature lives inside a clearly-labeled
  section, prefix its name with "<Section> — <Feature>" so that
  features are easy to scan in a list.
- Aim for THOROUGHNESS over BREVITY. A dense screen (admin/back-office,
  product editor, settings panel) usually produces 10–25 features.
- Do NOT invent features that are not visible in the image. Do not
  describe expected behavior beyond what the screenshot evidences.
- Write in English. Be precise and concrete; avoid vague marketing
  phrases like "intuitive UI" or "great user experience".

OUTPUT
Respond ONLY in the requested JSON format (a JSON schema is enforced).
- "title": short name identifying the screen (e.g. "Add product — Basic info").
- "summary": 2–3 sentences describing the screen's purpose and main capability.
- "features[]": array of granular features. Each item:
    - "name": up to 100 characters, ideally prefixed with the section
      name when the feature lives inside one
      (e.g. "Basic Information — Categories").
    - "description": 1–4 sentences (up to 600 characters), describing
      what the feature is, what fields/options/controls it exposes, and
      what the user can do with it.`

const JSON_SCHEMA = {
  name: "screen_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: {
        type: "string",
        description:
          "Short name identifying the screen, e.g. 'Add product — Basic info'.",
      },
      summary: {
        type: "string",
        description:
          "2–3 sentences describing the screen's purpose and main capability.",
      },
      features: {
        type: "array",
        description:
          "Granular features visible in the screenshot. Each section, sub-section, form field, table column or control should appear as its own feature when meaningful.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: {
              type: "string",
              description:
                "Up to 100 chars. When the feature lives in a labeled section, prefix it like '<Section> — <Feature>'.",
            },
            description: {
              type: "string",
              description:
                "1–4 sentences (up to 600 chars). Explain what the feature is, the fields/options it exposes, and what the user can do with it.",
            },
          },
          required: ["name", "description"],
        },
      },
    },
    required: ["title", "summary", "features"],
  },
} as const

export async function analyzeScreenshot(
  options: AnalyzeOptions
): Promise<ScreenAnalysis> {
  const { imageUrls, apiKey, model, competitorName, context, signal } = options

  if (!apiKey) {
    throw new Error(
      "Set your OpenAI API key in Settings to use AI analysis."
    )
  }

  if (!imageUrls?.length) {
    throw new Error("At least one image is required for analysis.")
  }

  const imageCount = imageUrls.length
  const userText = [
    imageCount > 1
      ? `You will receive ${imageCount} images of the SAME screen in different states. Analyze them together as one unified context — do not duplicate features.`
      : null,
    competitorName
      ? `Competitor analyzed: ${competitorName}.`
      : "Competitor analyzed: unknown.",
    context ? `Additional context: ${context}` : null,
    "Analyze the attached screenshot and respond in the specified JSON format.",
    "Important: be EXHAUSTIVE about the PAGE BODY only. Walk through the",
    "page content section by section, naming every form field, table column,",
    "control and sub-area you can see in the main content area, and explain",
    "its functional purpose. A dense admin or product-editor screen should",
    "typically produce 10–25 distinct features. When a section contains",
    "sub-fields (e.g. 'Basic Information' with 'Categories', 'SKU',",
    "'Visibility'), emit each sub-field as its own feature.",
    "",
    "STRICT SCOPE: do NOT emit features for the global top header, the",
    "left/right global navigation sidebar, persistent footers or browser",
    "chrome. Those describe the app shell, not the page-specific",
    "functionality, and must be excluded.",
  ]
    .filter(Boolean)
    .join("\n")

  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          ...imageUrls.map((url) => ({
            type: "image_url" as const,
            image_url: { url, detail: "high" as const },
          })),
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: JSON_SCHEMA,
    },
    temperature: 0.2,
    max_tokens: 4096,
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    let detail = ""
    try {
      const errJson = await res.json()
      detail = errJson?.error?.message ?? JSON.stringify(errJson)
    } catch {
      detail = await res.text()
    }
    throw new Error(`OpenAI ${res.status}: ${detail || res.statusText}`)
  }

  const data = await res.json()
  const raw = data?.choices?.[0]?.message?.content
  if (!raw || typeof raw !== "string") {
    throw new Error("Unexpected response from OpenAI (no content).")
  }

  let parsed: ScreenAnalysis
  try {
    parsed = JSON.parse(raw) as ScreenAnalysis
  } catch (e) {
    throw new Error(
      `Failed to parse OpenAI JSON: ${(e as Error).message}\n\n${raw}`
    )
  }

  return {
    title: (parsed.title ?? "").trim() || "Untitled screen",
    summary: (parsed.summary ?? "").trim(),
    features: Array.isArray(parsed.features)
      ? parsed.features.map((f) => ({
          name: String(f?.name ?? "").trim(),
          description: f?.description
            ? String(f.description).trim()
            : undefined,
        }))
      : [],
  }
}

// =====================================================================
// Feature clustering across competitors
// =====================================================================

export interface FeatureGroupMember {
  competitor: string
  name: string
}

export interface FeatureGroup {
  canonical: string
  members: FeatureGroupMember[]
}

interface GroupFeaturesOptions {
  apiKey: string
  model: string
  competitors: Array<{ name: string; features: string[] }>
  signal?: AbortSignal
}

const GROUP_SYSTEM_PROMPT = `You are a senior product analyst tasked with
de-duplicating a list of UI features captured across MULTIPLE competing
products. Each competitor contributes its own list of feature names. The
SAME underlying capability is often named differently by each competitor
(e.g. "Basic Information — Categories" vs "Product categorization" vs
"Taxonomy").

YOUR JOB
- Cluster features that semantically represent the SAME capability into a
  single group, regardless of how each competitor named it.
- Features that are unique to one competitor still get their own group
  with a single member — never drop a feature.
- Every input feature must appear in EXACTLY ONE group.
- The "canonical" group name should be a short (3–7 words), neutral label
  for the capability — avoid competitor-specific terminology when
  possible.

GOOD CLUSTERS
- "Product categories" ← ["Basic Information — Categories",
                          "Product categorization",
                          "Taxonomy"]
- "Inventory tracking" ← ["Inventory — Stock level",
                          "Track quantity"]

BAD CLUSTERS (do NOT do this)
- Merging "Discounts" with "Coupons" just because both are promotions.
  Different capability → different group.
- Dropping a feature because no other competitor has it.

OUTPUT
Respond ONLY in the required JSON shape (a JSON schema is enforced).
Preserve the original feature name and the competitor name VERBATIM in
each "members" entry — do not paraphrase, fix typos, or merge case
variants. The system uses those strings to look the feature back up.`

const GROUP_JSON_SCHEMA = {
  name: "feature_groups",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      groups: {
        type: "array",
        description:
          "Clusters of semantically-equivalent features. Every input feature must appear in exactly one group.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            canonical: {
              type: "string",
              description:
                "Short canonical name (3–7 words) for the capability, neutral across competitors.",
            },
            members: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  competitor: { type: "string" },
                  name: { type: "string" },
                },
                required: ["competitor", "name"],
              },
            },
          },
          required: ["canonical", "members"],
        },
      },
    },
    required: ["groups"],
  },
} as const

/**
 * Cluster feature names across competitors into canonical groups. The
 * cluster keys are then applied to `Feature.groupKey` / `Feature.groupLabel`
 * by the store so the Matrix can collapse equivalent features into one row.
 */
export async function groupFeatures(
  options: GroupFeaturesOptions
): Promise<FeatureGroup[]> {
  const { apiKey, model, competitors, signal } = options

  if (!apiKey) {
    throw new Error("Set your OpenAI API key in Settings to use AI grouping.")
  }
  const hasAny = competitors.some((c) => c.features.length > 0)
  if (!hasAny) return []

  const userText = [
    "Cluster these features into capability groups. Preserve feature names",
    "and competitor names verbatim in the output.",
    "",
    "COMPETITORS AND THEIR FEATURES:",
    "",
    ...competitors
      .filter((c) => c.features.length > 0)
      .map((c) =>
        [`[${c.name}]`, ...c.features.map((f) => `- ${f}`), ""].join("\n")
      ),
  ].join("\n")

  const body = {
    model,
    messages: [
      { role: "system", content: GROUP_SYSTEM_PROMPT },
      { role: "user", content: userText },
    ],
    response_format: {
      type: "json_schema",
      json_schema: GROUP_JSON_SCHEMA,
    },
    temperature: 0.1,
    max_tokens: 4096,
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    let detail = ""
    try {
      const errJson = await res.json()
      detail = errJson?.error?.message ?? JSON.stringify(errJson)
    } catch {
      detail = await res.text()
    }
    throw new Error(`OpenAI ${res.status}: ${detail || res.statusText}`)
  }

  const data = await res.json()
  const raw = data?.choices?.[0]?.message?.content
  if (!raw || typeof raw !== "string") {
    throw new Error("Unexpected response from OpenAI (no content).")
  }

  let parsed: { groups?: FeatureGroup[] }
  try {
    parsed = JSON.parse(raw) as { groups?: FeatureGroup[] }
  } catch (e) {
    throw new Error(
      `Failed to parse OpenAI grouping JSON: ${(e as Error).message}\n\n${raw}`
    )
  }

  return Array.isArray(parsed.groups)
    ? parsed.groups.map((g) => ({
        canonical: String(g.canonical ?? "").trim() || "Untitled group",
        members: Array.isArray(g.members)
          ? g.members
              .map((m) => ({
                competitor: String(m.competitor ?? "").trim(),
                name: String(m.name ?? "").trim(),
              }))
              .filter((m) => m.competitor && m.name)
          : [],
      }))
    : []
}

// =====================================================================
// Competitor insights — pre-computed structured analysis
// =====================================================================

interface AnalyseCompetitorOptions {
  apiKey: string
  model: string
  competitor: Competitor
  signal?: AbortSignal
}

const ANALYSE_SYSTEM_PROMPT = `You are a senior product analyst building a
structured profile of a competing product based on documented UI screens
and features. The profile feeds a competitive benchmark and is consumed
both by humans and by other AI tools, so your judgments must be
calibrated, specific and backed by evidence pulled from the input.

INPUTS
You receive a JSON snapshot of ONE competitor:
- name, tier, website, tagline, description, overallScore.
- strengths / weaknesses — the user's qualitative notes.
- pricing — plans + headlines.
- sections — macro areas of the product.
- screens — captured screenshots with title, section, notes.
- features[] — each with name, groupLabel, category, support
  ("yes"/"partial"/"no"/"unknown"), description, notes. THE DESCRIPTION
  IS YOUR PRIMARY EVIDENCE.

YOUR JOB
Produce a structured insights object that:
1. Summarises what this product IS and who it's for.
2. Scores its capability across well-defined dimensions (0–10), with
   confidence ("high" / "medium" / "low") and a rationale citing
   specific feature names.
3. Identifies 3–5 standout features that genuinely differentiate it.
4. Articulates AI-inferred strength themes WITH evidence (feature
   names cited verbatim).
5. Articulates inferred weaknesses / gaps WITH evidence.
6. Surfaces competitive risks (for someone building against it) and
   opportunities (where a challenger could attack).

SCORING METHODOLOGY (MUST FOLLOW)

For each dimension:
1. Expand into a keyword/synonym set. Examples:
   - AI & automation → ai, ml, machine learning, smart, auto-, predict,
     recommend, assistant, copilot, generate, suggest, anomaly,
     personalization, chatbot, gpt, llm.
   - Bulk operations → bulk, batch, mass, multi-select, select all,
     apply to, import, export, csv, xls.
   - Customisation → custom, customise, theme, layout, template,
     drag-and-drop, builder, page builder, code editor, snippet,
     extension, app, plugin.
   - Mobile experience → mobile, responsive, app, ios, android, touch,
     breakpoint.
   - Catalog & inventory → product, sku, variant, inventory, stock,
     warehouse, fulfilment, bundle.
   - Marketing & promotions → promo, discount, coupon, campaign,
     email, automation, segment, audience, abandoned cart.
   - Analytics & reporting → report, dashboard, kpi, metric, chart,
     export, funnel, cohort.
   - Storefront & customer experience → checkout, cart, search,
     navigation, accessibility, performance, internationalisation.
2. Scan EVERY feature.name + description + notes + groupLabel +
   category for matches (case-insensitive, partial words count).
3. Weight matches by support: yes=1.0, partial=0.6, no=0.2,
   unknown=0.4.
4. Map weighted match count to a 0–10 score:
   - 0 = no documented capability.
   - 3–4 = a small handful of basic features.
   - 5–6 = solid, baseline coverage.
   - 7–8 = above-baseline, includes differentiating bits.
   - 9–10 = clearly best-in-class with multiple advanced features.
5. Confidence: "high" if 4+ features support the judgment AT support
   "yes"; "medium" if 2–3; "low" otherwise. Also "low" when most
   matches are at support "unknown".
6. Rationale: 1–2 sentences citing AT LEAST one feature by name.
7. Evidence: array of feature names (verbatim) that anchor the
   score.

DIMENSIONS (always score these eight)
- AI & automation
- Bulk operations & data management
- Customisation & extensibility
- Storefront & customer experience
- Orders & fulfilment
- Catalog & inventory management
- Marketing & promotions
- Analytics & reporting

You MAY add up to 3 extra dimensions if the documented features
strongly suggest another axis (e.g. "B2B & wholesale" if the
features include trade pricing, net terms, etc.).

EVIDENCE RULES
- Cite feature names VERBATIM as they appear in the input. The system
  uses those strings to render evidence pills back to the user, so a
  paraphrase breaks the UI.
- If you mention a number in any field (e.g. "documents 6 bulk
  features"), make sure it matches what you actually cite.
- Never invent features or controls not present in the input.

OUTPUT
Respond ONLY in the requested JSON schema (enforced).`

const ANALYSE_JSON_SCHEMA = {
  name: "competitor_insights",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      targetAudience: { type: "string" },
      positioning: { type: "string" },
      capabilities: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            dimension: { type: "string" },
            score: { type: "number", minimum: 0, maximum: 10 },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            rationale: { type: "string" },
            evidence: { type: "array", items: { type: "string" } },
          },
          required: ["dimension", "score", "confidence", "rationale", "evidence"],
        },
      },
      standoutFeatures: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            why: { type: "string" },
          },
          required: ["name", "why"],
        },
      },
      inferredStrengths: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            theme: { type: "string" },
            rationale: { type: "string" },
            evidence: { type: "array", items: { type: "string" } },
          },
          required: ["theme", "rationale", "evidence"],
        },
      },
      inferredWeaknesses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            theme: { type: "string" },
            rationale: { type: "string" },
            evidence: { type: "array", items: { type: "string" } },
          },
          required: ["theme", "rationale", "evidence"],
        },
      },
      risks: { type: "array", items: { type: "string" } },
      opportunities: { type: "array", items: { type: "string" } },
    },
    required: [
      "summary",
      "targetAudience",
      "positioning",
      "capabilities",
      "standoutFeatures",
      "inferredStrengths",
      "inferredWeaknesses",
      "risks",
      "opportunities",
    ],
  },
} as const

const MAX_FEATURE_DESCRIPTION_FOR_ANALYSIS = 500

function trimForAnalysis(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined
  const t = s.trim()
  if (!t) return undefined
  return t.length > max ? t.slice(0, max) + "…" : t
}

function snapshotCompetitorForAnalysis(c: Competitor) {
  return {
    name: c.name,
    tier: c.tier,
    website: c.website,
    tagline: trimForAnalysis(c.tagline, 240),
    description: trimForAnalysis(c.description, 600),
    overallScore: c.overallScore,
    strengths: c.strengths,
    weaknesses: c.weaknesses,
    pricing: c.pricing?.map((p) => ({
      plan: p.plan,
      price: p.price,
      highlights: trimForAnalysis(p.highlights, 240),
    })),
    sections: c.sections,
    screens: (c.screens ?? []).map((s) => ({
      title: s.title,
      section: s.section,
      notes: trimForAnalysis(s.notes, 240),
    })),
    features: (c.features ?? []).map((f: Feature) => ({
      name: f.name,
      groupLabel: f.groupLabel,
      category: f.category,
      support: f.support,
      description: trimForAnalysis(
        f.description,
        MAX_FEATURE_DESCRIPTION_FOR_ANALYSIS
      ),
      notes: trimForAnalysis(f.notes, 240),
    })),
  }
}

/**
 * Generate a structured insights object for a single competitor. The
 * caller is responsible for persisting the result (typically via the
 * store action that wraps `updateCompetitor`).
 */
export async function analyseCompetitor(
  options: AnalyseCompetitorOptions
): Promise<CompetitorInsights> {
  const { apiKey, model, competitor, signal } = options

  if (!apiKey) {
    throw new Error(
      "Set your OpenAI API key in Settings to generate insights."
    )
  }
  if (!competitor) throw new Error("Competitor is required.")
  if ((competitor.features ?? []).length === 0) {
    throw new Error(
      "This competitor has no features documented yet — add screens and run the analysis first."
    )
  }

  const snapshot = snapshotCompetitorForAnalysis(competitor)

  const userText = [
    "Analyse the following competitor snapshot and emit the structured insights JSON.",
    "Cite feature names VERBATIM. Apply the scoring methodology rigorously.",
    "",
    "COMPETITOR SNAPSHOT:",
    JSON.stringify(snapshot, null, 2),
  ].join("\n")

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: ANALYSE_SYSTEM_PROMPT },
        { role: "user", content: userText },
      ],
      response_format: {
        type: "json_schema",
        json_schema: ANALYSE_JSON_SCHEMA,
      },
      temperature: 0.2,
      max_tokens: 4096,
    }),
    signal,
  })

  if (!res.ok) {
    let detail = ""
    try {
      const errJson = await res.json()
      detail = errJson?.error?.message ?? JSON.stringify(errJson)
    } catch {
      detail = await res.text()
    }
    throw new Error(`OpenAI ${res.status}: ${detail || res.statusText}`)
  }

  const data = await res.json()
  const raw = data?.choices?.[0]?.message?.content
  if (!raw || typeof raw !== "string") {
    throw new Error("Unexpected response from OpenAI (no content).")
  }

  let parsed: Omit<CompetitorInsights, "generatedAt" | "model">
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new Error(
      `Failed to parse insights JSON: ${(e as Error).message}\n\n${raw}`
    )
  }

  return {
    ...parsed,
    generatedAt: new Date().toISOString(),
    model,
  }
}
