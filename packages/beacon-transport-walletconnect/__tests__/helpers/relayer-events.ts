import { EventEmitter } from 'events'

/** The remote Relayer's public event API, with real once/off semantics. */
export function createRelayerEvents() {
  const events = new EventEmitter()
  jest.spyOn(events, 'removeAllListeners')
  return {
    events,
    once: (name: string, listener: (...args: unknown[]) => void) => events.once(name, listener),
    off: (name: string, listener: (...args: unknown[]) => void) => events.off(name, listener)
  }
}
