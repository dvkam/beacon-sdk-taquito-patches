import { Logger } from '@ecadlabs/beacon-core'

const logger = new Logger('MatrixEventEmitter')

// https://gist.github.com/mudge/5830382?permalink_comment_id=2658721#gistcomment-2658721

// Events carry different argument lists; preserve the existing heterogeneous callback contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void | Promise<void>
interface IEvents {
  [event: string]: Listener[]
}

export class EventEmitter {
  private readonly events: IEvents = {}

  public on(event: string, listener: Listener): () => void {
    if (typeof this.events[event] !== 'object') {
      this.events[event] = []
    }

    this.events[event].push(listener)

    return () => this.removeListener(event, listener)
  }

  public removeListener(event: string, listener?: Listener): void {
    if (typeof this.events[event] !== 'object') {
      return
    }

    if (!listener) {
      this.events[event] = []

      return
    }

    const idx: number = this.events[event].indexOf(listener)
    if (idx > -1) {
      this.events[event].splice(idx, 1)
    }
  }

  public removeAllListeners(): void {
    Object.keys(this.events).forEach((event: string) =>
      this.events[event].splice(0, this.events[event].length)
    )
  }

  public emit(event: string, ...args: any[]): void {
    if (typeof this.events[event] !== 'object') {
      return
    }

    for (const listener of [...this.events[event]]) {
      try {
        Promise.resolve(listener.apply(this, args)).catch((error) => {
          logger.error('emit', event, error)
        })
      } catch (error) {
        logger.error('emit', event, error)
      }
    }
  }

  public once(event: string, listener: Listener): () => void {
    const remove: () => void = this.on(event, (...args: any[]) => {
      remove()

      return listener.apply(this, args)
    })

    return remove
  }
}
