import { CONFIG } from '../shared/config'

export class AnimationQueue {
  private timer: ReturnType<typeof setTimeout> | null = null
  private currentIndex = 0
  private currentFrames: readonly string[] | null = null
  private readonly setSprite: (s: string) => void
  private readonly baseSpriteGetter: () => string

  constructor(setSprite: (s: string) => void, baseSpriteGetter: () => string) {
    this.setSprite = setSprite
    this.baseSpriteGetter = baseSpriteGetter
  }

  play(frames: readonly string[], frameMs: number = CONFIG.ANIMATION.frameMs): void {
    this.cancel()
    if (frames.length === 0) return

    this.currentFrames = frames
    this.currentIndex = 0
    this.scheduleNext(frameMs)
  }

  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }

    this.currentFrames = null
    this.currentIndex = 0
    this.setSprite(this.baseSpriteGetter())
  }

  private scheduleNext(frameMs: number): void {
    if (this.currentFrames === null) return

    if (this.currentIndex >= this.currentFrames.length) {
      this.timer = null
      this.currentFrames = null
      this.currentIndex = 0
      this.setSprite(this.baseSpriteGetter())
      return
    }

    const frame = this.currentFrames[this.currentIndex]
    this.setSprite(frame)
    this.currentIndex += 1
    this.timer = setTimeout(() => {
      this.timer = null
      this.scheduleNext(frameMs)
    }, frameMs)
  }
}
