export type Mood = 'happy' | 'idle' | 'sad' | 'hungry' | 'sleeping' | 'dead'
export type PetTypeId = 'pixel' | 'tama' | 'bot' | 'ghost'

export interface PetState {
  hunger: number // 0..100
  happiness: number // 0..100
  energy: number // 0..100
  alive: boolean
  isSleeping: boolean
}

export interface Settings {
  petName: string
  decayMultiplier: number // 0.5..2
  petTypeId: PetTypeId
}

export interface AppState {
  schemaVersion: 1
  pet: PetState
  settings: Settings
}

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}
