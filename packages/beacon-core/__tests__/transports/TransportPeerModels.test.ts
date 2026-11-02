import { LocalStorage, PeerManager } from '../../src'
import { ExtendedPostMessagePairingResponse, StorageKey } from '@ecadlabs/beacon-types'
import { PeerTestTransport, RecordingPeerClient } from '../helpers/transport-peers'

const peer = (key: string) =>
  new ExtendedPostMessagePairingResponse(key, key, key, '3', `sender-${key}`, `extension-${key}`)

describe('Transport peer storage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('persists peers, listens after add and unsubscribes after removal', async () => {
    const storage = new LocalStorage('transport-peers')
    const remote = new RecordingPeerClient()
    const transport = new PeerTestTransport<
      ExtendedPostMessagePairingResponse,
      StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP
    >(remote, new PeerManager(storage, StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP))
    const first = peer('first')
    const second = peer('second')
    await transport.addPeer(first, false)
    await transport.addPeer(second)
    expect(transport.listened).toEqual(['first', 'second'])
    await expect(
      new PeerManager(storage, StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP).getPeers()
    ).resolves.toEqual([first, second])
    await transport.removePeer(first)
    await expect(transport.getPeers()).resolves.toEqual([second])
    expect(remote.unsubscribed).toEqual(['first'])
    await transport.removeAllPeers()
    await expect(transport.getPeers()).resolves.toEqual([])
    expect(remote.allUnsubscribed).toBe(1)
  })

  it('broadcasts to stored peers even when one remote send rejects', async () => {
    const remote = new RecordingPeerClient('failed')
    const transport = new PeerTestTransport<
      ExtendedPostMessagePairingResponse,
      StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP
    >(
      remote,
      new PeerManager(
        new LocalStorage('transport-broadcast'),
        StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP
      )
    )
    for (const key of ['first', 'failed', 'last']) await transport.addPeer(peer(key))
    await expect(transport.send('message')).resolves.toBeUndefined()
    expect(remote.sent.map(({ peer: target }) => target?.publicKey)).toEqual([
      'first',
      'failed',
      'last'
    ])
  })
})
