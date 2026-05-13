import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { MoreHorizontal, Plus, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useBenchmarksStore } from "@/store/benchmarks"
import { statusLabel, statusVariant } from "@/lib/labels"
import { toast } from "sonner"
import { formatError } from "@/lib/errors"

export function BenchmarksListPage() {
  const navigate = useNavigate()
  const benchmarks = useBenchmarksStore((s) => s.benchmarks)
  const create = useBenchmarksStore((s) => s.createBenchmark)
  const remove = useBenchmarksStore((s) => s.deleteBenchmark)
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return benchmarks
    return benchmarks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q) ||
        b.competitors.some((c) => c.name.toLowerCase().includes(q))
    )
  }, [benchmarks, query])

  const handleCreate = async () => {
    try {
      const bm = await create({
        title: "New benchmark",
        category: "Uncategorized",
        status: "draft",
      })
      toast.success("Benchmark created")
      navigate(`/benchmarks/${bm.id}/edit`)
    } catch (e) {
      toast.error("Failed to create benchmark", {
        description: formatError(e),
      })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await remove(id)
      toast.success("Benchmark deleted")
    } catch (e) {
      toast.error("Failed to delete benchmark", {
        description: formatError(e),
      })
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Benchmarks</h1>
          <p className="text-muted-foreground">
            List, document and edit your comparative studies.
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="size-4" />
          New benchmark
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>All studies</CardTitle>
              <CardDescription>
                {benchmarks.length} stud{benchmarks.length === 1 ? "y" : "ies"} in
                total.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, category, competitor..."
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">
                  Competitors
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  Updated
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    No benchmarks found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((b) => (
                  <TableRow key={b.id} className="cursor-pointer">
                    <TableCell
                      className="font-medium"
                      onClick={() => navigate(`/benchmarks/${b.id}`)}
                    >
                      <Link
                        to={`/benchmarks/${b.id}`}
                        className="hover:underline"
                      >
                        {b.title}
                      </Link>
                      {b.summary ? (
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {b.summary}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell
                      className="hidden md:table-cell"
                      onClick={() => navigate(`/benchmarks/${b.id}`)}
                    >
                      <span className="text-sm">{b.category}</span>
                    </TableCell>
                    <TableCell
                      onClick={() => navigate(`/benchmarks/${b.id}`)}
                    >
                      <Badge variant={statusVariant(b.status)}>
                        {statusLabel(b.status)}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="hidden lg:table-cell"
                      onClick={() => navigate(`/benchmarks/${b.id}`)}
                    >
                      {b.competitors.length}
                    </TableCell>
                    <TableCell
                      className="hidden lg:table-cell text-muted-foreground text-sm"
                      onClick={() => navigate(`/benchmarks/${b.id}`)}
                    >
                      {new Date(b.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => navigate(`/benchmarks/${b.id}`)}
                          >
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              navigate(`/benchmarks/${b.id}/edit`)
                            }
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => handleDelete(b.id)}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
