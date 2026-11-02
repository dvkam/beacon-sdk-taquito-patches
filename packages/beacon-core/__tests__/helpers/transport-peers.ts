import { CommunicationClient, PeerManager, Serializer, Transport } from '@ecadlabs/beacon-core'
import {
  ConnectionContext,
  PeerInfo,
  PeerInfoType,
  StorageKey,
  TransportType
} from '@ecadlabs/beacon-types'

type PeerKey =
  | StorageKey.TRANSPORT_P2P_PEERS_DAPP
  | StorageKey.TRANSPORT_P2P_PEERS_WALLET
  | StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP
  | StorageKey.TRANSPORT_POSTMESSAGE_PEERS_WALLET
  | StorageKey.TRANSPORT_WALLETCONNECT_PEERS_DAPP

export class RecordingPeerClient extends CommunicationClient {
  public readonly sent: { message: string; peer: PeerInfoType | undefined }[] = []
  public readonly unsubscribed: string[] = []
  public allUnsubscribed = 0

  constructor(private readonly rejectedPeer?: string) {
    super()
  }
  public async sendMessage(message: string, peer?: PeerInfoType): Promise<void> {
    this.sent.push({ message, peer })
    if (peer?.publicKey === this.rejectedPeer) throw new Error('Remote send failed')
  }
  public async unsubscribeFromEncryptedMessage(publicKey: string): Promise<void> {
    this.unsubscribed.push(publicKey)
  }
  public async unsubscribeFromEncryptedMessages(): Promise<void> {
    this.allUnsubscribed++
  }
}

export class PeerTestTransport<T extends PeerInfo, K extends PeerKey> extends Transport<
  T,
  K,
  RecordingPeerClient
> {
  public readonly listened: string[] = []
  constructor(
    client: RecordingPeerClient,
    manager: PeerManager<K>,
    public readonly type: TransportType = TransportType.POST_MESSAGE
  ) {
    super('Peer test', client, manager)
  }
  public async listen(publicKey: string): Promise<void> {
    this.listened.push(publicKey)
  }
  public async receive(message: unknown, context: ConnectionContext): Promise<void> {
    await this.notifyListeners(await new Serializer().serialize(message), context)
  }
}
