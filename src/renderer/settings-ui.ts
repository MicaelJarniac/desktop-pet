import type { Pet } from './pet'
import type { PetTypeId } from '../shared/state-types'
import { PET_TYPES } from '../shared/pet-types'

interface SettingsRefs {
  overlay: HTMLElement
  openBtn: HTMLElement
  closeBtn: HTMLElement
  nameInput: HTMLInputElement
  decayInput: HTMLInputElement
  decayOutput: HTMLOutputElement
  typeSelect: HTMLSelectElement
  resetBtn: HTMLElement
}

interface SettingsApi {
  cleanup: () => void
  isOpen: () => boolean
}

export function attachSettingsUI(pet: Pet, refs: SettingsRefs): SettingsApi {
  let open = false

  const syncInputs = (): void => {
    refs.nameInput.value = pet.settings.petName
    refs.decayInput.value = String(pet.settings.decayMultiplier)
    refs.decayOutput.value = pet.settings.decayMultiplier.toFixed(1) + '×'
    refs.typeSelect.value = pet.settings.petTypeId
  }

  const openOverlay = (): void => {
    syncInputs()
    refs.overlay.removeAttribute('hidden')
    open = true
  }

  const closeOverlay = (): void => {
    refs.overlay.setAttribute('hidden', '')
    open = false
  }

  const onOpenClick = (): void => openOverlay()
  const onCloseClick = (): void => closeOverlay()

  const onKeyDown = (e: KeyboardEvent): void => {
    if (open && e.key === 'Escape') {
      closeOverlay()
      e.preventDefault()
    }
  }

  const onNameChange = (): void => {
    const trimmed = refs.nameInput.value.trim()
    pet.applySettings({ petName: trimmed.length > 0 ? trimmed : 'Pixel' })
  }

  const onDecayInput = (): void => {
    const parsed = parseFloat(refs.decayInput.value)
    if (!Number.isFinite(parsed)) return
    const clamped = Math.max(0.5, Math.min(2.0, parsed))
    pet.applySettings({ decayMultiplier: clamped })
    refs.decayOutput.value = clamped.toFixed(1) + '×'
  }

  const onTypeChange = (): void => {
    const value = refs.typeSelect.value
    if (isPetTypeId(value)) {
      pet.applySettings({ petTypeId: value })
    }
  }

  const onResetClick = (): void => {
    pet.reset()
    closeOverlay()
  }

  refs.openBtn.addEventListener('click', onOpenClick)
  refs.closeBtn.addEventListener('click', onCloseClick)
  refs.nameInput.addEventListener('change', onNameChange)
  refs.decayInput.addEventListener('input', onDecayInput)
  refs.typeSelect.addEventListener('change', onTypeChange)
  refs.resetBtn.addEventListener('click', onResetClick)
  document.addEventListener('keydown', onKeyDown)

  return {
    cleanup: (): void => {
      refs.openBtn.removeEventListener('click', onOpenClick)
      refs.closeBtn.removeEventListener('click', onCloseClick)
      refs.nameInput.removeEventListener('change', onNameChange)
      refs.decayInput.removeEventListener('input', onDecayInput)
      refs.typeSelect.removeEventListener('change', onTypeChange)
      refs.resetBtn.removeEventListener('click', onResetClick)
      document.removeEventListener('keydown', onKeyDown)
    },
    isOpen: (): boolean => open,
  }
}

function isPetTypeId(value: string): value is PetTypeId {
  return value in PET_TYPES
}
