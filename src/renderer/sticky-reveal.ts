import { CONFIG } from '../shared/config'
import type { Pet } from './pet'

interface StatRowRefs {
  hunger: HTMLElement
  happiness: HTMLElement
  energy: HTMLElement
}

export function attachStickyReveal(pet: Pet, rows: StatRowRefs): () => void {
  const evaluate = (): void => {
    const s = pet.state
    if (!s.alive) {
      rows.hunger.classList.remove('sticky-reveal')
      rows.happiness.classList.remove('sticky-reveal')
      rows.energy.classList.remove('sticky-reveal')
      return
    }
    setClass(rows.hunger, s.hunger < CONFIG.THRESHOLDS.stickyRevealAt)
    setClass(rows.happiness, s.happiness < CONFIG.THRESHOLDS.stickyRevealAt)
    setClass(rows.energy, s.energy < CONFIG.THRESHOLDS.stickyRevealAt)
  }

  // Initial evaluation so saved-state revealed stats appear immediately
  evaluate()

  const handler = (): void => evaluate()
  pet.on('change', handler)

  return (): void => {
    pet.off('change', handler)
  }
}

function setClass(el: HTMLElement, on: boolean): void {
  if (on) {
    el.classList.add('sticky-reveal')
  } else {
    el.classList.remove('sticky-reveal')
  }
}
