import { useCallback, useEffect, useRef, useState } from "react"

export interface CanvasState {
  zoom: number
  panX: number
  panY: number
}

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4
export const ZOOM_STEP = 1.15

interface UseCanvasOptions {
  /** Initial zoom level. */
  initialZoom?: number
  /** Called when the user double-clicks the empty canvas. */
  onDoubleClick?: () => void
}

/**
 * 2D pan/zoom controller for an infinite Figma-like canvas. Encapsulates
 * the math + event wiring so consumers only worry about layout.
 *
 * Usage:
 *   const canvas = useCanvas()
 *   <div ref={canvas.viewportRef} {...canvas.bind}>
 *     <div style={canvas.worldStyle}>...artboards...</div>
 *   </div>
 *
 * The hook itself does NOT manage screens or artboards — it just hands
 * back a transform string and intercepts mouse/wheel events on the
 * viewport. Clicks on child elements still propagate normally; the hook
 * only handles drags that start on the bare viewport background.
 */
export function useCanvas(options: UseCanvasOptions = {}) {
  const { initialZoom = 0.7, onDoubleClick } = options

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    active: boolean
    startX: number
    startY: number
    originPanX: number
    originPanY: number
  }>({
    active: false,
    startX: 0,
    startY: 0,
    originPanX: 0,
    originPanY: 0,
  })

  const [state, setState] = useState<CanvasState>({
    zoom: initialZoom,
    panX: 0,
    panY: 0,
  })

  // -------------------------------------------------------------------
  // Programmatic controls
  // -------------------------------------------------------------------

  const setZoomAtPoint = useCallback(
    (
      nextZoom: number,
      anchorX?: number,
      anchorY?: number
    ) => {
      setState((s) => {
        const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
        const vp = viewportRef.current
        if (!vp || anchorX === undefined || anchorY === undefined) {
          return { ...s, zoom: z }
        }
        const rect = vp.getBoundingClientRect()
        // Cursor position relative to the viewport.
        const cx = anchorX - rect.left
        const cy = anchorY - rect.top
        // World-space coords under the cursor, before zoom change.
        const worldX = (cx - s.panX) / s.zoom
        const worldY = (cy - s.panY) / s.zoom
        // New pan keeps the same world point under the cursor.
        return {
          zoom: z,
          panX: cx - worldX * z,
          panY: cy - worldY * z,
        }
      })
    },
    []
  )

  const zoomIn = useCallback(() => {
    setState((s) => {
      const z = clamp(s.zoom * ZOOM_STEP, MIN_ZOOM, MAX_ZOOM)
      return centerZoom(s, z, viewportRef.current)
    })
  }, [])

  const zoomOut = useCallback(() => {
    setState((s) => {
      const z = clamp(s.zoom / ZOOM_STEP, MIN_ZOOM, MAX_ZOOM)
      return centerZoom(s, z, viewportRef.current)
    })
  }, [])

  const resetView = useCallback(() => {
    setState({ zoom: initialZoom, panX: 0, panY: 0 })
  }, [initialZoom])

  /**
   * Fit the world's bounding box inside the viewport with a small margin.
   * Reads the rendered size of `worldRef`, so call after the world has
   * laid out (e.g. inside a `requestAnimationFrame` from a layout effect).
   */
  const fitToContent = useCallback((paddingPx = 64) => {
    const vp = viewportRef.current
    const world = worldRef.current
    if (!vp || !world) return
    const vpRect = vp.getBoundingClientRect()
    // Strip the current transform to read the un-transformed size.
    const prevTransform = world.style.transform
    world.style.transform = "none"
    const worldRect = world.getBoundingClientRect()
    world.style.transform = prevTransform
    if (worldRect.width === 0 || worldRect.height === 0) return

    const scale = Math.min(
      (vpRect.width - paddingPx * 2) / worldRect.width,
      (vpRect.height - paddingPx * 2) / worldRect.height,
      MAX_ZOOM
    )
    const zoom = clamp(scale, MIN_ZOOM, MAX_ZOOM)
    const panX = (vpRect.width - worldRect.width * zoom) / 2
    const panY = (vpRect.height - worldRect.height * zoom) / 2
    setState({ zoom, panX, panY })
  }, [])

  // -------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      // Pinch-zoom on a trackpad fires wheel with ctrlKey=true. Treat that
      // and a plain wheel both as zoom. Standard scrolling = pan.
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const factor = Math.pow(1.0015, -e.deltaY)
        setZoomAtPoint(stateRef.current.zoom * factor, e.clientX, e.clientY)
      } else {
        e.preventDefault()
        setState((s) => ({
          ...s,
          panX: s.panX - e.deltaX,
          panY: s.panY - e.deltaY,
        }))
      }
    },
    [setZoomAtPoint]
  )

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Pan starts only when the mousedown lands on the bare viewport, on
    // the world background, or on the middle button. Clicks on a child
    // (e.g. a screen thumbnail) bubble up but never become drags.
    const target = e.target as HTMLElement
    const isBackground =
      target === viewportRef.current ||
      target === worldRef.current ||
      target.dataset.canvasBackground === "true"
    if (e.button !== 0 && e.button !== 1) return
    if (!isBackground && e.button !== 1) return

    e.preventDefault()
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      originPanX: stateRef.current.panX,
      originPanY: stateRef.current.panY,
    }
    document.body.style.cursor = "grabbing"
  }, [])

  // Keep a ref to the latest state so handlers above don't get stale.
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Window-level mouse move/up so the drag keeps working even when the
  // cursor leaves the viewport.
  useEffect(() => {
    function handleMove(e: MouseEvent) {
      const d = dragRef.current
      if (!d.active) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      setState((s) => ({
        ...s,
        panX: d.originPanX + dx,
        panY: d.originPanY + dy,
      }))
    }
    function handleUp() {
      if (!dragRef.current.active) return
      dragRef.current.active = false
      document.body.style.cursor = ""
    }
    window.addEventListener("mousemove", handleMove)
    window.addEventListener("mouseup", handleUp)
    return () => {
      window.removeEventListener("mousemove", handleMove)
      window.removeEventListener("mouseup", handleUp)
    }
  }, [])

  // Keyboard shortcuts: +/- to zoom, 0 to reset, 1 to fit.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault()
        zoomIn()
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault()
        zoomOut()
      } else if (e.key === "0") {
        e.preventDefault()
        resetView()
      } else if (e.key === "1") {
        e.preventDefault()
        fitToContent()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [zoomIn, zoomOut, resetView, fitToContent])

  const onDoubleClickInternal = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement
      const isBackground =
        target === viewportRef.current ||
        target === worldRef.current ||
        target.dataset.canvasBackground === "true"
      if (isBackground) onDoubleClick?.()
    },
    [onDoubleClick]
  )

  return {
    viewportRef,
    worldRef,
    state,
    bind: {
      onWheel,
      onMouseDown,
      onDoubleClick: onDoubleClickInternal,
    },
    worldStyle: {
      transform: `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`,
      transformOrigin: "0 0",
    } as React.CSSProperties,
    zoomIn,
    zoomOut,
    resetView,
    fitToContent,
    setZoomAtPoint,
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max)
}

function centerZoom(
  s: CanvasState,
  nextZoom: number,
  vp: HTMLDivElement | null
): CanvasState {
  if (!vp) return { ...s, zoom: nextZoom }
  const rect = vp.getBoundingClientRect()
  const cx = rect.width / 2
  const cy = rect.height / 2
  const worldX = (cx - s.panX) / s.zoom
  const worldY = (cy - s.panY) / s.zoom
  return {
    zoom: nextZoom,
    panX: cx - worldX * nextZoom,
    panY: cy - worldY * nextZoom,
  }
}
