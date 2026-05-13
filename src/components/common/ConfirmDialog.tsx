import { useState } from "react"
import { Loader2, AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Extra hint shown below the description (e.g. "12 screens, 47 features"). */
  hint?: string
  confirmLabel?: string
  cancelLabel?: string
  /** When "danger" the confirm button uses destructive styling. */
  variant?: "default" | "danger"
  onConfirm: () => void | Promise<void>
}

/**
 * Generic confirmation dialog. Awaits async `onConfirm` and shows a spinner
 * on the confirm button while it's running.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  hint,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            {variant === "danger" ? (
              <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="size-5" />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <DialogTitle>{title}</DialogTitle>
              {description ? (
                <DialogDescription>{description}</DialogDescription>
              ) : null}
              {hint ? (
                <p className="text-xs text-muted-foreground">{hint}</p>
              ) : null}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={busy}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            variant={variant === "danger" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
