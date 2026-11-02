import { LocalStorage, PeerManager, Serializer, windowRef } from '@ecadlabs/beacon-core'
import {
  Blockchain,
  BeaconMessageType,
  ExtendedPostMessagePairingResponse,
  Origin,
  PeerInfo,
  PermissionResponseV3,
  ResponseInput,
  StorageKey
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

  async function setup(scopes: unknown = ['transfer'], empty = false) {
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
      blockchainIdentifier: 'chain-test',
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
    const client = new DAppClient({ name: 'V3 DApp', storage, disableDefaultEvents: true })
    client.addBlockchain(chain)
    const success = jest.fn(
      (_event: BeaconEventType[BeaconEvent.PERMISSION_REQUEST_SUCCESS]) => undefined
    )
    await client.subscribeToEvent(BeaconEvent.PERMISSION_REQUEST_SUCCESS, success)
    await client.init(transport)
    jest.spyOn(remote, 'sendMessage').mockImplementation(async (serialized) => {
      const request: unknown = await new Serializer().deserialize(serialized)
      if (
        request === null ||
        typeof request !== 'object' ||
        !('id' in request) ||
        typeof request.id !== 'string'
      )
        throw new Error('Request fixture needs an id')
      await transport.receive(
        { id: request.id, version: '3', senderId: 'wallet', message: response },
        { id: peer.id, origin: Origin.EXTENSION }
      )
    })
    const request = () =>
      client.permissionRequest({
        type: BeaconMessageType.PermissionRequest,
        blockchainIdentifier: 'chain-test',
        blockchainData: { appMetadata: { senderId: 'dapp', name: 'DApp' }, scopes: ['transfer'] }
      })
    return { client, request, response, chainData, accounts, handled, success }
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
})
