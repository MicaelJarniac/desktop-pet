import { CONFIG } from '../shared/config'
import { getPetType, PET_TYPES } from '../shared/pet-types'
import type { AppState, Mood, PetState, PetTypeId, Settings } from '../shared/state-types'
import { TypedEmitter } from '../shared/typed-emitter'

interface PetEvents {
  change: { state: PetState; mood: Mood }
  notify: { title: string; body: string; key: string }
  death: { state: PetState }
  speech: { text: string }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function defaultState(): PetState {
  return {
    hunger: CONFIG.INITIAL_STATS.hunger,
    happiness: CONFIG.INITIAL_STATS.happiness,
    energy: CONFIG.INITIAL_STATS.energy,
    xp: 0,
    level: 1,
    alive: true,
    isSleeping: false,
  }
}

function defaultSettings(): Settings {
  return {
    petName: 'Pixel',
    decayMultiplier: 1,
    petTypeId: 'pixel',
  }
}

function cloneSnapshot(snapshot: AppState): AppState {
  if (typeof structuredClone === 'function') {
    return structuredClone(snapshot)
  }

  return {
    schemaVersion: 1,
    pet: { ...snapshot.pet },
    settings: { ...snapshot.settings },
  }
}

export class Pet extends TypedEmitter<PetEvents> {
  private _state: PetState
  private _settings: Settings
  private decayTimer: ReturnType<typeof setInterval> | null = null
  private deathEmitted = false
  private lastNotify = new Map<string, number>()
  private lastSpeech = 0
  private lastHealthReminder = Date.now()

  constructor(initial?: AppState) {
    super()

    this._state = initial ? { ...initial.pet } : defaultState()
    this._settings = initial ? { ...initial.settings } : defaultSettings()
    
    // Migração de estado
    if (this._state.xp === undefined) this._state.xp = 0
    if (this._state.level === undefined) this._state.level = 1
    
    this.deathEmitted = !this._state.alive
  }

  get state(): Readonly<PetState> {
    return this._state
  }

  get settings(): Readonly<Settings> {
    return this._settings
  }

  get accessory(): string {
    if (this._state.level >= 20) return '👑'
    if (this._state.level >= 10) return '😎'
    if (this._state.level >= 5) return '🧢'
    return ''
  }

  get mood(): Mood {
    if (!this._state.alive) return 'dead'
    if (this._state.isSleeping) return 'sleeping'
    if (this._state.hunger < CONFIG.MOOD_THRESHOLDS.hungry) return 'hungry'
    if (this._state.happiness < CONFIG.MOOD_THRESHOLDS.sad) return 'sad'
    if (
      this._state.happiness > CONFIG.MOOD_THRESHOLDS.happyHappiness &&
      this._state.hunger > CONFIG.MOOD_THRESHOLDS.happyHunger
    ) {
      return 'happy'
    }
    return 'idle'
  }

  get sprite(): string {
    return getPetType(this._settings.petTypeId).sprites[this.mood]
  }

  say(text: string): void {
    if (!this._state.alive) return
    this.emit('speech', { text })
    this.lastSpeech = Date.now()
  }

  addXp(amount: number): void {
    if (!this._state.alive) return
    const oldLevel = this._state.level
    this._state.xp += amount
    const nextLevelXp = this._state.level * 100
    if (this._state.xp >= nextLevelXp) {
      this._state.level++
      this._state.xp -= nextLevelXp
      this.say(`LEVEL UP! Nível ${this._state.level}!`)

      // Feedback de acessório
      if (this._state.level === 5) this.say('Ganhei um boné! 🧢')
      if (this._state.level === 10) this.say('Ganhei óculos escuros! 😎')
      if (this._state.level === 20) this.say('Agora sou o rei! 👑')
    }
  }

  feed(): void {
    if (!this._state.alive || this._state.isSleeping) return

    this._state.hunger = clamp(this._state.hunger + CONFIG.ACTION_EFFECTS.feed.hunger, 0, 100)
    this._state.happiness = clamp(
      this._state.happiness + CONFIG.ACTION_EFFECTS.feed.happiness,
      0,
      100,
    )
    this.addXp(30)
    
    const messages = ['Hummm!', 'Delícia!', '😋', 'Obrigado!', 'Nham nham']
    this.say(messages[Math.floor(Math.random() * messages.length)])
    
    this.emitChange()
  }

  play(): void {
    if (!this._state.alive || this._state.isSleeping) return

    this._state.happiness = clamp(
      this._state.happiness + CONFIG.ACTION_EFFECTS.play.happiness,
      0,
      100,
    )
    this._state.energy = clamp(this._state.energy + CONFIG.ACTION_EFFECTS.play.energy, 0, 100)
    this._state.hunger = clamp(this._state.hunger + CONFIG.ACTION_EFFECTS.play.hunger, 0, 100)
    this.addXp(30)

    const messages = ['Eba!', 'Uhul!', '🎾', 'Divertido!', 'Isso!']
    this.say(messages[Math.floor(Math.random() * messages.length)])

    this.emitChange()
  }

  sleep(): void {
    if (!this._state.alive) return

    this._state.isSleeping = !this._state.isSleeping
    if (this._state.isSleeping) {
      this.say('Zzz...')
    } else {
      this.say('Bom dia!')
    }
    this.emitChange()
  }

  reset(): void {
    this._state = defaultState()
    this.deathEmitted = false
    this.lastNotify.clear()
    this.emitChange()
  }

  tick(): void {
    if (!this._state.alive) return

    if (this._state.isSleeping) {
      this._state.energy = clamp(this._state.energy + CONFIG.DECAY_RATES.sleepingEnergyGain, 0, 100)
      this._state.hunger = clamp(this._state.hunger - CONFIG.DECAY_RATES.sleepingHungerLoss, 0, 100)

      if (this._state.energy >= 100) {
        this._state.isSleeping = false
        this.notifyOnce('Good morning!', `${this._settings.petName} woke up refreshed.`, 'wake')
      }
    } else {
      this._state.hunger = clamp(this._state.hunger - CONFIG.DECAY_RATES.hunger, 0, 100)
      this._state.happiness = clamp(this._state.happiness - CONFIG.DECAY_RATES.happiness, 0, 100)
      this._state.energy = clamp(this._state.energy - CONFIG.DECAY_RATES.energy, 0, 100)
      
      const now = Date.now()

      // Health Reminders (a cada 40 minutos)
      if (now - this.lastHealthReminder > 40 * 60 * 1000) {
        const reminders = [
          'Hora de beber água! 💧',
          'Que tal dar uma alongada? 🧘',
          'Descanse os olhos um pouco! 👀',
          'Levante-se um pouco! 🚶'
        ]
        this.say(reminders[Math.floor(Math.random() * reminders.length)])
        this.lastHealthReminder = now
      }

      // Random speech
      if (now - this.lastSpeech > 20000 && Math.random() < 0.3) {
        let pool = ['Tudo bem por aí?', 'O que está fazendo?', '✨', 'lalala']
        if (this._state.hunger < 30) pool = ['Fome...', 'Quero lanche', '🍪?']
        if (this._state.happiness < 30) pool = ['Tédio...', 'Brinca comigo?', '💛?']
        if (this._state.energy < 20) pool = ['Sono...', 'Zzz...', 'Cansado']
        
        this.say(pool[Math.floor(Math.random() * pool.length)])
      }
    }

    if (this._state.hunger <= 0 && this._state.happiness <= 0 && this._state.energy <= 0) {
      this._state.alive = false
      this._state.isSleeping = false

      if (!this.deathEmitted) {
        this.emit('death', { state: { ...this._state } })
        this.deathEmitted = true
        this.notifyOnce(
          'Oh no...',
          `${this._settings.petName} has passed away. Click to try again.`,
          'death',
        )
      }
    }

    if (this._state.alive) {
      if (this._state.hunger < CONFIG.THRESHOLDS.notifyAt) {
        this.notifyOnce("I'm hungry!", `${this._settings.petName} needs food.`, 'hunger-low')
      }

      if (this._state.happiness < CONFIG.THRESHOLDS.notifyAt) {
        this.notifyOnce(
          "I'm lonely...",
          `${this._settings.petName} wants to play.`,
          'happiness-low',
        )
      }
    }

    this.emitChange()
  }

  start(): void {
    if (this.decayTimer === null) {
      this.decayTimer = setInterval(
        () => this.tick(),
        CONFIG.DECAY_INTERVAL_MS / this._settings.decayMultiplier,
      )
    }

    this.emitChange()
  }

  stop(): void {
    if (this.decayTimer !== null) {
      clearInterval(this.decayTimer)
      this.decayTimer = null
    }
  }

  snapshot(): AppState {
    return cloneSnapshot({
      schemaVersion: 1,
      pet: { ...this._state },
      settings: { ...this._settings },
    })
  }

  applySettings(partial: Partial<Settings>): void {
    const previousDecayMultiplier = this._settings.decayMultiplier
    const wasRunning = this.decayTimer !== null

    if (partial.petName !== undefined) {
      const petName = partial.petName.trim()
      this._settings.petName = petName.length > 0 ? petName : 'Pixel'
    }

    if (partial.decayMultiplier !== undefined) {
      this._settings.decayMultiplier = partial.decayMultiplier
    }

    if (partial.petTypeId !== undefined && isPetTypeId(partial.petTypeId)) {
      this._settings.petTypeId = partial.petTypeId
    }

    if (wasRunning && this._settings.decayMultiplier !== previousDecayMultiplier) {
      this.stop()
      this.start()
    }

    this.emitChange()
  }

  private emitChange(): void {
    this.emit('change', { state: { ...this._state }, mood: this.mood })
  }

  private notifyOnce(title: string, body: string, key: string): void {
    const now = Date.now()
    const last = this.lastNotify.get(key) ?? 0
    if (now - last < CONFIG.NOTIFICATION_COOLDOWN_MS) return
    this.lastNotify.set(key, now)
    this.emit('notify', { title, body, key })
  }
}

function isPetTypeId(value: PetTypeId): value is PetTypeId {
  return value in PET_TYPES
}
