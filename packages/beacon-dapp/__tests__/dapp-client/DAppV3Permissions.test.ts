import { LocalStorage, PeerManager, Serializer, windowRef, Logger } from '@ecadlabs/beacon-core'
import {
  Blockchain,
  BeaconMessageType,
  ExtendedPostMessagePairingResponse,
  Origin,
  PeerInfo,
  PermissionResponseV3,
  ResponseInput,
  StorageKey,
  type StorageKeyReturnType
} from '@ecadlabs/beacon-types'
import { getKeypairFromSeed, toHex } from '@ecadlabs/beacon-utils'
import { DAppClient } from '../../src/dapp-client/DAppClient'
import { BeaconEvent, BeaconEventType } from '../../src/events'
import {
  PeerTestTransport,
  RecordingPeerClient
} from '../../../beacon-core/__tests__/helpers/transport-peers'
jest.mock('@walletconnect/sign-client', () => ({ init: jest.fn() }))
jest.mock('@walletconnect/utils', () => ({
  getSdkError: () => ({ code: 6000, message: 'User disconnected.' })
}))
// Babel cannot import erased const-enum members; retain all real core behavior.
jest.mock('@ecadlabs/beacon-core', () => ({
  ...jest.requireActual<typeof import('@ecadlabs/beacon-core')>('@ecadlabs/beacon-core'),
  ClientEvents: {
    CLOSE_ALERT: 'CLOSE_ALERT',
    RESET_STATE: 'RESET_STATE',
    WC_ACK_NOTIFICATION: 'WC_ACK_NOTIFICATION',
    ON_RELAYER_ERROR: 'ON_RELAYER_ERROR'
  }
}))
class LocalBroadcastChannel {
  onmessage: unknown
  onmessageerror: unknown
  postMessage(_message: unknown): void {}
  close(): void {}
}

describe('V3 permission accounts and events', () => {
  const originalChannel = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel')
  const originalMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
  beforeAll(() => {
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      value: LocalBroadcastChannel
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (media: string): MediaQueryList =>
        Object.assign(new EventTarget(), {
          matches: false,
          media,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined
        })
    })
  })
  afterAll(() => {
    if (originalChannel) Object.defineProperty(globalThis, 'BroadcastChannel', originalChannel)
    else Reflect.deleteProperty(globalThis, 'BroadcastChannel')
    if (originalMedia) Object.defineProperty(window, 'matchMedia', originalMedia)
    else Reflect.deleteProperty(window, 'matchMedia')
  })
  beforeEach(() => {
    localStorage.clear()
    windowRef.beaconCreatedClientInstance = false
  })
  afterEach(() => {
    localStorage.clear()
    windowRef.beaconCreatedClientInstance = false
  })

  async function setup(
    scopes: unknown = ['transfer'],
    empty = false,
    responseChain = 'chain-test',
    deferResponse = false
  ) {
    const storage = new LocalStorage('v3-permission')
    const manager = new PeerManager(storage, StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP)
    const key = await getKeypairFromSeed('v3-permission-wallet')
    const peer = new ExtendedPostMessagePairingResponse(
      'peer',
      'Chain Wallet',
      toHex(key.publicKey),
      '3',
      'wallet',
      'extension'
    )
    await manager.addPeer(peer)
    const remote = new RecordingPeerClient()
    const transport = new PeerTestTransport<PeerInfo, StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP>(
      remote,
      manager
    )
    const chainData = {
      appMetadata: { senderId: 'wallet', name: 'Chain Wallet' },
      scopes,
      opaque: { selected: 'chain-account' }
    }
    const response = {
      blockchainIdentifier: responseChain,
      type: BeaconMessageType.PermissionResponse,
      blockchainData: chainData
    }
    const accounts = jest.fn(async (_response: PermissionResponseV3) =>
      empty
        ? []
        : [{ accountId: 'chain-account', address: 'chain-address', publicKey: 'chain-public-key' }]
    )
    const handled = jest.fn(async (_input: ResponseInput) => {})
    const chain: Blockchain = {
      identifier: 'chain-test',
      validateRequest: async () => {},
      handleResponse: handled,
      getWalletLists: async () => ({
        extensionList: [],
        desktopList: [],
        webList: [],
        iOSList: []
      }),
      getAccountInfosFromPermissionResponse: accounts
    }
    const client = new DAppClient({
      name: 'V3 DApp',
      storage,
      disableDefaultEvents: true,
      requestTimeoutMs: 1000
    })
    client.addBlockchain(chain)
    const closed = jest.fn()
    await client.subscribeToEvent(BeaconEvent.CHANNEL_CLOSED, closed)
    const success = jest.fn(
      (_event: BeaconEventType[BeaconEvent.PERMISSION_REQUEST_SUCCESS]) => undefined
    )
    await client.subscribeToEvent(BeaconEvent.PERMISSION_REQUEST_SUCCESS, success)
    await client.init(transport)
    let delivery: (() => Promise<void>) | undefined
    let sent = () => {}
    const requestSent = new Promise<void>((resolve) => {
      sent = resolve
    })
    jest.spyOn(remote, 'sendMessage').mockImplementation(async (serialized) => {
      const request: unknown = await new Serializer().deserialize(serialized)
      if (
        request === null ||
        typeof request !== 'object' ||
        !('id' in request) ||
        typeof request.id !== 'string'
      )
        throw new Error('Request fixture needs an id')
      const requestId = request.id
      const deliver = () =>
        transport.receive(
          { id: requestId, version: '3', senderId: 'wallet', message: response },
          { id: peer.id, origin: Origin.EXTENSION }
        )
      if (deferResponse) {
        delivery = deliver
        sent()
        return
      }
      await deliver()
    })
    const request = () =>
      client.permissionRequest({
        type: BeaconMessageType.PermissionRequest,
        blockchainIdentifier: 'chain-test',
        blockchainData: { appMetadata: { senderId: 'dapp', name: 'DApp' }, scopes: ['transfer'] }
      })
    return {
      client,
      storage,
      closed,
      requestSent,
      deliverResponse: async () => {
        await requestSent
        if (!delivery) throw new Error('No response ready')
        await delivery()
      },
      request,
      response,
      chainData,
      accounts,
      handled,
      success
    }
  }

  it('stores the real chain account and emits the real V3 response without invented V2 fields', async () => {
    const context = await setup()
    try {
      await expect(context.request()).resolves.toEqual(context.response)
      const account = await context.client.getActiveAccount()
      expect(account).toEqual(
        expect.objectContaining({
          accountIdentifier: 'chain-account',
          address: 'chain-address',
          publicKey: 'chain-public-key',
          scopes: ['transfer'],
          chainData: context.chainData
        })
      )
      expect(account).not.toHaveProperty('network')
      expect(account).not.toHaveProperty('walletType')
      await expect(context.client.getAccounts()).resolves.toEqual([account])
      expect(context.handled).toHaveBeenCalledTimes(1)
      expect(context.handled.mock.calls[0]?.[0].account).toEqual(account)
      expect(context.success).toHaveBeenCalledTimes(1)
      expect(context.success.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ protocol: '3', account, output: context.response })
      )
    } finally {
      await context.client.destroy()
    }
  })

  it('rejects non-string chain scopes before account persistence', async () => {
    const context = await setup(['transfer', 7])
    try {
      await expect(context.request()).rejects.toThrow()
      await expect(context.client.getAccounts()).resolves.toEqual([])
      await expect(context.client.getActiveAccount()).resolves.toBeUndefined()
      expect(context.handled).not.toHaveBeenCalled()
      expect(context.success).not.toHaveBeenCalled()
    } finally {
      await context.client.destroy()
    }
  })

  it('reports an empty plugin account result without changing account state', async () => {
    const context = await setup(['transfer'], true)
    try {
      await expect(context.request()).rejects.toThrow('did not return an account')
      await expect(context.client.getAccounts()).resolves.toEqual([])
      await expect(context.client.getActiveAccount()).resolves.toBeUndefined()
      expect(context.handled).not.toHaveBeenCalled()
      expect(context.success).not.toHaveBeenCalled()
    } finally {
      await context.client.destroy()
    }
  })

  it('rejects another chain response before plugin dispatch or account state changes', async () => {
    const context = await setup(['transfer'], false, 'other-chain')
    try {
      await expect(context.request()).rejects.toThrow('Unexpected response')
      expect(context.accounts).not.toHaveBeenCalled()
      expect(context.handled).not.toHaveBeenCalled()
      expect(context.success).not.toHaveBeenCalled()
      await expect(context.client.getAccounts()).resolves.toEqual([])
      await expect(context.client.getActiveAccount()).resolves.toBeUndefined()
    } finally {
      await context.client.destroy()
    }
  })

  it('keeps the validated response correlation across a public storage await', async () => {
    const context = await setup()
    let captured: object | undefined
    let capturedContext: object | undefined
    let capturedOuter: object | undefined
    jest.spyOn(Logger.prototype, 'log').mockImplementation((method, ...args) => {
      if (method === 'handleResponse' && args[0] === 'Received message') {
        const wrapper = args[1]
        if (wrapper !== null && typeof wrapper === 'object') capturedOuter = wrapper
        const info = args[2]
        if (info !== null && typeof info === 'object') capturedContext = info
        if (
          wrapper !== null &&
          typeof wrapper === 'object' &&
          'message' in wrapper &&
          wrapper.message !== null &&
          typeof wrapper.message === 'object'
        )
          captured = wrapper.message
      }
    })
    const write = context.storage.set.bind(context.storage)
    let changed = false
    jest
      .spyOn(context.storage, 'set')
      .mockImplementation(async <K extends StorageKey>(key: K, value: StorageKeyReturnType[K]) => {
        if (key === StorageKey.APP_METADATA_LIST && !changed) {
          changed = true
          if (!captured || !('blockchainIdentifier' in captured) || !('blockchainData' in captured))
            throw new Error('Public logger did not expose response')
          captured.blockchainIdentifier = 'other-chain'
          if (!capturedOuter || !('id' in capturedOuter)) throw new Error('No wrapper id')
          capturedOuter.id = 'other-request'
          if (!capturedContext || !('id' in capturedContext)) throw new Error('No response context')
          capturedContext.id = 'other-peer'
          const data = captured.blockchainData
          if (data === null || typeof data !== 'object' || !('scopes' in data))
            throw new Error('No chain scopes')
          data.scopes = ['injected-after-validation']
        }
        return write<K>(key, value)
      })
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] })
    try {
      const pending = context.request()
      await jest.advanceTimersByTimeAsync(500)
      const response = await pending
      expect(changed).toBe(true)
      expect(response.blockchainIdentifier).toBe('chain-test')
      await jest.advanceTimersByTimeAsync(1001)
      expect(context.closed).not.toHaveBeenCalled()
      expect(context.accounts).toHaveBeenCalledWith(
        expect.objectContaining({ blockchainIdentifier: 'chain-test' })
      )
      await expect(context.client.getActiveAccount()).resolves.toEqual(
        expect.objectContaining({
          scopes: ['transfer'],
          origin: { type: Origin.EXTENSION, id: 'peer' }
        })
      )
    } finally {
      jest.useRealTimers()
      jest.restoreAllMocks()
      await context.client.destroy()
    }
  })

  it('rejects an asynchronous metadata prerequisite failure with its original error and no later timeout', async () => {
    const context = await setup(['transfer'], false, 'chain-test', true)
    const failure = new Error('metadata store unavailable')
    const write = context.storage.set.bind(context.storage)
    jest
      .spyOn(context.storage, 'set')
      .mockImplementation(async <K extends StorageKey>(key: K, value: StorageKeyReturnType[K]) => {
        if (key === StorageKey.APP_METADATA_LIST) throw failure
        return write<K>(key, value)
      })
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] })
    try {
      const result = context.request().then(
        (value) => ({ value }),
        (error: unknown) => ({ error })
      )
      await jest.advanceTimersByTimeAsync(500)
      await expect(context.deliverResponse()).resolves.toBeUndefined()
      const rejected = await result
      if (!('error' in rejected)) throw new Error('Permission request unexpectedly succeeded')
      expect(rejected.error).toBe(failure)
      await jest.advanceTimersByTimeAsync(1001)
      expect(context.closed).not.toHaveBeenCalled()
      await expect(context.client.getAccounts()).resolves.toEqual([])
    } finally {
      jest.useRealTimers()
      jest.restoreAllMocks()
      await context.client.destroy()
    }
  })
})
