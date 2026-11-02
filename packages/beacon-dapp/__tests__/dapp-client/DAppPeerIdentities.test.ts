import { LocalStorage, PeerManager, windowRef } from '@ecadlabs/beacon-core'
import {
  BeaconMessageType,
  ExtendedPostMessagePairingResponse,
  NetworkType,
  Origin,
  PeerInfo,
  PermissionScope,
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

const accountKey = 'edpkuBknW28nW72KG6RoHtYW7p12T6GKc7nAbwYX5m8Ber9eA26hQv'
const address = 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb'

describe('DApp peer identities', () => {
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

  it.each([
    {
      name: 'legacy lowercase key priority',
      keys: { pubkey: accountKey, pubKey: 'unused-key' },
      expected: accountKey
    },
    { name: 'legacy camelcase key', keys: { pubKey: accountKey }, expected: accountKey },
    {
      name: 'modern key priority',
      keys: { publicKey: accountKey, pubkey: { invalid: true } },
      expected: accountKey
    },
    {
      name: 'malformed lowercase key before a usable camelcase key',
      keys: { pubkey: { invalid: true }, pubKey: accountKey },
      expected: accountKey
    },
    {
      name: 'address-only account with malformed legacy keys',
      keys: { pubkey: { invalid: true }, pubKey: 42 },
      expected: undefined
    }
  ])('preserves $name and resolves a relay peer by origin ID', async ({ keys, expected }) => {
    const storage = new LocalStorage('dapp-peer-identities')
    const manager = new PeerManager(storage, StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP)
    const keyPair = await getKeypairFromSeed('identity-wallet')
    const peer = new ExtendedPostMessagePairingResponse(
      'relay-peer',
      'Identity Wallet',
      toHex(keyPair.publicKey),
      '2',
      'stored-sender',
      'extension-id'
    )
    await manager.addPeer(peer)
    const transport = new PeerTestTransport<PeerInfo, StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP>(
      new RecordingPeerClient(),
      manager
    )
    const client = new DAppClient({ name: 'Identity DApp', storage, disableDefaultEvents: true })
    const prepared = jest.fn((_data: BeaconEventType[BeaconEvent.SHOW_PREPARE]) => undefined)
    await client.subscribeToEvent(BeaconEvent.SHOW_PREPARE, prepared)
    try {
      await client.init(transport)
      await transport.receive(
        {
          id: 'change-account',
          version: '2',
          senderId: 'relayed-sender',
          type: BeaconMessageType.ChangeAccountRequest,
          walletType: 'implicit',
          address,
          network: { type: NetworkType.MAINNET },
          scopes: [PermissionScope.SIGN],
          ...keys
        },
        { origin: Origin.EXTENSION, id: peer.id }
      )
      const account = await client.getActiveAccount()
      expect(account?.publicKey).toBe(expected)
      expect(account?.address).toBe(address)
      expect(account?.senderId).toBe('relayed-sender')
      expect(account?.origin).toEqual({ type: Origin.EXTENSION, id: 'relay-peer' })
      await client.showPrepare()
      expect(prepared.mock.calls[0]?.[0]).toEqual({
        walletInfo: expect.objectContaining({ name: 'Identity Wallet' })
      })
    } finally {
      await client.destroy()
    }
  })
})
