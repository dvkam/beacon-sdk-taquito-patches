import {
  Client,
  CommunicationClient,
  LocalStorage,
  PeerManager,
  Serializer,
  Transport
} from '@ecadlabs/beacon-core'
import {
  BeaconMessageType,
  Origin,
  P2PPairingRequest,
  StorageKey,
  ConnectionContext
} from '@ecadlabs/beacon-types'
import { WalletClient } from '../src/client/WalletClient'

class MemoryCommunicationClient extends CommunicationClient {
  async unsubscribeFromEncryptedMessages(): Promise<void> {}
  async unsubscribeFromEncryptedMessage(): Promise<void> {}
  async sendMessage(): Promise<void> {}
}
class MemoryTransport extends Transport<
  P2PPairingRequest,
  StorageKey.TRANSPORT_P2P_PEERS_WALLET,
  MemoryCommunicationClient
> {
  constructor(storage: LocalStorage) {
    super(
      'test',
      new MemoryCommunicationClient(),
      new PeerManager(storage, StorageKey.TRANSPORT_P2P_PEERS_WALLET)
    )
  }
  async listen(): Promise<void> {}
  async send(): Promise<void> {}
  async receive(message: string, context: ConnectionContext): Promise<void> {
    await this.notifyListeners(message, context)
  }
}

it('delivers a minimal V3 permission envelope through public WalletClient.connect', async () => {
  localStorage.clear()
  const storage = new LocalStorage('wallet-v3-client')
  const wallet = new WalletClient({ name: 'test wallet', storage })
  const transport = new MemoryTransport(storage)
  // Select the in-memory transport through the public base Client API, without Matrix I/O.
  await Client.prototype.init.call(wallet, transport)
  const delivered = jest.fn()
  await wallet.connect(delivered)
  const message = {
    id: 'request',
    version: '3',
    senderId: 'outer-dapp',
    message: {
      type: BeaconMessageType.PermissionRequest,
      blockchainData: { appMetadata: { name: 'dapp', senderId: 'spoofed' } }
    }
  }
  const context = { id: 'peer', origin: Origin.P2P }

  try {
    await transport.receive(await new Serializer().serialize(message), context)

    expect(delivered).toHaveBeenCalledWith(message, context)
    expect(await wallet.getAppMetadata('outer-dapp')).toEqual({
      name: 'dapp',
      senderId: 'outer-dapp'
    })
  } finally {
    await wallet.destroy()
  }
})
