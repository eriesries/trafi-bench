import { useEffect, useState } from "react"
import { ExternalLink, FileCog, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ENV_HAS_OPENAI_KEY,
  OPENAI_VISION_MODELS,
  useSettingsStore,
  type OpenAIModel,
} from "@/store/settings"
import { toast } from "sonner"

interface Props {
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function SettingsDialog({ trigger, open, onOpenChange }: Props) {
  const storedKey = useSettingsStore((s) => s.openaiApiKey)
  const storedModel = useSettingsStore((s) => s.openaiModel)
  const keyFromEnv = useSettingsStore((s) => s.openaiApiKeyFromEnv)
  const setOpenAIApiKey = useSettingsStore((s) => s.setOpenAIApiKey)
  const setOpenAIModel = useSettingsStore((s) => s.setOpenAIModel)
  const resetToEnv = useSettingsStore((s) => s.resetToEnv)

  const [internalOpen, setInternalOpen] = useState(false)
  const controlled = open !== undefined && onOpenChange !== undefined
  const isOpen = controlled ? open : internalOpen
  const setOpen = controlled ? onOpenChange! : setInternalOpen

  const [key, setKey] = useState(storedKey)
  const [model, setModel] = useState<OpenAIModel>(storedModel)

  useEffect(() => {
    if (isOpen) {
      setKey(storedKey)
      setModel(storedModel)
    }
  }, [isOpen, storedKey, storedModel])

  const handleSave = () => {
    setOpenAIApiKey(key.trim())
    setOpenAIModel(model)
    toast.success("Settings saved")
    setOpen(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            AI Settings
          </DialogTitle>
          <DialogDescription>
            Your API key is stored only in this browser's localStorage. Requests
            go directly from your browser to OpenAI.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="openai-key">OpenAI API key</Label>
              {keyFromEnv ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <FileCog className="size-3" />
                  loaded from .env.local
                </span>
              ) : null}
            </div>
            <Input
              id="openai-key"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-..."
              autoComplete="off"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Manage keys on OpenAI dashboard
                <ExternalLink className="size-3" />
              </a>
              {ENV_HAS_OPENAI_KEY && !keyFromEnv ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => {
                    resetToEnv()
                    toast.success("Using .env.local key")
                    setOpen(false)
                  }}
                >
                  Use .env.local key
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Model</Label>
            <Select
              value={model}
              onValueChange={(v) => setModel(v as OpenAIModel)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPENAI_VISION_MODELS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <code className="font-mono">gpt-4o-mini</code> is the best
              cost/quality balance. Use <code className="font-mono">gpt-4o</code>{" "}
              or <code className="font-mono">gpt-4.1</code> for complex screens.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
