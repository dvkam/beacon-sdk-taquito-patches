import { Client, LocalStorage, PeerManager, windowRef } from '@ecadlabs/beacon-core'
import {
  ExtendedP2PPairingRequest,
  NetworkType,
  P2PPairingRequest,
  PeerInfo,
  PermissionInfo,
  PermissionScope,
  StorageKey,
  TransportType
} from '@ecadlabs/beacon-types'
import { WalletClient } from '../../src/client/WalletClient'
import {
  PeerTestTransport,
  RecordingPeerClient
} from '../../../beacon-core/__tests__/helpers/transport-peers'

const known = new ExtendedP2PPairingRequest(
  'known',
  'DApp',
  'known-key',
  '3',
  'relay.example',
  'known-sender'
)
const missing = new P2PPairingRequest('missing', 'Legacy DApp', 'missing-key', '3', 'relay.example')
const permission = (senderId: string): PermissionInfo => ({
  accountIdentifier: senderId,
  senderId,
  appMetadata: { senderId, name: 'DApp' },
  website: '',
  address: 'tz1address',
  network: { type: NetworkType.MAINNET },
  scopes: [PermissionScope.OPERATION_REQUEST],
  connectedAt: 1
})

async function setup() {
  const storage = new LocalStorage('wallet-peer-models')
  const manager = new PeerManager(storage, StorageKey.TRANSPORT_P2P_PEERS_WALLET)
  await manager.addPeer(known)
  await manager.addPeer(missing)
  await storage.set(StorageKey.PERMISSION_LIST, [
    permission('known-sender'),
    permission('other-sender')
  ])
  const transport = new PeerTestTransport<PeerInfo, StorageKey.TRANSPORT_P2P_PEERS_WALLET>(
    new RecordingPeerClient(),
    manager,
    TransportType.P2P
  )
  const wallet = new WalletClient({ name: 'Peer model wallet', storage })
  await Client.prototype.init.call(wallet, transport)
  return { wallet, storage, transport }
}

describe('Wallet peer sender IDs', () => {
  beforeEach(() => {
    localStorage.clear()
    windowRef.beaconCreatedClientInstance = false
  })
  afterEach(() => {
    localStorage.clear()
    windowRef.beaconCreatedClientInstance = false
  })

  it('removes permissions only for existing stored sender IDs when clearing peers', async () => {
    const { wallet, storage, transport } = await setup()
    try {
      await wallet.removeAllPeers()
      await expect(transport.getPeers()).resolves.toEqual([])
      await expect(storage.get(StorageKey.PERMISSION_LIST)).resolves.toEqual([
        permission('other-sender')
      ])
    } finally {
      await wallet.destroy()
    }
  })
})
