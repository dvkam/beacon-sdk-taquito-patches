import { Logger } from '@ecadlabs/beacon-core'
import { BeaconMessageType, NetworkType, StorageKey } from '@ecadlabs/beacon-types'
import type Client from '@walletconnect/sign-client'
import { SessionTypes } from '@walletconnect/types'
import { WalletConnectCommunicationClient } from '../../src/communication-client/WalletConnectCommunicationClient'

const metadata = { name: 'wallet', description: '', url: 'https://wallet.example', icons: [] }
const restoredSession: SessionTypes.Struct = {
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
const mockRemote = {
  session: { keys: new Array<string>(), get: () => restoredSession },
  ping: jest.fn(async () => {}),
  connect: jest.fn(() => new Promise<Awaited<ReturnType<Client['connect']>>>(() => {})),
  on: jest.fn(),
  core: {
    relayer: {},
    pairing: { events: { on: jest.fn() }, getPairings: () => [{ topic: 'pairing-topic' }] }
  }
}
jest.mock('@walletconnect/sign-client', () => ({ init: async () => mockRemote }))
// Match the SDK reason without loading its ESM-only crypto dependencies in JSDOM.
jest.mock('@walletconnect/utils', () => ({
  getSdkError: () => ({ code: 6000, message: 'User disconnected.' })
}))

class LocalBroadcastChannel {
  onmessage: unknown
  onmessageerror: unknown
  postMessage(_message: unknown): void {}
  close(): void {}
}

describe('WalletConnect connection deadlines', () => {
  const originalChannel = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel')
  beforeAll(() => {
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      value: LocalBroadcastChannel
    })
  })
  afterAll(() => {
    if (originalChannel) {
      Object.defineProperty(globalThis, 'BroadcastChannel', originalChannel)
    } else {
      Reflect.deleteProperty(globalThis, 'BroadcastChannel')
    }
  })
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    localStorage.clear()
    mockRemote.session.keys = []
    restoredSession.expiry = Math.floor(Date.now() / 1000) + 172800
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })
  function client(): WalletConnectCommunicationClient {
    return new WalletConnectCommunicationClient(
      { network: NetworkType.MAINNET, opts: {} },
      async () => true
    )
  }

  it('rejects initial pairing at sixty seconds and preserves the timeout diagnostic', async () => {
    const instance = client()
    const pairing = instance.init()
    let settled = false
    pairing.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
    const rejection = expect(pairing).rejects.toThrow('The connection timed out.')

    await jest.advanceTimersByTimeAsync(59_999)
    expect(mockRemote.connect).toHaveBeenCalledTimes(1)
    expect(settled).toBe(false)
    expect(localStorage.getItem(StorageKey.WC_INIT_ERROR)).toBeNull()

    await jest.advanceTimersByTimeAsync(1)
    await rejection
    expect(localStorage.getItem(StorageKey.WC_INIT_ERROR)).toBe('The connection timed out.')
    expect(instance.currentSession()).toBeUndefined()
  })

  it('continues permissions with the restored session after a replacement connection times out', async () => {
    mockRemote.session.keys = ['restored-topic']
    const instance = client()
    await instance.init()
    const error = jest.spyOn(Logger.prototype, 'error')
    const permissions = instance.requestPermissions({
      id: 'request',
      version: '2',
      senderId: 'dapp',
      type: BeaconMessageType.PermissionRequest,
      appMetadata: { senderId: 'dapp', name: 'test' },
      network: { type: NetworkType.MAINNET },
      scopes: []
    })
    let settled = false
    permissions.then(() => {
      settled = true
    })

    await jest.advanceTimersByTimeAsync(59_999)
    expect(mockRemote.connect).toHaveBeenCalledTimes(1)
    expect(settled).toBe(false)
    expect(error).not.toHaveBeenCalledWith('The connection timed out.')

    await jest.advanceTimersByTimeAsync(1)
    await expect(permissions).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledWith('The connection timed out.')
    expect(instance.currentSession()).toBe(restoredSession)
    await expect(instance.getAccountOrPK()).resolves.toBe('tz1account')
  })
})
