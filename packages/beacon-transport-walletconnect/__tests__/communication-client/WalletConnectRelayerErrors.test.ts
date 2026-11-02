import { EventEmitter } from 'events'
import { ClientEvents, Logger } from '@ecadlabs/beacon-core'
import { NetworkType, TransportType } from '@ecadlabs/beacon-types'
import { SessionTypes } from '@walletconnect/types'
import { WalletConnectCommunicationClient } from '../../src/communication-client/WalletConnectCommunicationClient'

const mockInit = jest.fn()
jest.mock('@walletconnect/sign-client', () => ({ init: (...args: unknown[]) => mockInit(...args) }))
// Production TypeScript inlines these const-enum members; Babel's test transform does not.
jest.mock('@ecadlabs/beacon-core', () => ({
  ...jest.requireActual<typeof import('@ecadlabs/beacon-core')>('@ecadlabs/beacon-core'),
  ClientEvents: {
    CLOSE_ALERT: 'CLOSE_ALERT',
    RESET_STATE: 'RESET_STATE',
    WC_ACK_NOTIFICATION: 'WC_ACK_NOTIFICATION',
    ON_RELAYER_ERROR: 'ON_RELAYER_ERROR'
  }
}))
jest.mock('@walletconnect/utils', () => ({
  getSdkError: () => ({ code: 6000, message: 'User disconnected.' })
}))

class LocalBroadcastChannel {
  onmessage: unknown
  onmessageerror: unknown
  postMessage(_message: unknown): void {}
  close(): void {}
}

function remoteClient(topic: string) {
  const metadata = { name: 'Wallet', description: '', url: 'https://wallet.example', icons: [] }
  const session: SessionTypes.Struct = {
    topic,
    pairingTopic: 'pairing-' + topic,
    relay: { protocol: 'irn' },
    expiry: Math.floor(Date.now() / 1000) + 172800,
    acknowledged: true,
    controller: 'wallet',
    namespaces: { tezos: { accounts: ['tezos:mainnet:tz1account'], methods: [], events: [] } },
    requiredNamespaces: {},
    optionalNamespaces: {},
    self: { publicKey: 'dapp-key', metadata },
    peer: { publicKey: 'wallet-key', metadata }
  }
  const events = new EventEmitter()
  const providerEvents = new EventEmitter()
  const relayer = {
    events,
    on: (name: string, listener: (...args: unknown[]) => void) => events.on(name, listener),
    once: (name: string, listener: (...args: unknown[]) => void) => events.once(name, listener),
    off: (name: string, listener: (...args: unknown[]) => void) => events.off(name, listener),
    transportClose: jest.fn(async () => {}),
    provider: { events: providerEvents, connection: { events: new EventEmitter() } },
    subscriber: { events: new EventEmitter() }
  }
  // Replay upstream's real registration semantics at the external SignClient boundary.
  // Replacing a field later cannot replace this already-registered function.
  const fatalProviderHandler = jest.fn((error: unknown) => {
    events.emit('relayer_error', error)
    relayer.transportClose()
  })
  providerEvents.on('error', fatalProviderHandler)
  const clientEvents = new EventEmitter()
  return {
    restored: session,
    fatalProviderHandler,
    session: { keys: [topic], get: () => session, getAll: jest.fn(() => [session]) },
    pairing: { getAll: jest.fn(() => []) },
    ping: jest.fn(async () => {}),
    disconnect: jest.fn(async () => {}),
    on: (name: string, listener: (...args: unknown[]) => void) => clientEvents.on(name, listener),
    removeAllListeners: (name: string) => clientEvents.removeAllListeners(name),
    core: {
      relayer,
      events: new EventEmitter(),
      heartbeat: { stop: jest.fn() },
      pairing: { events: new EventEmitter() }
    }
  }
}

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('WalletConnect fatal relayer errors', () => {
  const originalChannel = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel')
  beforeAll(() =>
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      value: LocalBroadcastChannel
    })
  )
  afterAll(() => {
    if (originalChannel) Object.defineProperty(globalThis, 'BroadcastChannel', originalChannel)
    else Reflect.deleteProperty(globalThis, 'BroadcastChannel')
  })
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    localStorage.clear()
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })
  function sdk() {
    return new WalletConnectCommunicationClient(
      { network: NetworkType.MAINNET, opts: {} },
      async () => true
    )
  }

  it('observes JWT provider errors once while preserving upstream fatal handling', async () => {
    const remote = remoteClient('first')
    mockInit.mockResolvedValueOnce(remote)
    const client = sdk()
    await client.init()
    const notificationFailure = new Error('notification callback failed')
    const notification = jest.fn(async () => {
      throw notificationFailure
    })
    const error = jest.spyOn(Logger.prototype, 'error')
    client.eventHandlers.set(ClientEvents.ON_RELAYER_ERROR, notification)
    const failure = new Error('JWT validation error: expired token')

    remote.core.relayer.provider.events.emit('error', failure)
    remote.core.relayer.provider.events.emit('error', failure)
    await jest.advanceTimersByTimeAsync(0)

    expect(remote.fatalProviderHandler).toHaveBeenCalledTimes(2)
    expect(notification).toHaveBeenCalledTimes(1)
    expect(notification).toHaveBeenCalledWith(TransportType.WALLETCONNECT)
    expect(error).toHaveBeenCalledWith('relayer error notification', 'notification callback failed')
    expect(remote.disconnect).toHaveBeenCalledWith({
      topic: 'first',
      reason: { code: 0, message: 'Force new connection' }
    })
    expect(remote.disconnect).toHaveBeenCalledTimes(1)
    expect(client.currentSession()).toBeUndefined()
    expect(client.signClient).toBeUndefined()
  })
  it('logs an actual cleanup failure and abandons the failed client without a JWT notification', async () => {
    const remote = remoteClient('failed')
    mockInit.mockResolvedValueOnce(remote)
    const client = sdk()
    await client.init()
    const notification = jest.fn()
    const error = jest.spyOn(Logger.prototype, 'error')
    client.eventHandlers.set(ClientEvents.ON_RELAYER_ERROR, notification)
    const failure = new Error('pairing store unavailable')
    remote.pairing.getAll.mockImplementationOnce(() => {
      throw failure
    })

    remote.core.relayer.provider.events.emit('error', { message: 7 })
    await jest.advanceTimersByTimeAsync(0)

    expect(notification).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('relayer error cleanup', failure)
    expect(client.currentSession()).toBeUndefined()
    expect(client.signClient).toBeUndefined()
  })

  it('keeps a replacement session and listener when an old public close finishes late', async () => {
    const first = remoteClient('old')
    const replacement = remoteClient('replacement')
    mockInit.mockResolvedValueOnce(first)
    const client = sdk()
    await client.init()
    const notification = jest.fn()
    client.eventHandlers.set(ClientEvents.ON_RELAYER_ERROR, notification)
    const entered = deferred()
    const released = deferred()
    first.disconnect.mockImplementationOnce(async () => {
      entered.resolve()
      await released.promise
    })
    const closing = client.close()
    try {
      await entered.promise
      await client.closeSignClient()
      mockInit.mockResolvedValueOnce(replacement)
      await client.init()
      expect(client.currentSession()).toBe(replacement.restored)

      released.resolve()
      await closing

      expect(client.currentSession()).toBe(replacement.restored)
      expect(client.signClient).toBe(replacement)
      expect(replacement.disconnect).not.toHaveBeenCalled()
      expect(replacement.core.relayer.events.listenerCount('relayer_error')).toBe(1)
      first.core.relayer.events.emit('relayer_error', new Error('JWT validation error: old'))
      await jest.advanceTimersByTimeAsync(0)
      expect(notification).not.toHaveBeenCalled()
      expect(client.currentSession()).toBe(replacement.restored)

      replacement.core.relayer.provider.events.emit('error', new Error('JWT validation error: new'))
      await jest.advanceTimersByTimeAsync(0)
      expect(notification).toHaveBeenCalledTimes(1)
      expect(client.currentSession()).toBeUndefined()
    } finally {
      released.resolve()
      await closing
    }
  })
})
