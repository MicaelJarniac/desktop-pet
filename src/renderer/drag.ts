export function makeDraggable(
  target: HTMLElement,
  onMove: (delta: { dx: number; dy: number }) => void,
): () => void {
  let isDragging = false
  let lastX = 0
  let lastY = 0
  let pendingDx = 0
  let pendingDy = 0
  let rafId: number | null = null

  const flush = (): void => {
    rafId = null

    if (pendingDx === 0 && pendingDy === 0) return

    const dx = pendingDx
    const dy = pendingDy
    pendingDx = 0
    pendingDy = 0

    onMove({ dx, dy })
  }

  const onMouseMove = (event: MouseEvent): void => {
    if (!isDragging) return

    pendingDx += event.screenX - lastX
    pendingDy += event.screenY - lastY
    lastX = event.screenX
    lastY = event.screenY

    if (rafId === null) {
      rafId = requestAnimationFrame(flush)
    }
  }

  const onMouseUp = (): void => {
    isDragging = false
    window.removeEventListener('mousemove', onMouseMove)
    document.documentElement.classList.remove('dragging')

    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }

    pendingDx = 0
    pendingDy = 0
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) return
    if (!(event.target instanceof HTMLElement)) return

    const eventTarget = event.target
    if (
      eventTarget.tagName === 'BUTTON' ||
      eventTarget.tagName === 'INPUT' ||
      eventTarget.tagName === 'SELECT' ||
      eventTarget.tagName === 'TEXTAREA'
    ) {
      return
    }
    if (eventTarget.closest('[data-no-drag]') !== null) return

    isDragging = true
    lastX = event.screenX
    lastY = event.screenY
    document.documentElement.classList.add('dragging')

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp, { once: true })
  }

  target.addEventListener('mousedown', onMouseDown)

  return (): void => {
    target.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mousemove', onMouseMove)
    document.documentElement.classList.remove('dragging')

    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }

    isDragging = false
    pendingDx = 0
    pendingDy = 0
  }
}
