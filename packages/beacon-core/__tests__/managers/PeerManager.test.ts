import { LocalStorage, PeerManager } from '../../src'
import {
  ExtendedP2PPairingResponse,
  ExtendedPostMessagePairingResponse,
  P2PPairingRequest,
  PostMessagePairingRequest,
  StorageKey
} from '@ecadlabs/beacon-types'

type PeerKey =
  | StorageKey.TRANSPORT_P2P_PEERS_DAPP
  | StorageKey.TRANSPORT_P2P_PEERS_WALLET
  | StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP
  | StorageKey.TRANSPORT_POSTMESSAGE_PEERS_WALLET

async function roundTrip<K extends PeerKey>(
  key: K,
  peer: Parameters<PeerManager<K>['addPeer']>[0]
) {
  const storage = new LocalStorage('peer-models')
  await new PeerManager(storage, key).addPeer(peer)
  const reloaded = new PeerManager(new LocalStorage('peer-models'), key)
  const peers = await reloaded.getPeers()
  expect(peers).toEqual([peer])
  await reloaded.removePeer(peer.publicKey)
  await expect(reloaded.getPeers()).resolves.toEqual([])

  return peers
}

describe('peer storage models', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it.each([
    {
      name: 'Matrix dApp response',
      run: async () => {
        const peers = await roundTrip(
          StorageKey.TRANSPORT_P2P_PEERS_DAPP,
          new ExtendedP2PPairingResponse(
            'id',
            'Wallet',
            'public-key',
            '3',
            'relay.example',
            'sender'
          )
        )
        expect(peers[0].senderId).toBe('sender')
      }
    },
    {
      name: 'Matrix wallet request',
      run: async () => {
        await roundTrip(
          StorageKey.TRANSPORT_P2P_PEERS_WALLET,
          new P2PPairingRequest('id', 'DApp', 'public-key', '3', 'relay.example')
        )
      }
    },
    {
      name: 'PostMessage dApp response',
      run: async () => {
        const peers = await roundTrip(
          StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP,
          new ExtendedPostMessagePairingResponse(
            'id',
            'Wallet',
            'public-key',
            '3',
            'sender',
            'extension'
          )
        )
        expect(peers[0].senderId).toBe('sender')
        expect(peers[0].extensionId).toBe('extension')
      }
    },
    {
      name: 'PostMessage wallet request',
      run: async () => {
        await roundTrip(
          StorageKey.TRANSPORT_POSTMESSAGE_PEERS_WALLET,
          new PostMessagePairingRequest('id', 'DApp', 'public-key', '3')
        )
      }
    }
  ])('round-trips a $name through a new manager', async ({ run }) => {
    await run()
  })
})
