import { Logger } from '@ecadlabs/beacon-core'

const logger = new Logger('MatrixEventEmitter')

// https://gist.github.com/mudge/5830382?permalink_comment_id=2658721#gistcomment-2658721

type Listener<Args extends unknown[]> = (...args: Args) => void | Promise<void>

export class EventEmitter<Events extends { [K in keyof Events]: unknown[] }> {
  private readonly events: { [K in keyof Events]?: Listener<Events[K]>[] } = {}

  public on<K extends Extract<keyof Events, string>>(
    event: K,
    listener: Listener<Events[K]>
  ): () => void {
    const current = this.events[event]
    const listeners = typeof current === 'object' ? current : (this.events[event] = [])
    listeners.push(listener)

    return () => this.removeListener(event, listener)
  }

  public removeListener<K extends Extract<keyof Events, string>>(
    event: K,
    listener?: Listener<Events[K]>
  ): void {
    const listeners: Listener<Events[K]>[] | undefined = this.events[event]
    if (typeof listeners !== 'object') {
      return
    }

    if (!listener) {
      this.events[event] = []

      return
    }

    const idx = listeners.indexOf(listener)
    if (idx > -1) {
      listeners.splice(idx, 1)
    }
  }

  public removeAllListeners(): void {
    for (const event in this.events) {
      if (Object.prototype.hasOwnProperty.call(this.events, event)) {
        const listeners = this.events[event]
        listeners?.splice(0, listeners.length)
      }
    }
  }

  public emit<K extends Extract<keyof Events, string>>(
    event: K,
    ...args: NoInfer<Events[K]>
  ): void {
    const listeners: Listener<Events[K]>[] | undefined = this.events[event]
    if (typeof listeners !== 'object') {
      return
    }

    for (const listener of [...listeners]) {
      try {
        Promise.resolve(listener.apply(this, args)).catch((error) => {
          logger.error('emit', event, error)
        })
      } catch (error) {
        logger.error('emit', event, error)
      }
    }
  }

  public once<K extends Extract<keyof Events, string>>(
    event: K,
    listener: Listener<Events[K]>
  ): () => void {
    const remove = this.on(event, (...args: Events[K]) => {
      remove()

      return listener.apply(this, args)
    })

    return remove
  }
}
