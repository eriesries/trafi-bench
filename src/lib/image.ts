export interface CompressOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  mimeType?: "image/jpeg" | "image/webp"
}

const DEFAULTS: Required<CompressOptions> = {
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.85,
  mimeType: "image/jpeg",
}

export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<string> {
  const opts = { ...DEFAULTS, ...options }
  const bitmap = await createImageBitmap(file)

  const ratio = Math.min(
    1,
    opts.maxWidth / bitmap.width,
    opts.maxHeight / bitmap.height
  )
  const targetWidth = Math.round(bitmap.width * ratio)
  const targetHeight = Math.round(bitmap.height * ratio)

  const canvas = document.createElement("canvas")
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not create canvas context")
  ctx.imageSmoothingQuality = "high"

  if (opts.mimeType === "image/jpeg") {
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, targetWidth, targetHeight)
  }

  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
  bitmap.close?.()

  const dataUrl = canvas.toDataURL(opts.mimeType, opts.quality)
  return dataUrl
}

/**
 * Approximate size of a data URL payload in bytes.
 * Base64 inflates payload by ~4/3.
 */
export function dataUrlByteSize(dataUrl: string): number {
  const idx = dataUrl.indexOf(",")
  if (idx === -1) return dataUrl.length
  const base64 = dataUrl.slice(idx + 1)
  const padding = (base64.match(/=+$/)?.[0].length ?? 0)
  return Math.floor((base64.length * 3) / 4) - padding
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
