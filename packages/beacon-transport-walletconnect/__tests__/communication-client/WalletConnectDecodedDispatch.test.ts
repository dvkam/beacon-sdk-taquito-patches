import { BroadcastChannel as NativeBroadcastChannel } from 'node:worker_threads'
import { createRelayerEvents } from '../helpers/relayer-events'
import { Serializer } from '@ecadlabs/beacon-core'
import { BeaconMessageType, NetworkType, SigningType } from '@ecadlabs/beacon-types'
import { SessionTypes } from '@walletconnect/types'
import { WalletConnectCommunicationClient } from '../../src/communication-client/WalletConnectCommunicationClient'

const metadata = { name: 'wallet', description: '', url: 'https://wallet.example', icons: [] }
const session: SessionTypes.Struct = {
  topic: 'restored-topic',
  pairingTopic: 'pairing-topic',
  relay: { protocol: 'irn' },
  expiry: 0,
  acknowledged: true,
  controller: 'wallet',
  namespaces: {
    tezos: {
      accounts: ['tezos:mainnet:tz1account'],
      methods: ['tezos_getAccounts', 'tezos_send', 'tezos_sign'],
      events: []
    }
  },
  requiredNamespaces: {},
  optionalNamespaces: {},
  sessionProperties: { pubkey: 'public-key', algo: 'ed25519', address: 'tz1account' },
  self: { publicKey: 'dapp-key', metadata },
  peer: { publicKey: 'wallet-key', metadata }
}
const mockApproval = jest.fn<Promise<SessionTypes.Struct>, []>()
const mockRemote = {
  session: { keys: ['restored-topic'], get: jest.fn(() => session) },
  request: jest.fn<Promise<unknown>, [unknown]>(),
  disconnect: jest.fn(async () => {}),
  ping: jest.fn(async () => {}),
  extend: jest.fn(async () => {}),
  connect: jest.fn(async () => ({ uri: 'wc:new-topic@2?symKey=key', approval: mockApproval })),
  on: jest.fn(),
  core: {
    events: { removeAllListeners: jest.fn() },
    heartbeat: { stop: jest.fn() },
    relayer: {
      ...createRelayerEvents(),
      transportClose: jest.fn(async () => {}),
      provider: {
        events: { removeAllListeners: jest.fn() },
        connection: { events: { removeAllListeners: jest.fn() } }
      },
      subscriber: { events: { removeAllListeners: jest.fn() } }
    },
    pairing: {
      events: { on: jest.fn(), removeAllListeners: jest.fn() },
      ping: jest.fn(async () => {}),
      getPairings: jest.fn(() => [{ topic: 'pairing-topic' }])
    }
  }
}
// Babel does not inline cross-package const enums as the production TypeScript build does.
// Keep the real core implementation and supply only its erased event constants.
jest.mock('@ecadlabs/beacon-core', () => ({
  ...jest.requireActual<typeof import('@ecadlabs/beacon-core')>('@ecadlabs/beacon-core'),
  ClientEvents: {
    CLOSE_ALERT: 'CLOSE_ALERT',
    RESET_STATE: 'RESET_STATE',
    WC_ACK_NOTIFICATION: 'WC_ACK_NOTIFICATION',
    ON_RELAYER_ERROR: 'ON_RELAYER_ERROR'
  }
}))
const mockInit = jest.fn(async () => mockRemote)
jest.mock('@walletconnect/sign-client', () => ({ init: async () => mockInit() }))
jest.mock('@walletconnect/utils', () => ({
  getSdkError: () => ({ code: 6000, message: 'User disconnected.' })
}))

const network = {
  type: NetworkType.MAINNET,
  name: 'Main',
  rpcUrl: 'https://rpc.example',
  extra: 'preserved'
}
const request = (type: BeaconMessageType, id = 'valid') => ({
  id,
  type,
  version: '2',
  senderId: 'dapp',
  network,
  operationDetails: [],
  payload: 'payload',
  signingType: SigningType.RAW,
  appMetadata: { senderId: 'dapp', name: 'DApp' },
  scopes: []
})

async function setup() {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel')
  const channels: NativeBroadcastChannel[] = []
  class OwnedChannel extends NativeBroadcastChannel {
    constructor(name: string) {
      super(name)
      channels.push(this)
    }
  }
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: OwnedChannel })
  jest.clearAllMocks()
  jest.useFakeTimers()
  localStorage.clear()
  mockInit.mockResolvedValue(mockRemote)
  mockApproval.mockResolvedValue(session)
  session.expiry = Math.floor(Date.now() / 1000) + 172800
  session.namespaces.tezos.methods = ['tezos_getAccounts', 'tezos_send', 'tezos_sign']
  mockRemote.request.mockResolvedValue({ operationHash: 'opHash', signature: 'sig' })
  const client = new WalletConnectCommunicationClient(
    { network: NetworkType.MAINNET, opts: {} },
    () => true
  )
  await client.init()
  return {
    client,
    dispose() {
      channels.forEach((channel) => channel.close())
      jest.restoreAllMocks()
      jest.clearAllTimers()
      jest.useRealTimers()
      localStorage.clear()
      if (original) Object.defineProperty(globalThis, 'BroadcastChannel', original)
      else Reflect.deleteProperty(globalThis, 'BroadcastChannel')
    }
  }
}

async function subscribe(client: WalletConnectCommunicationClient, type: BeaconMessageType) {
  let resolve: (message: unknown) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const response = new Promise<unknown>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  await client.listenForEncryptedMessage('wallet-key', (serialized) => {
    new Serializer().deserialize(serialized).then((message) => {
      if (
        message !== null &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === type
      )
        resolve(message)
    }, reject)
  })
  return { response }
}

it.each([
  {
    requestType: BeaconMessageType.PermissionRequest,
    responseType: BeaconMessageType.PermissionResponse,
    rpc: undefined,
    method: 'requestPermissions'
  },
  {
    requestType: BeaconMessageType.OperationRequest,
    responseType: BeaconMessageType.OperationResponse,
    rpc: 'tezos_send',
    method: 'sendOperations'
  },
  {
    requestType: BeaconMessageType.SignPayloadRequest,
    responseType: BeaconMessageType.SignPayloadResponse,
    rpc: 'tezos_sign',
    method: 'signPayload'
  }
] satisfies {
  requestType: BeaconMessageType
  responseType: BeaconMessageType
  rpc: string | undefined
  method: 'requestPermissions' | 'sendOperations' | 'signPayload'
}[])(
  'dispatches $requestType without queuing unsupported packet ids',
  async ({ requestType, responseType, rpc, method }) => {
    const context = await setup()
    try {
      const route = jest.spyOn(context.client, method)
      const { response } = await subscribe(context.client, responseType)
      const serializer = new Serializer()
      await context.client.sendMessage(
        await serializer.serialize({ id: 'unsupported', type: 'unrelated' })
      )
      const packet = request(requestType)
      await context.client.sendMessage(await serializer.serialize(packet))
      expect(route).toHaveBeenCalledTimes(1)
      expect(route).toHaveBeenCalledWith(expect.objectContaining(packet))
      expect(await response).toEqual(expect.objectContaining({ id: 'valid', type: responseType }))
      if (rpc)
        expect(mockRemote.request).toHaveBeenCalledWith(
          expect.objectContaining({ request: expect.objectContaining({ method: rpc }) })
        )
      else expect(await response).toEqual(expect.objectContaining({ network }))
    } finally {
      context.dispose()
    }
  }
)

it('rejects malformed recognized fields before RPC and keeps the next valid request correlated', async () => {
  const context = await setup()
  try {
    const serializer = new Serializer()
    for (const malformed of [
      {
        ...request(BeaconMessageType.PermissionRequest, 'bad-network'),
        network: { type: NetworkType.MAINNET, name: 7 }
      },
      { ...request(BeaconMessageType.OperationRequest, 'bad-operations'), operationDetails: {} },
      { ...request(BeaconMessageType.SignPayloadRequest, 'bad-signature'), payload: 7 }
    ]) {
      await expect(
        context.client.sendMessage(await serializer.serialize(malformed))
      ).rejects.toBeInstanceOf(TypeError)
    }
    expect(mockRemote.request).not.toHaveBeenCalled()
    expect(mockRemote.connect).not.toHaveBeenCalled()
    const { response } = await subscribe(context.client, BeaconMessageType.OperationResponse)
    await context.client.sendMessage(
      await serializer.serialize(request(BeaconMessageType.OperationRequest))
    )
    expect(await response).toEqual(
      expect.objectContaining({ id: 'valid', transactionHash: 'opHash' })
    )
  } finally {
    context.dispose()
  }
})

it('returns a selected handler initialization rejection to the public sendMessage caller', async () => {
  const context = await setup()
  try {
    const uninitialized = new WalletConnectCommunicationClient(
      { network: NetworkType.MAINNET, opts: {} },
      () => true
    )
    const serialized = await new Serializer().serialize(
      request(BeaconMessageType.OperationRequest, 'failed')
    )
    await expect(uninitialized.sendMessage(serialized)).rejects.toThrow(
      'Not connected, no active session'
    )
    expect(mockRemote.request).not.toHaveBeenCalled()
    await uninitialized.init()
    const { response } = await subscribe(uninitialized, BeaconMessageType.OperationResponse)
    await uninitialized.sendMessage(
      await new Serializer().serialize(request(BeaconMessageType.OperationRequest))
    )
    expect(await response).toEqual(
      expect.objectContaining({ id: 'valid', transactionHash: 'opHash' })
    )
  } finally {
    context.dispose()
  }
})

it('preserves an earlier pending request when a later request fails initialization', async () => {
  const context = await setup()
  const accounts = session.namespaces.tezos.accounts
  let finish: (value: unknown) => void = () => {}
  const remoteResponse = new Promise<unknown>((resolve) => {
    finish = resolve
  })
  mockRemote.request.mockReturnValueOnce(remoteResponse)
  try {
    const serializer = new Serializer()
    const { response } = await subscribe(context.client, BeaconMessageType.OperationResponse)
    await context.client.sendMessage(
      await serializer.serialize(request(BeaconMessageType.OperationRequest, 'pending'))
    )
    session.namespaces.tezos.accounts = []
    await expect(
      context.client.sendMessage(
        await serializer.serialize(request(BeaconMessageType.OperationRequest, 'failed'))
      )
    ).rejects.toThrow('No permission.')
    expect(mockRemote.request).toHaveBeenCalledTimes(1)
    session.namespaces.tezos.accounts = accounts
    finish({ operationHash: 'pending-hash' })
    expect(await response).toEqual(
      expect.objectContaining({ id: 'pending', transactionHash: 'pending-hash' })
    )
  } finally {
    session.namespaces.tezos.accounts = accounts
    context.dispose()
  }
})

it('keeps its queued id when a public handler mutates the packet before rejecting', async () => {
  const context = await setup()
  try {
    const failure = new Error('Public handler failed')
    jest.spyOn(context.client, 'sendOperations').mockImplementationOnce(async (message) => {
      if ('id' in message) message.id = 'changed-by-handler'
      throw failure
    })
    const serializer = new Serializer()
    await expect(
      context.client.sendMessage(
        await serializer.serialize(request(BeaconMessageType.OperationRequest, 'failed'))
      )
    ).rejects.toBe(failure)
    const { response } = await subscribe(context.client, BeaconMessageType.OperationResponse)
    await context.client.sendMessage(
      await serializer.serialize(request(BeaconMessageType.OperationRequest))
    )
    expect(await response).toEqual(
      expect.objectContaining({ id: 'valid', transactionHash: 'opHash' })
    )
  } finally {
    context.dispose()
  }
})
