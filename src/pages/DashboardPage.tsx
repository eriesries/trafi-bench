import { Link } from "react-router-dom"
import {
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  Plus,
  TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useBenchmarksStore } from "@/store/benchmarks"
import { statusLabel, statusVariant } from "@/lib/labels"

export function DashboardPage() {
  const benchmarks = useBenchmarksStore((s) => s.benchmarks)

  const totalBenchmarks = benchmarks.length
  const totalCompetitors = benchmarks.reduce(
    (acc, b) => acc + b.competitors.length,
    0
  )
  const published = benchmarks.filter((b) => b.status === "published").length
  const inReview = benchmarks.filter((b) => b.status === "in-review").length

  const stats = [
    {
      label: "Benchmarks",
      value: totalBenchmarks,
      icon: BarChart3,
      hint: "studies created",
    },
    {
      label: "Competitors",
      value: totalCompetitors,
      icon: Building2,
      hint: "documented",
    },
    {
      label: "In review",
      value: inReview,
      icon: Clock,
      hint: "awaiting approval",
    },
    {
      label: "Published",
      value: published,
      icon: CheckCircle2,
      hint: "ready for review",
    },
  ]

  const recent = [...benchmarks]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your benchmark studies.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, hint }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tracking-tight">
                {value}
              </div>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-4" />
              Recent benchmarks
            </CardTitle>
            <CardDescription>
              Latest studies updated by the team.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/benchmarks">
              <Plus className="size-4" />
              View all
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No benchmarks created yet.
            </div>
          ) : (
            <ul className="divide-y">
              {recent.map((b) => (
                <li key={b.id}>
                  <Link
                    to={`/benchmarks/${b.id}`}
                    className="flex items-center justify-between gap-4 py-3 hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate font-medium">{b.title}</div>
                        <Badge variant={statusVariant(b.status)}>
                          {statusLabel(b.status)}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {b.category} ·{" "}
                        {b.competitors.length} competitor
                        {b.competitors.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Updated {new Date(b.updatedAt).toLocaleDateString()}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
