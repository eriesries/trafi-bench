import { useEffect, useState } from "react"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useBenchmarksStore } from "@/store/benchmarks"
import { tierLabel } from "@/lib/labels"
import { formatError } from "@/lib/errors"
import type { Competitor, CompetitorTier } from "@/types/benchmark"

const tiers: CompetitorTier[] = ["leader", "challenger", "niche", "emerging"]

interface AddCompetitorDialogProps {
  benchmarkId: string
  /** Controls the dialog from outside. When omitted, the dialog renders
   *  its own trigger button (handy for the page header). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** When the trigger is not externally controlled, this is the button. */
  triggerLabel?: string
  triggerVariant?: "default" | "outline" | "ghost" | "secondary"
  triggerSize?: "default" | "sm" | "lg" | "icon"
  /** Called after the competitor is created. */
  onCreated?: (competitor: Competitor) => void
}

export function AddCompetitorDialog({
  benchmarkId,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
  triggerLabel = "Add competitor",
  triggerVariant = "default",
  triggerSize = "default",
  onCreated,
}: AddCompetitorDialogProps) {
  const addCompetitor = useBenchmarksStore((s) => s.addCompetitor)
  const [internalOpen, setInternalOpen] = useState(false)
  const open = externalOpen ?? internalOpen
  const setOpen = (v: boolean) => {
    setInternalOpen(v)
    externalOnOpenChange?.(v)
  }

  const [name, setName] = useState("")
  const [tagline, setTagline] = useState("")
  const [website, setWebsite] = useState("")
  const [tier, setTier] = useState<CompetitorTier>("emerging")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setName("")
      setTagline("")
      setWebsite("")
      setTier("emerging")
      setSubmitting(false)
    }
  }, [open])

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("Enter a name for the competitor")
      return
    }
    setSubmitting(true)
    try {
      const competitor = await addCompetitor(benchmarkId, {
        name: trimmed,
        tagline: tagline.trim() || undefined,
        website: website.trim() || undefined,
        tier,
      })
      toast.success(`Competitor "${competitor.name}" added`)
      setOpen(false)
      onCreated?.(competitor)
    } catch (e) {
      toast.error("Failed to add competitor", { description: formatError(e) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={submitting ? undefined : setOpen}>
      {externalOpen === undefined ? (
        <DialogTrigger asChild>
          <Button variant={triggerVariant} size={triggerSize}>
            <Plus className="size-4" />
            {triggerLabel}
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New competitor</DialogTitle>
          <DialogDescription>
            Fill in the basics — you can detail everything later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-2">
            <Label htmlFor="acd-name">Name *</Label>
            <Input
              id="acd-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Shopify"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !submitting) {
                  e.preventDefault()
                  void handleSubmit()
                }
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="acd-tagline">Tagline</Label>
            <Input
              id="acd-tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Short summary"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="acd-website">Website</Label>
            <Input
              id="acd-website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="grid gap-2">
            <Label>Tier</Label>
            <Select
              value={tier}
              onValueChange={(v) => setTier(v as CompetitorTier)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tiers.map((t) => (
                  <SelectItem key={t} value={t}>
                    {tierLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Add competitor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
