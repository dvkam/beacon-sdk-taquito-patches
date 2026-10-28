import {
  BeaconMessageType,
  ConnectionContext,
  Origin,
  PeerInfo,
  StorageKey
} from '@ecadlabs/beacon-types'
import { Client } from '../../src/clients/client/Client'
import { ClientOptions } from '../../src/clients/client/ClientOptions'
import { PeerManager } from '../../src/managers/PeerManager'
import { windowRef } from '../../src/MockWindow'
import { Serializer } from '../../src/Serializer'
import { LocalStorage } from '../../src/storage/LocalStorage'
import { Transport } from '../../src/transports/Transport'
import { CommunicationClient } from '../../src/transports/clients/CommunicationClient'

class TestCommunicationClient extends CommunicationClient {
  public async unsubscribeFromEncryptedMessages(): Promise<void> {}

  public async unsubscribeFromEncryptedMessage(_publicKey: string): Promise<void> {}

  public async sendMessage(): Promise<void> {}
}

class TestTransport extends Transport<
  PeerInfo,
  StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP,
  TestCommunicationClient
> {
  constructor(storage: LocalStorage) {
    super(
      'test',
      new TestCommunicationClient(),
      new PeerManager(storage, StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP)
    )
  }

  public async listen(_publicKey: string): Promise<void> {}

  public deliver(message: string, context: ConnectionContext): Promise<void> {
    return this.notifyListeners(message, context)
  }
}

class TestClient extends Client {
  constructor(config: ClientOptions, handler: Client['handleResponse']) {
    super(config)
    this.handleResponse = handler
  }

  protected async initSDK(): Promise<void> {}

  public register(transport: TestTransport): Promise<void> {
    return this.addListener(transport)
  }
}

describe('Client transport subscription', () => {
  const context: ConnectionContext = { origin: Origin.EXTENSION, id: 'extension' }
  const message = {
    id: 'request',
    version: '2',
    senderId: 'sender',
    type: BeaconMessageType.Disconnect
  }

  beforeEach(() => {
    ;(windowRef as any).beaconCreatedClientInstance = false
  })

  afterEach(() => {
    jest.restoreAllMocks()
    ;(windowRef as any).beaconCreatedClientInstance = false
  })

  it('propagates asynchronous response failures through deserialization and transport delivery', async () => {
    const storage = new LocalStorage('client-message-test')
    const transport = new TestTransport(storage)
    const failure = new Error('response failed')
    const handler = jest.fn().mockRejectedValue(failure)
    const client = new TestClient({ name: 'test', storage }, handler)
    const deserialize = jest.spyOn(Serializer.prototype, 'deserialize').mockResolvedValue(message)
    await client.register(transport)

    await expect(transport.deliver('serialized-message', context)).rejects.toBe(failure)

    expect(deserialize).toHaveBeenCalledWith('serialized-message')
    expect(handler).toHaveBeenCalledWith(message, context)
  })

  it('retries failed listener registration without caching the failed subscription', async () => {
    const storage = new LocalStorage('client-registration-test')
    const transport = new TestTransport(storage)
    const handler = jest.fn().mockResolvedValue(undefined)
    const client = new TestClient({ name: 'test', storage }, handler)
    const failure = new Error('registration failed')
    const registration = jest.spyOn(transport, 'addListener').mockRejectedValueOnce(failure)
    const removal = jest.spyOn(transport, 'removeListener')
    jest.spyOn(Serializer.prototype, 'deserialize').mockResolvedValue(message)

    await expect(client.register(transport)).rejects.toBe(failure)
    await expect(client.register(transport)).resolves.toBeUndefined()
    await transport.deliver('serialized-message', context)

    expect(registration).toHaveBeenCalledTimes(2)
    expect(removal).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(message, context)
  })
})
