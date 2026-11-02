import { LocalStorage, PeerManager, windowRef, getSenderId } from '@ecadlabs/beacon-core'
import {
  BeaconMessageType,
  ExtendedPostMessagePairingResponse,
  Origin,
  PeerInfo,
  PostMessagePairingRequest,
  StorageKey
} from '@ecadlabs/beacon-types'
import { DAppClient } from '../../src/dapp-client/DAppClient'
import { BeaconEvent } from '../../src/events'
import {
  PeerTestTransport,
  RecordingPeerClient
} from '../../../beacon-core/__tests__/helpers/transport-peers'

// This injected transport does not use the remote WalletConnect SDK.
vi.mock('@walletconnect/sign-client', () => ({ init: vi.fn() }))
// Keep the SDK's reason constant without loading its ESM-only crypto modules in JSDOM.
vi.mock('@walletconnect/utils', () => ({
  getSdkError: () => ({ code: 6000, message: 'User disconnected.' })
}))

describe('DApp custom transport peers', () => {
  beforeEach(() => {
    localStorage.clear()
    windowRef.beaconCreatedClientInstance = false
  })
  afterEach(() => {
    localStorage.clear()
    windowRef.beaconCreatedClientInstance = false
  })

  it('matches stored string sender IDs and ignores peers without one', async () => {
    const storage = new LocalStorage('dapp-peer-models')
    const manager = new PeerManager(storage, StorageKey.TRANSPORT_POSTMESSAGE_PEERS_WALLET)
    const publicKey = '11'.repeat(32)
    const senderId = await getSenderId(publicKey)
    const known = new ExtendedPostMessagePairingResponse(
      'known',
      'Wallet',
      publicKey,
      '3',
      senderId,
      'extension'
    )
    const missing = new PostMessagePairingRequest('missing', 'Legacy', 'missing-key', '3')
    await manager.addPeer(known)
    await manager.addPeer(missing)
    const transport = new PeerTestTransport<
      PeerInfo,
      StorageKey.TRANSPORT_POSTMESSAGE_PEERS_WALLET
    >(new RecordingPeerClient(), manager)
    const client = new DAppClient({ name: 'Peer model DApp', storage, disableDefaultEvents: true })
    const closed = vi.fn()
    await client.subscribeToEvent(BeaconEvent.CHANNEL_CLOSED, closed)
    try {
      await client.init(transport)
      await transport.receive(
        {
          id: 'known-disconnect',
          version: '2',
          senderId: senderId,
          type: BeaconMessageType.Disconnect
        },
        { origin: Origin.EXTENSION, id: 'extension' }
      )
      await expect(transport.getPeers()).resolves.toEqual([missing])
      await transport.receive(
        {
          id: 'missing-disconnect',
          version: '2',
          senderId: 'unmatched-sender',
          type: BeaconMessageType.Disconnect
        },
        { origin: Origin.EXTENSION, id: 'missing-key' }
      )
      await expect(transport.getPeers()).resolves.toEqual([missing])
      expect(closed).toHaveBeenCalledTimes(1)
    } finally {
      await client.destroy()
    }
  })
})
