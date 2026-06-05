import { CONFIG } from '../shared/config'
import type { AppState, Mood, PetState, WindowBounds } from '../shared/state-types'
import { AnimationQueue } from './animation-queue'
import { makeDraggable } from './drag'
import { attachKeyboardShortcuts } from './keyboard'
import { Pet } from './pet'
import { attachSettingsUI } from './settings-ui'
import { attachStickyReveal } from './sticky-reveal'

interface DomRefs {
  container: HTMLElement
  hoverZone: HTMLElement
  spriteEl: HTMLElement
  nameEl: HTMLElement
  hungerBar: HTMLElement
  happinessBar: HTMLElement
  energyBar: HTMLElement
  hungerRow: HTMLElement
  happinessRow: HTMLElement
  energyRow: HTMLElement
  btnFeed: HTMLElement
  btnPlay: HTMLElement
  btnSleep: HTMLElement
  btnSettings: HTMLElement
  statusMsg: HTMLElement
  speechBubble: HTMLElement
  overlay: HTMLElement
  closeBtn: HTMLElement
  nameInput: HTMLInputElement
  decayInput: HTMLInputElement
  decayOutput: HTMLOutputElement
  typeSelect: HTMLSelectElement
  resetBtn: HTMLElement
}

function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (el === null) throw new Error(`Missing required DOM element: #${id}`)
  return el as T
}

function requireRowByDataStat(stat: 'hunger' | 'happiness' | 'energy'): HTMLElement {
  const el = document.querySelector<HTMLElement>(`.stat[data-stat="${stat}"]`)
  if (el === null) throw new Error(`Missing .stat[data-stat="${stat}"]`)
  return el
}

function resolveDomRefs(): DomRefs {
  return {
    container: requireEl('pet-container'),
    hoverZone: requireEl('hover-zone'),
    spriteEl: requireEl('sprite'),
    nameEl: requireEl('name'),
    hungerBar: requireEl('hunger-bar'),
    happinessBar: requireEl('happiness-bar'),
    energyBar: requireEl('energy-bar'),
    hungerRow: requireRowByDataStat('hunger'),
    happinessRow: requireRowByDataStat('happiness'),
    energyRow: requireRowByDataStat('energy'),
    btnFeed: requireEl('btn-feed'),
    btnPlay: requireEl('btn-play'),
    btnSleep: requireEl('btn-sleep'),
    btnSettings: requireEl('btn-settings'),
    statusMsg: requireEl('status-message'),
    speechBubble: requireEl('speech-bubble'),
    overlay: requireEl('settings-overlay'),
    closeBtn: requireEl('settings-close'),
    nameInput: requireEl<HTMLInputElement>('setting-name'),
    decayInput: requireEl<HTMLInputElement>('setting-decay'),
    decayOutput: requireEl<HTMLOutputElement>('setting-decay-out'),
    typeSelect: requireEl<HTMLSelectElement>('setting-type'),
    resetBtn: requireEl('setting-reset'),
  }
}

function setBar(bar: HTMLElement, value: number): void {
  bar.style.width = `${Math.max(0, Math.min(100, value))}%`
  bar.classList.remove('warning', 'danger')
  if (value < CONFIG.THRESHOLDS.critical) {
    bar.classList.add('danger')
  } else if (value < 45) {
    bar.classList.add('warning')
  }
}

function statusForMood(mood: Mood): string {
  if (mood === 'dead') return 'Click to try again...'
  if (mood === 'sleeping') return 'Sleeping...'
  if (mood === 'hungry') return 'So hungry...'
  if (mood === 'sad') return 'Play with me!'
  return ''
}

function updateUI(state: PetState, mood: Mood, refs: DomRefs, pet: Pet): void {
  refs.spriteEl.textContent = pet.sprite
  refs.spriteEl.classList.toggle('sleeping', state.isSleeping && state.alive)
  refs.spriteEl.classList.toggle('dead', !state.alive)
  refs.nameEl.textContent = `${pet.settings.petName} (Nv. ${state.level})`
  setBar(refs.hungerBar, state.hunger)
  setBar(refs.happinessBar, state.happiness)
  setBar(refs.energyBar, state.energy)
  refs.statusMsg.textContent = statusForMood(mood)
}

function makeDebouncedSaver(
  saveFn: (state: AppState) => Promise<void>,
  ms = 500,
): (state: AppState) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (state: AppState): void => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void saveFn(state).catch((err: unknown) => {
        console.error('[renderer] state save failed:', err)
      })
    }, ms)
  }
}

interface Layout {
  idleWidth: number
  idleHeight: number
  hzOffsetX: number
  hzOffsetY: number
}

interface Anchor {
  x: number
  y: number
}

async function waitForRenderSettle(): Promise<void> {
  if (document.fonts.status !== 'loaded') {
    await document.fonts.ready
  }
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  await new Promise<void>((r) => setTimeout(() => r(), 50))
}

function readLayoutFromExpandedRender(hoverZone: HTMLElement): Layout {
  const rect = hoverZone.getBoundingClientRect()
  return {
    hzOffsetX: rect.x,
    hzOffsetY: rect.y,
    idleWidth: Math.ceil(rect.width),
    idleHeight: Math.ceil(rect.height),
  }
}

function expandedBoundsAt(layout: Layout, anchor: Anchor): WindowBounds {
  return {
    x: anchor.x - layout.hzOffsetX - layout.idleWidth / 2,
    y: anchor.y - layout.hzOffsetY - layout.idleHeight / 2,
    width: CONFIG.WINDOW.width,
    height: CONFIG.WINDOW.height,
  }
}

function idleBoundsAt(layout: Layout, anchor: Anchor): WindowBounds {
  return {
    x: anchor.x - layout.idleWidth / 2,
    y: anchor.y - layout.idleHeight / 2,
    width: layout.idleWidth,
    height: layout.idleHeight,
  }
}

function setBoundsAndWait(bounds: WindowBounds): Promise<void> {
  return new Promise<void>((resolve) => {
    const off = window.electronAPI.onResized(() => {
      off()
      resolve()
    })
    window.electronAPI.setBounds(bounds)
  })
}

async function bootstrap(): Promise<void> {
  const loaded = await window.electronAPI.loadState()
  const pet = new Pet(loaded ?? undefined)
  const refs = resolveDomRefs()

  const animations = new AnimationQueue(
    (sprite) => {
      refs.spriteEl.textContent = sprite
    },
    () => pet.sprite,
  )

  const debouncedSave = makeDebouncedSaver(window.electronAPI.saveState)

  pet.on('change', ({ state, mood }) => {
    updateUI(state, mood, refs, pet)
    debouncedSave(pet.snapshot())
  })
  pet.on('notify', ({ title, body }) => {
    window.electronAPI.notify(title, body)
  })
  pet.on('death', () => {
    refs.statusMsg.textContent = 'Click to try again...'
  })

  let speechTimer: ReturnType<typeof setTimeout> | null = null
  pet.on('speech', ({ text }) => {
    refs.speechBubble.textContent = text
    refs.speechBubble.classList.add('visible')
    if (speechTimer !== null) clearTimeout(speechTimer)
    speechTimer = setTimeout(() => {
      refs.speechBubble.classList.remove('visible')
      speechTimer = null
    }, 3000)
  })

  refs.btnFeed.addEventListener('click', () => {
    if (!pet.state.alive) {
      pet.reset()
      return
    }
    pet.feed()
    animations.play(CONFIG.ANIMATION.feedFrames)
  })
  refs.spriteEl.addEventListener('click', () => {
    if (!pet.state.alive || pet.state.isSleeping) return;
    pet.play();
    animations.play(CONFIG.ANIMATION.petFrames);
  });

  refs.btnPlay.addEventListener('click', () => {
    if (!pet.state.alive) {
      pet.reset()
      return
    }
    pet.play()
    animations.play(CONFIG.ANIMATION.playFrames)
  })
  refs.btnSleep.addEventListener('click', () => {
    if (!pet.state.alive) {
      pet.reset()
      return
    }
    const wasSleeping = pet.state.isSleeping
    pet.sleep()
    if (!wasSleeping) {
      animations.play(CONFIG.ANIMATION.sleepFrames)
    }
  })

  const offTray = window.electronAPI.onTrayAction((action) => {
    if (action === 'feed') refs.btnFeed.click()
    else if (action === 'play') refs.btnPlay.click()
    else if (action === 'sleep') refs.btnSleep.click()
    else if (action === 'stats') {
      const { hunger, happiness, energy } = pet.state
      refs.statusMsg.textContent = `🍖${hunger} 💛${happiness} ⚡${energy}`
      setTimeout(() => {
        refs.statusMsg.textContent = statusForMood(pet.mood)
      }, 1500)
    }
  })

  const anchor: Anchor = { x: 0, y: 0 }

  const offDrag = makeDraggable(refs.container, ({ dx, dy }) => {
    window.electronAPI.moveWindow({ dx, dy })
    anchor.x += dx
    anchor.y += dy
  })

  const settings = attachSettingsUI(pet, {
    overlay: refs.overlay,
    openBtn: refs.btnSettings,
    closeBtn: refs.closeBtn,
    nameInput: refs.nameInput,
    decayInput: refs.decayInput,
    decayOutput: refs.decayOutput,
    typeSelect: refs.typeSelect,
    resetBtn: refs.resetBtn,
  })

  const offKeys = attachKeyboardShortcuts(pet, () => settings.isOpen())
  const offSticky = attachStickyReveal(pet, {
    hunger: refs.hungerRow,
    happiness: refs.happinessRow,
    energy: refs.energyRow,
  })

  updateUI(pet.state, pet.mood, refs, pet)

  refs.container.classList.add('is-hovered')
  await waitForRenderSettle()
  let layout = readLayoutFromExpandedRender(refs.hoverZone)
  anchor.x = window.screenX + layout.hzOffsetX + layout.idleWidth / 2
  anchor.y = window.screenY + layout.hzOffsetY + layout.idleHeight / 2

  let isExpanded = true
  let inFlight = false

  const expand = async (): Promise<void> => {
    if (isExpanded || inFlight) return
    inFlight = true
    isExpanded = true
    try {
      await setBoundsAndWait(expandedBoundsAt(layout, anchor))
      refs.container.classList.add('is-hovered')
    } finally {
      inFlight = false
    }
  }

  const shrink = async (): Promise<void> => {
    if (!isExpanded || inFlight) return
    inFlight = true
    isExpanded = false
    try {
      layout = readLayoutFromExpandedRender(refs.hoverZone)
      anchor.x = window.screenX + layout.hzOffsetX + layout.idleWidth / 2
      anchor.y = window.screenY + layout.hzOffsetY + layout.idleHeight / 2
      refs.container.classList.remove('is-hovered')
      await setBoundsAndWait(idleBoundsAt(layout, anchor))
    } finally {
      inFlight = false
    }
  }

  const onHoverEnter = (): void => {
    if (document.documentElement.classList.contains('dragging')) return
    void expand()
  }
  const onHoverLeave = (): void => {
    if (document.documentElement.classList.contains('dragging')) return
    if (settings.isOpen()) return
    void shrink()
  }
  refs.hoverZone.addEventListener('mouseenter', onHoverEnter)
  refs.container.addEventListener('mouseleave', onHoverLeave)

  void shrink()

  pet.start()

  window.electronAPI.onSystemIdle(() => {
    if (!pet.state.isSleeping && pet.state.alive) {
      pet.sleep();
      animations.play(CONFIG.ANIMATION.sleepFrames);
    }
  });

  window.electronAPI.onSystemActive(() => {
    if (pet.state.isSleeping && pet.state.alive) {
      pet.sleep(); 
    }
  });

  window.addEventListener('beforeunload', () => {
    offTray()
    offDrag()
    offKeys()
    offSticky()
    settings.cleanup()
    refs.hoverZone.removeEventListener('mouseenter', onHoverEnter)
    refs.container.removeEventListener('mouseleave', onHoverLeave)
    pet.stop()
  })
  ;(window as unknown as { __pet?: Pet }).__pet = pet
}

void bootstrap()
