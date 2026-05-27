import type { Pet } from './pet'

export function attachKeyboardShortcuts(pet: Pet, getIsSettingsOpen: () => boolean): () => void {
  const handler = (e: KeyboardEvent): void => {
    // Ignore modifier-key combos
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

    // Ignore when typing inside an interactive element
    const active = document.activeElement
    if (active !== null) {
      const tag = active.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    }

    // Ignore when settings overlay is open (defensive — settings inputs already caught above,
    // but the overlay also includes buttons we may want to keep focused on)
    if (getIsSettingsOpen()) return

    const key = e.key.toLowerCase()
    if (key === 'f') {
      pet.feed()
      e.preventDefault()
    } else if (key === 'p') {
      pet.play()
      e.preventDefault()
    } else if (key === 's') {
      pet.sleep()
      e.preventDefault()
    }
  }

  document.addEventListener('keydown', handler)

  return (): void => {
    document.removeEventListener('keydown', handler)
  }
}
