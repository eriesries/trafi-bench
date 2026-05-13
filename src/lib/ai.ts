import type { ScreenFeature } from "@/types/benchmark"

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
