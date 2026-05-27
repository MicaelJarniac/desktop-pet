type Listener<T = unknown> = (payload: T) => void

export class TypedEmitter<Events extends Record<keyof Events, unknown>> {
  private listeners: Map<keyof Events, Set<Listener>> = new Map()

  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): this {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set<Listener>()
      this.listeners.set(event, set)
    }

    set.add(handler as Listener)
    return this
  }

  off<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): this {
    this.listeners.get(event)?.delete(handler as Listener)
    return this
  }

  once<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): this {
    const wrapper = (payload: Events[K]): void => {
      this.off(event, wrapper)
      handler(payload)
    }

    return this.on(event, wrapper)
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event)
    if (!set) {
      return
    }

    const handlers = Array.from(set)
    for (const handler of handlers) {
      try {
        handler(payload)
      } catch (err) {
        console.error(`[TypedEmitter] handler for "${String(event)}" threw:`, err)
      }
    }
  }

  removeAllListeners<K extends keyof Events>(event?: K): this {
    if (event === undefined) {
      this.listeners.clear()
    } else {
      this.listeners.delete(event)
    }

    return this
  }
}

/*
// Type-check examples (these should compile):
interface TestEvents { a: { x: number }; b: string }
const e = new TypedEmitter<TestEvents>()
e.on('a', (p) => p.x.toFixed(2))
e.emit('a', { x: 1 })
e.emit('b', 'hello')
// The following should NOT compile:
// e.emit('a', { x: 'wrong' })
// e.on('c', () => {})
*/
