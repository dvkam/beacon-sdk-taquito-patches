import {
  Client,
  CommunicationClient,
  LocalStorage,
  Logger,
  PeerManager,
  Transport
} from '@ecadlabs/beacon-core'
import { P2PPairingRequest, StorageKey, TransportStatus } from '@ecadlabs/beacon-types'
import { WalletClient } from '../src/client/WalletClient'

class MemoryCommunicationClient extends CommunicationClient {
  async unsubscribeFromEncryptedMessages(): Promise<void> {}
  async unsubscribeFromEncryptedMessage(): Promise<void> {}
  async sendMessage(): Promise<void> {}
}

class RetryingTransport extends Transport<
  P2PPairingRequest,
  StorageKey.TRANSPORT_P2P_PEERS_WALLET,
  MemoryCommunicationClient
> {
  attempts = 0
  disconnects = 0
  constructor(
    storage: LocalStorage,
    private readonly failure: unknown
  ) {
    super(
      'connection regression',
      new MemoryCommunicationClient(),
      new PeerManager(storage, StorageKey.TRANSPORT_P2P_PEERS_WALLET)
    )
  }
  async listen(): Promise<void> {}
  async send(): Promise<void> {}
  async connect(): Promise<void> {
    this.attempts++
    if (this.attempts === 1) throw this.failure
    await super.connect()
  }
  async disconnect(): Promise<void> {
    this.disconnects++
    await super.disconnect()
  }
}

describe('wallet connection failure recovery', () => {
  it.each([new Error('relay unavailable'), null])(
    'retries after a rejected connection: %p',
    async (failure: unknown) => {
      localStorage.clear()
      const storage = new LocalStorage('wallet-connection-error')
      const wallet = new WalletClient({ name: 'wallet', storage })
      const transport = new RetryingTransport(storage, failure)
      const warning = jest.spyOn(Logger.prototype, 'warn')
      await Client.prototype.init.call(wallet, transport)
      try {
        await wallet._connect()
        expect(transport.attempts).toBe(2)
        expect(transport.disconnects).toBe(1)
        expect(transport.connectionStatus).toBe(TransportStatus.CONNECTED)
        expect(warning).toHaveBeenCalledWith(
          '_connect',
          failure instanceof Error ? failure.message : failure
        )
      } finally {
        warning.mockRestore()
        await wallet.destroy()
      }
    }
  )
})
