import { LocalStorage, PeerManager, Serializer, windowRef } from '@ecadlabs/beacon-core'
import {
  BeaconMessageType,
  ExtendedPostMessagePairingResponse,
  NetworkType,
  Origin,
  PeerInfo,
  PermissionScope,
  StorageKey
} from '@ecadlabs/beacon-types'
import { getKeypairFromSeed, toHex } from '@ecadlabs/beacon-utils'
import { DAppClient } from '../../src/dapp-client/DAppClient'
import { BeaconEvent } from '../../src/events'
import {
  PeerTestTransport,
  RecordingPeerClient
} from '../../../beacon-core/__tests__/helpers/transport-peers'
jest.mock('@walletconnect/sign-client', () => ({ init: jest.fn() }))
jest.mock('@walletconnect/utils', () => ({
  getSdkError: () => ({ code: 6000, message: 'User disconnected.' })
}))
// Babel cannot import erased const-enum members; retain all real core behavior.
jest.mock('@ecadlabs/beacon-core', () => ({
  ...jest.requireActual<typeof import('@ecadlabs/beacon-core')>('@ecadlabs/beacon-core'),
  ClientEvents: {
    CLOSE_ALERT: 'CLOSE_ALERT',
    RESET_STATE: 'RESET_STATE',
    WC_ACK_NOTIFICATION: 'WC_ACK_NOTIFICATION',
    ON_RELAYER_ERROR: 'ON_RELAYER_ERROR'
  }
}))
class LocalBroadcastChannel {
  onmessage: unknown
  onmessageerror: unknown
  postMessage(_message: unknown): void {}
  close(): void {}
}

describe('pending request response contracts', () => {
  const originalChannel = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel')
  const originalMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
  beforeAll(() => {
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      value: LocalBroadcastChannel
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (media: string): MediaQueryList =>
        Object.assign(new EventTarget(), {
          matches: false,
          media,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined
        })
    })
  })
  afterAll(() => {
    if (originalChannel) Object.defineProperty(globalThis, 'BroadcastChannel', originalChannel)
    else Reflect.deleteProperty(globalThis, 'BroadcastChannel')
    if (originalMedia) Object.defineProperty(window, 'matchMedia', originalMedia)
    else Reflect.deleteProperty(window, 'matchMedia')
  })
  beforeEach(() => {
    localStorage.clear()
    windowRef.beaconCreatedClientInstance = false
  })
  afterEach(() => {
    localStorage.clear()
    windowRef.beaconCreatedClientInstance = false
  })

  afterEach(() => jest.useRealTimers())
  async function setup() {
    const storage = new LocalStorage('pending-response')
    const manager = new PeerManager(storage, StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP)
    const key = await getKeypairFromSeed('pending-wallet')
    const peer = new ExtendedPostMessagePairingResponse(
      'peer',
      'Wallet',
      toHex(key.publicKey),
      '2',
      'wallet',
      'extension'
    )
    await manager.addPeer(peer)
    const remote = new RecordingPeerClient()
    const transport = new PeerTestTransport<PeerInfo, StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP>(
      remote,
      manager
    )
    const client = new DAppClient({
      name: 'DApp',
      storage,
      disableDefaultEvents: true,
      requestTimeoutMs: 1000
    })
    const closed = jest.fn()
    await client.subscribeToEvent(BeaconEvent.CHANNEL_CLOSED, closed)
    await client.init(transport)
    let sent = (_id: string) => {}
    const requestSent = new Promise<string>((resolve) => {
      sent = resolve
    })
    jest.spyOn(remote, 'sendMessage').mockImplementation(async (serialized) => {
      const request: unknown = await new Serializer().deserialize(serialized)
      if (
        request === null ||
        typeof request !== 'object' ||
        !('id' in request) ||
        typeof request.id !== 'string'
      )
        throw new Error('Request needs an id')
      sent(request.id)
    })
    const permission = {
      version: '2',
      senderId: 'wallet',
      type: BeaconMessageType.PermissionResponse,
      walletType: 'implicit',
      appMetadata: { senderId: 'wallet', name: 'Wallet' },
      network: { type: NetworkType.MAINNET },
      scopes: [PermissionScope.SIGN],
      publicKey: toHex(key.publicKey),
      address: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb'
    }
    const respond = (id: string, message: object) =>
      transport.receive({ ...message, id }, { id: peer.id, origin: Origin.EXTENSION })
    return {
      client,
      storage,
      closed,
      permission,
      requestSent,
      respond,
      request: () => client.requestPermissions({ scopes: [PermissionScope.SIGN] })
    }
  }

  it.each(['wrong V2 response', 'wrapped V3 with a V2 tag', 'broad-version wrapper with a V2 tag'])(
    'rejects %s and clears its pending timer',
    async (kind) => {
      const context = await setup()
      const metadataBefore = await context.storage.get(StorageKey.APP_METADATA_LIST)
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] })
      try {
        const pending = context.request()
        const rejected = expect(pending).rejects.toThrow('Unexpected response')
        await jest.advanceTimersByTimeAsync(500)
        const id = await context.requestSent
        const message =
          kind === 'wrong V2 response'
            ? {
                version: '2',
                senderId: 'wallet',
                type: BeaconMessageType.OperationResponse,
                transactionHash: 'operation'
              }
            : {
                ...context.permission,
                version: kind === 'wrapped V3 with a V2 tag' ? '3' : '2',
                message: { type: BeaconMessageType.BlockchainResponse }
              }
        await context.respond(id, message)
        await rejected
        await jest.advanceTimersByTimeAsync(1001)
        expect(context.closed).not.toHaveBeenCalled()
        await expect(context.storage.get(StorageKey.APP_METADATA_LIST)).resolves.toEqual(
          metadataBefore
        )
        await expect(context.client.getAccounts()).resolves.toEqual([])
        await expect(context.client.getActiveAccount()).resolves.toBeUndefined()
      } finally {
        jest.useRealTimers()
        await context.client.destroy()
      }
    }
  )

  it('accepts a matching V2 response with an ordinary diagnostic message extra', async () => {
    const context = await setup()
    try {
      const pending = context.request()
      await context.respond(await context.requestSent, {
        ...context.permission,
        message: 'diagnostic'
      })
      await expect(pending).resolves.toEqual(
        expect.objectContaining({ address: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb' })
      )
      await expect(context.storage.get(StorageKey.APP_METADATA_LIST)).resolves.toContainEqual(
        context.permission.appMetadata
      )
    } finally {
      jest.useRealTimers()
      await context.client.destroy()
    }
  })

  it.each([false, true])('preserves timeout/ACK policy: acknowledged=%s', async (acknowledged) => {
    const context = await setup()
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] })
    try {
      const pending = context.request()
      const result = pending.then(
        () => 'resolved',
        () => 'rejected'
      )
      let settled = false
      result.then(() => {
        settled = true
      })
      await jest.advanceTimersByTimeAsync(500)
      const id = await context.requestSent
      if (acknowledged)
        await context.respond(id, {
          version: '2',
          senderId: 'wallet',
          type: BeaconMessageType.Acknowledge
        })
      await jest.advanceTimersByTimeAsync(1001)
      if (acknowledged) {
        expect(settled).toBe(false)
        await context.respond(id, context.permission)
        await expect(result).resolves.toBe('resolved')
        expect(context.closed).not.toHaveBeenCalled()
      } else {
        await expect(result).resolves.toBe('rejected')
        expect(context.closed).toHaveBeenCalledTimes(1)
        await expect(context.client.getAccounts()).resolves.toEqual([])
      }
    } finally {
      jest.useRealTimers()
      await context.client.destroy()
    }
  })
})
