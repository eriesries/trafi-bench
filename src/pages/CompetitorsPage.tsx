import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ExternalLink, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useBenchmarksStore } from "@/store/benchmarks"
import { tierLabel } from "@/lib/labels"

export function CompetitorsPage() {
  const benchmarks = useBenchmarksStore((s) => s.benchmarks)
  const [query, setQuery] = useState("")

  const rows = useMemo(() => {
    const all = benchmarks.flatMap((b) =>
      b.competitors.map((c) => ({ benchmark: b, competitor: c }))
    )
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter(
      ({ competitor }) =>
        competitor.name.toLowerCase().includes(q) ||
        (competitor.tagline ?? "").toLowerCase().includes(q)
    )
  }, [benchmarks, query])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Competitors</h1>
        <p className="text-muted-foreground">
          All competitors documented across your benchmarks.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Catalog</CardTitle>
              <CardDescription>
                {rows.length} competitor{rows.length === 1 ? "" : "s"}.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search competitor..."
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Tagline</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="hidden lg:table-cell">Benchmark</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    No competitors registered yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(({ benchmark, competitor }) => (
                  <TableRow key={`${benchmark.id}-${competitor.id}`}>
                    <TableCell className="font-medium">
                      <Link
                        to={`/benchmarks/${benchmark.id}/competitors/${competitor.id}`}
                        className="inline-flex items-center gap-1.5 hover:underline"
                      >
                        {competitor.name}
                        {competitor.website ? (
                          <a
                            href={competitor.website}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {competitor.tagline ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {tierLabel(competitor.tier)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Link
                        to={`/benchmarks/${benchmark.id}`}
                        className="text-sm hover:underline"
                      >
                        {benchmark.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      {typeof competitor.overallScore === "number"
                        ? competitor.overallScore.toFixed(1)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
