import { Client, LocalStorage, PeerManager } from '../../src'
import {
  ExtendedPostMessagePairingResponse,
  StorageKey,
  TransportType
} from '@ecadlabs/beacon-types'
import { PeerTestTransport, RecordingPeerClient } from '../helpers/transport-peers'

class SelectedClient extends Client {}

class CleanupTransport extends PeerTestTransport<
  ExtendedPostMessagePairingResponse,
  StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP
> {
  public readonly trace: string[] = []
  public cleanupReads = 0

  public get doClientCleanup(): () => Promise<void> {
    this.cleanupReads++
    return this.finishCleanup
  }

  private async finishCleanup(): Promise<void> {
    this.trace.push('cleanup')
  }

  public async disconnect(): Promise<void> {
    this.trace.push('disconnect')
    return super.disconnect()
  }
}

describe('selected client transport cleanup', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('calls WalletConnect cleanup with its original receiver after disconnect', async () => {
    const storage = new LocalStorage('selected-cleanup')
    const transport = new CleanupTransport(
      new RecordingPeerClient(),
      new PeerManager(storage, StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP),
      TransportType.WALLETCONNECT
    )
    const client = new SelectedClient({ name: 'Selected cleanup', storage })
    await client.beaconId
    await client.init(transport)

    await client.destroy()

    expect(transport.trace).toEqual(['disconnect', 'cleanup'])
    expect(transport.cleanupReads).toBe(1)
  })

  it.each([undefined, 42])('rejects a missing or non-callable cleanup hook: %p', async (hook) => {
    const storage = new LocalStorage('selected-invalid-cleanup')
    const transport = new PeerTestTransport<
      ExtendedPostMessagePairingResponse,
      StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP
    >(
      new RecordingPeerClient(),
      new PeerManager(storage, StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP),
      TransportType.WALLETCONNECT
    )
    if (hook !== undefined) {
      Object.defineProperty(transport, 'doClientCleanup', { configurable: true, value: hook })
    }
    const client = new SelectedClient({ name: 'Invalid cleanup', storage })
    await client.beaconId
    await client.init(transport)

    try {
      await expect(client.destroy()).rejects.toBeInstanceOf(TypeError)
    } finally {
      Object.defineProperty(transport, 'doClientCleanup', {
        configurable: true,
        value: async (): Promise<void> => {}
      })
      await client.destroy()
    }
  })
})
