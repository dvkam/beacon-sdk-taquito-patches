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
  readonly sent: string[] = []
  sendGate: Promise<void> | undefined
  sendFailure: Error | undefined
  onSend: (() => void) | undefined
  async send(message: string): Promise<void> {
    this.sent.push(message)
    this.onSend?.()
    await this.sendGate
    if (this.sendFailure) throw this.sendFailure
  }
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

it('awaits V3 response transport delivery and propagates its original failure', async () => {
  localStorage.clear()
  const storage = new LocalStorage('wallet-v3-response')
  const wallet = new WalletClient({ name: 'test wallet', storage })
  const transport = new MemoryTransport(storage)
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  try {
    await Client.prototype.init.call(wallet, transport)
    await wallet.connect(() => undefined)
    await transport.receive(
      await new Serializer().serialize({
        id: 'request',
        version: '3',
        senderId: 'dapp',
        message: { type: BeaconMessageType.BlockchainRequest, blockchainData: null }
      }),
      { id: 'peer', origin: Origin.P2P }
    )
    const failure = new Error('transport send failed')
    let sent = () => {}
    const entered = new Promise<void>((resolve) => {
      sent = resolve
    })
    transport.sendGate = gate
    transport.sendFailure = failure
    transport.onSend = sent
    const response = {
      id: 'request',
      type: BeaconMessageType.BlockchainResponse,
      blockchainIdentifier: 'tezos',
      blockchainData: { opaque: true }
    }
    const pending = wallet.respond(response)
    const rejection = expect(pending).rejects.toBe(failure)
    let settled = false
    pending.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
    await entered
    await Promise.resolve()
    const settledBeforeDelivery = settled
    const serialized = transport.sent[transport.sent.length - 1]
    const delivered: unknown = await new Serializer().deserialize(serialized)
    release()

    await rejection
    expect(settledBeforeDelivery).toBe(false)
    expect(delivered).toEqual(response)
  } finally {
    release()
    await wallet.destroy()
  }
})
