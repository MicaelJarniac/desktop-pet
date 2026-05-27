import type { PetTypeId } from './state-types'

export interface SpriteMap {
  happy: string
  idle: string
  sad: string
  hungry: string
  sleeping: string
  dead: string
}

export interface PetTypeDefinition {
  id: PetTypeId
  displayName: string
  sprites: SpriteMap
  decayProfileMultiplier: number
}

export const PET_TYPES: Readonly<Record<PetTypeId, PetTypeDefinition>> = {
  pixel: {
    id: 'pixel',
    displayName: 'Pixel',
    sprites: {
      happy: '(＾▽＾)',
      idle: '(・ω・)',
      sad: '(╥﹏╥)',
      hungry: '(；⌣̀_⌣́)',
      sleeping: '(－ω－) zzZ',
      dead: '(✖╭╮✖)',
    },
    decayProfileMultiplier: 1.0,
  },
  tama: {
    id: 'tama',
    displayName: 'Tama',
    sprites: {
      happy: "(●'◡'●)",
      idle: '(◕‿◕)',
      sad: '(｡•́︿•̀｡)',
      hungry: '(｡>﹏<｡)',
      sleeping: '(-‿-) Zzz',
      dead: '(×﹏×)',
    },
    decayProfileMultiplier: 1.0,
  },
  bot: {
    id: 'bot',
    displayName: 'Bot',
    sprites: {
      happy: '[◕‿◕]',
      idle: '[⌐■_■]',
      sad: '[×_×]',
      hungry: '[O_O]',
      sleeping: '[-‿-] zZ',
      dead: '[✗_✗]',
    },
    decayProfileMultiplier: 1.0,
  },
  ghost: {
    id: 'ghost',
    displayName: 'Ghost',
    sprites: {
      happy: '👻✨',
      idle: '👻',
      sad: '👻💧',
      hungry: '👻🍽️',
      sleeping: '👻💤',
      dead: '💀',
    },
    decayProfileMultiplier: 1.0,
  },
}

export const PET_TYPE_LIST: readonly PetTypeDefinition[] = Object.values(PET_TYPES)

export function getPetType(id: PetTypeId): PetTypeDefinition {
  return PET_TYPES[id]
}
