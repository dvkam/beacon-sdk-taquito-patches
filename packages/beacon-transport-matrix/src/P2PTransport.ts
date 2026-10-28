import { Logger, Transport, PeerManager } from '@ecadlabs/beacon-core'
import {
  ConnectionContext,
  ExtendedP2PPairingResponse,
  Storage,
  StorageKey,
  TransportStatus,
  TransportType,
  Origin,
  P2PPairingRequest,
  NodeDistributions
} from '@ecadlabs/beacon-types'
import { KeyPair } from '@ecadlabs/beacon-utils'
import { P2PCommunicationClient } from './communication-client/P2PCommunicationClient'

const logger = new Logger('P2PTransport')

/**
 * @internalapi
 *
 *
 */
export class P2PTransport<
  T extends P2PPairingRequest | ExtendedP2PPairingResponse,
  K extends StorageKey.TRANSPORT_P2P_PEERS_DAPP | StorageKey.TRANSPORT_P2P_PEERS_WALLET
> extends Transport<T, K, P2PCommunicationClient> {
  public readonly type: TransportType = TransportType.P2P

  constructor(
    name: string,
    keyPair: KeyPair,
    storage: Storage,
    matrixNodes: NodeDistributions,
    storageKey: K,
    iconUrl?: string,
    appUrl?: string
  ) {
    super(
      name,
      new P2PCommunicationClient(name, keyPair, 1, storage, matrixNodes, iconUrl, appUrl),
      new PeerManager<K>(storage, storageKey)
    )
  }

  public static async isAvailable(): Promise<boolean> {
    return Promise.resolve(true)
  }

  public async connect(): Promise<void> {
    if (this._isConnected !== TransportStatus.NOT_CONNECTED) {
      return
    }

    logger.log('connect')
    this._isConnected = TransportStatus.CONNECTING

    try {
      await this.client.start()

      const knownPeers = await this.getPeers()

      if (knownPeers.length > 0) {
        logger.log('connect', `connecting to ${knownPeers.length} peers`)
        const registrations = await Promise.allSettled(
          knownPeers.map((peer) => this.listen(peer.publicKey))
        )
        for (const registration of registrations) {
          if (registration.status === 'rejected') {
            throw registration.reason
          }
        }
      }

      await this.startOpenChannelListener()
      await super.connect()
    } catch (error) {
      await this.client.stop().catch((cleanupError) => {
        logger.error('connect', 'failed to stop matrix client', cleanupError)
      })
      this._isConnected = TransportStatus.NOT_CONNECTED
      throw error
    }
  }

  public async disconnect(): Promise<void> {
    await this.client.stop()

    return super.disconnect()
  }

  public async startOpenChannelListener(): Promise<void> {
    //
  }

  public async getPairingRequestInfo(): Promise<P2PPairingRequest> {
    return this.client.getPairingRequestInfo()
  }

  public async listen(publicKey: string): Promise<void> {
    await this.client
      .listenForEncryptedMessage(publicKey, (message) => {
        const connectionContext: ConnectionContext = {
          origin: Origin.P2P,
          id: publicKey
        }

        this.notifyListeners(message, connectionContext).catch((error) => {
          logger.error('listen', error)
        })
      })
      .catch((error) => {
        throw error
      })
  }
}
