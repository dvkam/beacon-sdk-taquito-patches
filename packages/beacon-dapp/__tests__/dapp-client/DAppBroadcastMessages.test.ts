import { BroadcastChannel, enforceOptions } from 'broadcast-channel'
import { LocalStorage, PeerManager, Serializer, windowRef, Logger } from '@ecadlabs/beacon-core'
import {
  BeaconMessageType,
  BeaconErrorType,
  ExtendedPostMessagePairingResponse,
  NetworkType,
  Origin,
  PeerInfo,
  PermissionScope,
  StorageKey
} from '@ecadlabs/beacon-types'
import { getKeypairFromSeed, toHex } from '@ecadlabs/beacon-utils'
import { DAppClient } from '../../src/dapp-client/DAppClient'
import { DappWalletConnectTransport } from '../../src/transports/DappWalletConnectTransport'
import {
  PeerTestTransport,
  RecordingPeerClient
} from '../../../beacon-core/__tests__/helpers/transport-peers'
jest.mock('@walletconnect/sign-client', () => ({ init: jest.fn() }))
jest.mock('@walletconnect/utils', () => ({
  getSdkError: () => ({ code: 6000, message: 'User disconnected.' })
}))
// Babel does not inline the production const enum; keep all real core behavior.
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

it('contains malformed cross-tab traffic and accepts a legacy permission response through the registered channel', async () => {
  const originalChannel = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel')
  const originalMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
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
  enforceOptions({ type: 'simulate' })
  localStorage.clear()
  windowRef.beaconCreatedClientInstance = false
  const storage = new LocalStorage('broadcast-response')
  const manager = new PeerManager(storage, StorageKey.TRANSPORT_POSTMESSAGE_PEERS_DAPP)
  const key = await getKeypairFromSeed('broadcast-wallet')
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
  const client = new DAppClient({ name: 'Broadcast DApp', storage, disableDefaultEvents: true })
  const sibling = new BroadcastChannel<unknown>('beacon-sdk-channel')
  try {
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
    const pending = client.requestPermissions({ scopes: [PermissionScope.SIGN] })
    const id = await requestSent
    await sibling.postMessage({ type: 'RESPONSE', data: null })
    const message = {
      id,
      version: '2',
      senderId: 'wallet',
      type: BeaconMessageType.PermissionResponse,
      appMetadata: { senderId: 'wallet', name: 'Legacy Wallet' },
      network: { type: NetworkType.MAINNET },
      scopes: [PermissionScope.SIGN],
      pubkey: toHex(key.publicKey),
      address: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb'
    }
    await sibling.postMessage({
      type: 'RESPONSE',
      data: { message, connectionInfo: { id: peer.id, origin: Origin.EXTENSION } }
    })
    await expect(pending).resolves.toEqual(expect.objectContaining({ address: message.address }))
    await expect(client.getActiveAccount()).resolves.toEqual(
      expect.objectContaining({
        address: message.address,
        walletType: 'implicit',
        scopes: [PermissionScope.SIGN]
      })
    )
    expect(message).not.toHaveProperty('walletType')
  } finally {
    await sibling.close()
    await client.destroy()
    enforceOptions(false)
    jest.restoreAllMocks()
    if (originalChannel) Object.defineProperty(globalThis, 'BroadcastChannel', originalChannel)
    else Reflect.deleteProperty(globalThis, 'BroadcastChannel')
    if (originalMedia) Object.defineProperty(window, 'matchMedia', originalMedia)
    else Reflect.deleteProperty(window, 'matchMedia')
    localStorage.clear()
    windowRef.beaconCreatedClientInstance = false
  }
})

it('keeps delegated headers authoritative and forwards send failures through the leader channel', async () => {
  const originalChannel = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel')
  const originalMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
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
  enforceOptions({ type: 'simulate' })
  localStorage.clear()
  windowRef.beaconCreatedClientInstance = false
  const storage = new LocalStorage('broadcast-delegation')
  const keys = await getKeypairFromSeed('delegation-dapp')
  const transport = new DappWalletConnectTransport(
    'Delegated wallet',
    keys,
    storage,
    { network: NetworkType.MAINNET, opts: {} },
    async () => true
  )
  jest.spyOn(transport, 'connect').mockResolvedValue(undefined)
  jest.spyOn(transport, 'disconnect').mockResolvedValue(undefined)
  jest.spyOn(transport, 'waitForResolution').mockResolvedValue(true)
  jest.spyOn(transport, 'getPeers').mockResolvedValue([])
  const client = new DAppClient({ name: 'Delegating DApp', storage, disableDefaultEvents: true })
  const sibling = new BroadcastChannel<unknown>('beacon-sdk-channel')
  try {
    let firstSent = () => {}
    let delegatedSent = (_packet: object) => {}
    const first = new Promise<void>((resolve) => {
      firstSent = resolve
    })
    const delegated = new Promise<object>((resolve) => {
      delegatedSent = resolve
    })
    const failure = { type: BeaconMessageType.Error, errorType: 42 }
    const diagnostic = jest.spyOn(Logger.prototype, 'error')
    let failed = (_message: unknown) => {}
    const forwardedFailure = new Promise<unknown>((resolve) => {
      failed = resolve
    })
    sibling.onmessage = (packet: unknown) => {
      if (
        packet === null ||
        typeof packet !== 'object' ||
        !('type' in packet) ||
        packet.type !== 'RESPONSE' ||
        !('data' in packet)
      )
        return
      const data = packet.data
      if (data === null || typeof data !== 'object' || !('message' in data)) return
      const message = data.message
      if (
        message !== null &&
        typeof message === 'object' &&
        'id' in message &&
        message.id === 'delegated-id'
      )
        failed(message)
    }
    let count = 0
    jest.spyOn(transport, 'send').mockImplementation(async (serialized) => {
      const packet: unknown = await new Serializer().deserialize(serialized)
      if (packet === null || typeof packet !== 'object')
        throw new Error('Request fixture needs a message')
      count++
      if (count === 1) firstSent()
      else {
        delegatedSent(packet)
        throw failure
      }
    })
    await client.init(transport)
    const pending = client.requestPermissions({ scopes: [PermissionScope.SIGN] })
    const outcome = pending.then(
      () => 'resolved',
      () => 'rejected'
    )
    await first
    await sibling.postMessage({
      id: 'delegated-id',
      type: BeaconMessageType.PermissionRequest,
      data: {
        type: BeaconMessageType.PermissionRequest,
        id: 'spoofed-id',
        senderId: 'spoofed-sender',
        version: 'spoofed-version',
        network: { type: NetworkType.MAINNET },
        scopes: [PermissionScope.SIGN],
        appMetadata: { senderId: 'sibling', name: 'Sibling' },
        extra: 'preserved'
      }
    })
    expect(await delegated).toEqual(
      expect.objectContaining({
        id: 'delegated-id',
        version: '2',
        senderId: (await client.getOwnAppMetadata()).senderId,
        extra: 'preserved'
      })
    )
    await expect(forwardedFailure).resolves.toEqual(
      expect.objectContaining({
        id: 'delegated-id',
        type: BeaconMessageType.Error,
        version: '2',
        senderId: '',
        errorType: BeaconErrorType.UNKNOWN_ERROR
      })
    )
    expect(diagnostic).toHaveBeenCalledWith('prepareRequest', failure)
    await client.disconnect({ notifyPeers: false })
    await expect(outcome).resolves.toBe('rejected')
  } finally {
    await client.destroy()
    await sibling.close()
    enforceOptions(false)
    jest.restoreAllMocks()
    if (originalChannel) Object.defineProperty(globalThis, 'BroadcastChannel', originalChannel)
    else Reflect.deleteProperty(globalThis, 'BroadcastChannel')
    if (originalMedia) Object.defineProperty(window, 'matchMedia', originalMedia)
    else Reflect.deleteProperty(window, 'matchMedia')
    localStorage.clear()
    windowRef.beaconCreatedClientInstance = false
  }
})
