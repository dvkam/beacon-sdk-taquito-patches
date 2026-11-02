import { ClientEvents, Logger } from '@ecadlabs/beacon-core'
import { BeaconMessageType, NetworkType, TransportType } from '@ecadlabs/beacon-types'
import { SessionTypes } from '@walletconnect/types'
import { WalletConnectCommunicationClient } from '../../src/communication-client/WalletConnectCommunicationClient'

const metadata = { name: 'wallet', description: '', url: 'https://wallet.example', icons: [] }
const session: SessionTypes.Struct = {
  topic: 'restored-topic',
  pairingTopic: 'pairing-topic',
  relay: { protocol: 'irn' },
  expiry: 0,
  acknowledged: true,
  controller: 'wallet',
  namespaces: { tezos: { accounts: ['tezos:mainnet:tz1account'], methods: [], events: [] } },
  requiredNamespaces: {},
  optionalNamespaces: {},
  sessionProperties: { pubkey: 'public-key', algo: 'ed25519', address: 'tz1account' },
  self: { publicKey: 'dapp-key', metadata },
  peer: { publicKey: 'wallet-key', metadata }
}
const mockApproval = jest.fn<Promise<SessionTypes.Struct>, []>()
const mockRemote = {
  session: { keys: ['restored-topic'], get: jest.fn(() => session) },
  ping: jest.fn(async () => {}),
  extend: jest.fn(async () => {}),
  connect: jest.fn(async () => ({ uri: 'wc:new-topic@2?symKey=key', approval: mockApproval })),
  on: jest.fn(),
  core: {
    relayer: {},
    pairing: {
      events: { on: jest.fn() },
      ping: jest.fn(async () => {}),
      getPairings: jest.fn(() => [{ topic: 'pairing-topic' }])
    }
  }
}
// Babel does not inline cross-package const enums as the production TypeScript build does.
// Keep the real core implementation and supply only its erased event constants.
jest.mock('@ecadlabs/beacon-core', () => ({
  ...jest.requireActual<typeof import('@ecadlabs/beacon-core')>('@ecadlabs/beacon-core'),
  ClientEvents: {
    CLOSE_ALERT: 'CLOSE_ALERT',
    RESET_STATE: 'RESET_STATE',
    WC_ACK_NOTIFICATION: 'WC_ACK_NOTIFICATION',
    ON_RELAYER_ERROR: 'ON_RELAYER_ERROR'
  }
}))
jest.mock('@walletconnect/sign-client', () => ({ init: async () => mockRemote }))
jest.mock('@walletconnect/utils', () => ({
  getSdkError: () => ({ code: 6000, message: 'User disconnected.' })
}))
class LocalBroadcastChannel {
  onmessage: unknown
  onmessageerror: unknown
  postMessage(_message: unknown): void {}
  close(): void {}
}

describe('WalletConnect pairing failure containment', () => {
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
    session.expiry = Math.floor(Date.now() / 1000) + 172800
    Object.defineProperty(session.namespaces.tezos, 'accounts', {
      configurable: true,
      writable: true,
      value: ['tezos:mainnet:tz1account']
    })
    mockRemote.session.keys = ['restored-topic']
    mockRemote.connect.mockImplementation(async () => ({
      uri: 'wc:new-topic@2?symKey=key',
      approval: mockApproval
    }))
    mockRemote.core.pairing.getPairings.mockImplementation(() => [{ topic: 'pairing-topic' }])
    mockApproval.mockImplementation(() => new Promise<SessionTypes.Struct>(() => {}))
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })
  const client = () =>
    new WalletConnectCommunicationClient(
      { network: NetworkType.MAINNET, opts: {} },
      async () => true
    )
  const permission = {
    id: 'request',
    version: '2',
    senderId: 'dapp',
    type: BeaconMessageType.PermissionRequest,
    appMetadata: { senderId: 'dapp', name: 'DApp' },
    network: { type: NetworkType.MAINNET },
    scopes: []
  } satisfies import('@ecadlabs/beacon-types').PermissionRequest

  it.each([
    { failure: null, close: true },
    { failure: { message: { length: 1 } }, close: true },
    { failure: new Error('Pairing expired'), close: true },
    { failure: 'raw relay error', close: true },
    { failure: new Error('Wallet declined'), close: false }
  ])(
    'keeps the restored session and original event policy for $failure',
    async ({ failure, close }) => {
      const instance = client()
      await instance.init()
      const closeAlert = jest.fn()
      const ack = jest.fn()
      instance.eventHandlers.set(ClientEvents.CLOSE_ALERT, closeAlert)
      instance.eventHandlers.set(ClientEvents.WC_ACK_NOTIFICATION, ack)
      mockRemote.connect.mockRejectedValueOnce(failure)

      await expect(instance.requestPermissions(permission)).resolves.toBeUndefined()

      expect(instance.currentSession()).toBe(session)
      if (close) {
        expect(closeAlert).toHaveBeenCalledWith(TransportType.WALLETCONNECT)
        expect(ack).not.toHaveBeenCalledWith('error')
      } else {
        expect(closeAlert).not.toHaveBeenCalled()
        expect(ack).toHaveBeenCalledWith('error')
      }
    }
  )

  it('closes the initial pairing alert when approval expires', async () => {
    mockRemote.session.keys = []
    mockApproval.mockRejectedValueOnce(new Error('Pairing expired'))
    const instance = client()
    let closeAlert = () => {}
    const closed = new Promise<void>((resolve) => {
      closeAlert = resolve
    })
    instance.eventHandlers.set(ClientEvents.CLOSE_ALERT, closeAlert)

    await expect(instance.init()).resolves.toEqual({
      uri: 'wc:new-topic@2?symKey=key',
      topic: 'new-topic'
    })
    await closed

    expect(instance.currentSession()).toBeUndefined()
    expect(mockApproval).toHaveBeenCalledTimes(1)
  })

  it('contains an opaque failure before opening and logs its original value', async () => {
    const instance = client()
    await instance.init()
    const error = jest.spyOn(Logger.prototype, 'error')
    mockRemote.core.pairing.getPairings.mockImplementationOnce(() => {
      throw null
    })

    await expect(instance.requestPermissions(permission)).resolves.toBeUndefined()

    expect(error).toHaveBeenCalledWith('requestPermissions', null)
    expect(instance.currentSession()).toBe(session)
    expect(mockRemote.connect).not.toHaveBeenCalled()
  })

  it('contains an opaque account validation failure when closing', async () => {
    const instance = client()
    await instance.init()
    const error = jest.spyOn(Logger.prototype, 'error')
    Object.defineProperty(session.namespaces.tezos, 'accounts', {
      configurable: true,
      get: () => {
        throw null
      }
    })

    await expect(instance.closeActiveSession('tz1account')).resolves.toBeUndefined()

    expect(error).toHaveBeenCalledWith('closeActiveSession', null)
    expect(instance.currentSession()).toBe(session)
  })
})
