import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Pencil, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useBenchmark, useBenchmarksStore } from "@/store/benchmarks"
import { statusLabel, tierLabel } from "@/lib/labels"
import type { Benchmark } from "@/types/benchmark"
import { toast } from "sonner"
import { formatError } from "@/lib/errors"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { AddCompetitorDialog } from "@/components/competitors/AddCompetitorDialog"

const statuses: Benchmark["status"][] = [
  "draft",
  "in-review",
  "published",
  "archived",
]

export function BenchmarkEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const benchmark = useBenchmark(id)
  const update = useBenchmarksStore((s) => s.updateBenchmark)
  const deleteCompetitor = useBenchmarksStore((s) => s.deleteCompetitor)
  const deleteBenchmark = useBenchmarksStore((s) => s.deleteBenchmark)

  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [summary, setSummary] = useState("")
  const [owner, setOwner] = useState("")
  const [status, setStatus] = useState<Benchmark["status"]>("draft")
  const [criteriaText, setCriteriaText] = useState("")
  const [confirmBenchmarkDelete, setConfirmBenchmarkDelete] = useState(false)
  const [pendingCompetitorDelete, setPendingCompetitorDelete] = useState<{
    id: string
    name: string
    screensCount: number
  } | null>(null)

  useEffect(() => {
    if (!benchmark) return
    setTitle(benchmark.title)
    setCategory(benchmark.category)
    setSummary(benchmark.summary ?? "")
    setOwner(benchmark.owner ?? "")
    setStatus(benchmark.status)
    setCriteriaText(benchmark.criteria.join("\n"))
  }, [benchmark])

  if (!benchmark) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Benchmark not found</CardTitle>
            <CardDescription>
              Go back to the list and select a valid study.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/benchmarks">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleSave = async () => {
    try {
      await update(benchmark.id, {
        title: title.trim() || "Untitled",
        category: category.trim() || "Uncategorized",
        summary: summary.trim() || undefined,
        owner: owner.trim() || undefined,
        status,
        criteria: criteriaText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      })
      toast.success("Benchmark saved")
    } catch (e) {
      toast.error("Failed to save", {
        description: formatError(e),
      })
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to={`/benchmarks/${benchmark.id}`}>
            <ArrowLeft className="size-4" />
            Back to view
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave}>
            <Save className="size-4" />
            Save
          </Button>
          <Button
            variant="destructive"
            onClick={() => setConfirmBenchmarkDelete(true)}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Benchmark information</CardTitle>
          <CardDescription>
            Update general info and comparison criteria.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g.: Collaborative Workspaces 2026"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g.: Productivity"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="owner">Owner</Label>
            <Input
              id="owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="e.g.: Product Team"
            />
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as Benchmark["status"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="summary">Summary</Label>
            <Textarea
              id="summary"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Short description of what this study covers"
            />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="criteria">Comparison criteria</Label>
            <Textarea
              id="criteria"
              rows={5}
              value={criteriaText}
              onChange={(e) => setCriteriaText(e.target.value)}
              placeholder={"One criterion per line\ne.g.: Public API\ne.g.: Offline-first"}
            />
            <p className="text-xs text-muted-foreground">
              Each line becomes a column in the comparison matrix.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Competitors</CardTitle>
            <CardDescription>
              {benchmark.competitors.length} competitor
              {benchmark.competitors.length === 1 ? "" : "s"} in this study.
            </CardDescription>
          </div>
          <AddCompetitorDialog benchmarkId={benchmark.id} />
        </CardHeader>
        <CardContent className="p-0">
          {benchmark.competitors.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No competitors in this benchmark yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="hidden md:table-cell">Tagline</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {benchmark.competitors.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{tierLabel(c.tier)}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {c.tagline ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {typeof c.overallScore === "number"
                        ? c.overallScore.toFixed(1)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          aria-label="Edit"
                        >
                          <Link
                            to={`/benchmarks/${benchmark.id}/competitors/${c.id}`}
                          >
                            <Pencil className="size-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete"
                          onClick={() =>
                            setPendingCompetitorDelete({
                              id: c.id,
                              name: c.name,
                              screensCount: c.screens?.length ?? 0,
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmBenchmarkDelete}
        onOpenChange={setConfirmBenchmarkDelete}
        title="Move benchmark to trash?"
        description={`"${benchmark.title}" will be hidden from active views along with its ${benchmark.competitors.length} competitor(s) and their screens. You can restore it from Trash later.`}
        confirmLabel="Move to trash"
        variant="danger"
        onConfirm={async () => {
          try {
            await deleteBenchmark(benchmark.id)
            toast.success("Moved to trash")
            navigate("/benchmarks")
          } catch (e) {
            toast.error("Failed to delete benchmark", {
              description: formatError(e),
            })
          }
        }}
      />

      <ConfirmDialog
        open={!!pendingCompetitorDelete}
        onOpenChange={(open) => {
          if (!open) setPendingCompetitorDelete(null)
        }}
        title="Move competitor to trash?"
        description={
          pendingCompetitorDelete
            ? `"${pendingCompetitorDelete.name}" will be hidden from this benchmark${
                pendingCompetitorDelete.screensCount > 0
                  ? ` along with its ${pendingCompetitorDelete.screensCount} screen(s)`
                  : ""
              }. You can restore it from Trash later.`
            : undefined
        }
        confirmLabel="Move to trash"
        variant="danger"
        onConfirm={async () => {
          if (!pendingCompetitorDelete) return
          try {
            await deleteCompetitor(benchmark.id, pendingCompetitorDelete.id)
            toast.success("Moved to trash")
          } catch (e) {
            toast.error("Failed to delete competitor", {
              description: formatError(e),
            })
          }
        }}
      />
    </div>
  )
}
