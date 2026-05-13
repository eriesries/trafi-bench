import type { Benchmark, CompetitorTier, FeatureSupport } from "@/types/benchmark"

export function statusLabel(s: Benchmark["status"]) {
  switch (s) {
    case "draft":
      return "Draft"
    case "in-review":
      return "In review"
    case "published":
      return "Published"
    case "archived":
      return "Archived"
  }
}

export function statusVariant(
  s: Benchmark["status"]
): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "published":
      return "default"
    case "in-review":
      return "secondary"
    case "archived":
      return "outline"
    case "draft":
    default:
      return "outline"
  }
}

export function tierLabel(t: CompetitorTier) {
  switch (t) {
    case "leader":
      return "Leader"
    case "challenger":
      return "Challenger"
    case "niche":
      return "Niche"
    case "emerging":
      return "Emerging"
  }
}

export function supportLabel(s: FeatureSupport) {
  switch (s) {
    case "yes":
      return "Supported"
    case "partial":
      return "Partial"
    case "no":
      return "No"
    case "unknown":
      return "—"
  }
}

export function supportColor(s: FeatureSupport) {
  switch (s) {
    case "yes":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    case "partial":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300"
    case "no":
      return "bg-rose-500/15 text-rose-700 dark:text-rose-300"
    case "unknown":
    default:
      return "bg-muted text-muted-foreground"
  }
}
