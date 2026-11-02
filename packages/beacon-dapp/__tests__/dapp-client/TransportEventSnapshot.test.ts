import { LocalStorage, PeerManager, windowRef } from '@ecadlabs/beacon-core'
import { ExtendedPostMessagePairingResponse, StorageKey, TransportStatus, TransportType } from '@ecadlabs/beacon-types'
import { DAppClient } from '../../src/dapp-client/DAppClient'
import { BeaconEvent } from '../../src/events'
import { PeerTestTransport, RecordingPeerClient } from '../../../beacon-core/__tests__/helpers/transport-peers'

vi.mock('@walletconnect/sign-client', () => ({ init: vi.fn() }))
vi.mock('@walletconnect/utils', () => ({
  getSdkError: () => ({ code: 6000, message: 'User disconnected.' })
}))

class SensitiveClient extends RecordingPeerClient {
  public readonly nested = { secretKey: 'client-secret-must-stay-private' }
}
class SensitiveStorage extends LocalStorage {
  public readonly internal = { seed: 'storage-seed-must-stay-private' }
}

describe('active transport event', () => {
  beforeEach(() => {
    localStorage.clear()
    windowRef.beaconCreatedClientInstance = false
  })
  afterEach(() => {
    localStorage.clear()
    windowRef.beaconCreatedClientInstance = false
  })

  it('emits public connection metadata without transport or storage internals', async () => {
    const storage = new SensitiveStorage('transport-snapshot')
    const transport = new PeerTestTransport<
      ExtendedPostMessagePairingResponse,
      StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP
    >(new SensitiveClient(), new PeerManager(storage, StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP))
    const client = new DAppClient({ name: 'Transport snapshot', storage, disableDefaultEvents: true })
    const observed: unknown[] = []
    await client.subscribeToEvent(BeaconEvent.ACTIVE_TRANSPORT_SET, (value) => {
      observed.push(value)
    })

    try {
      await transport.connect()
      await client.init(transport)

      const snapshots = observed.filter((value) => value !== undefined)
      const snapshot = snapshots[snapshots.length - 1]
      expect(snapshot).toEqual({
        type: TransportType.POST_MESSAGE,
        connectionStatus: TransportStatus.CONNECTED
      })
      await client.disconnect({ notifyPeers: false })
      expect(observed[observed.length - 1]).toBeUndefined()
    } finally {
      await client.destroy()
    }
  })
})
