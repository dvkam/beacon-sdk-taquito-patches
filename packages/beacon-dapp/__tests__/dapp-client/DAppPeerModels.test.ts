import { LocalStorage, PeerManager, windowRef } from '@ecadlabs/beacon-core'
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
jest.mock('@walletconnect/sign-client', () => ({ init: jest.fn() }))
// Keep the SDK's reason constant without loading its ESM-only crypto modules in JSDOM.
jest.mock('@walletconnect/utils', () => ({
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
    const known = new ExtendedPostMessagePairingResponse(
      'known',
      'Wallet',
      'known-key',
      '3',
      'known-sender',
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
    const closed = jest.fn()
    await client.subscribeToEvent(BeaconEvent.CHANNEL_CLOSED, closed)
    try {
      await client.init(transport)
      await transport.receive(
        {
          id: 'known-disconnect',
          version: '2',
          senderId: 'known-sender',
          type: BeaconMessageType.Disconnect
        },
        { origin: Origin.EXTENSION, id: 'known-key' }
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
      expect(closed).toHaveBeenCalledTimes(2)
    } finally {
      await client.destroy()
    }
  })
})
