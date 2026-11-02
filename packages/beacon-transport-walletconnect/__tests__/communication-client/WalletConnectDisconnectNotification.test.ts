import { BroadcastChannel as NativeBroadcastChannel } from 'node:worker_threads'
import { createRelayerEvents } from '../helpers/relayer-events'
import { Serializer } from '@ecadlabs/beacon-core'
import {
  BeaconErrorType,
  BeaconMessageType,
  NetworkType,
  OperationRequest
} from '@ecadlabs/beacon-types'
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
    tezos: { accounts: ['tezos:mainnet:tz1account'], methods: ['tezos_send'], events: [] }
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

it.each(['normal', 'failure', 'replacement'])(
  'retains close cleanup with notification serialization failure: %s',
  async (mode) => {
    const fails = mode === 'failure'
    const original = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel')
    const channels: NativeBroadcastChannel[] = []
    class OwnedBroadcastChannel extends NativeBroadcastChannel {
      constructor(name: string) {
        super(name)
        channels.push(this)
      }
    }
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      value: OwnedBroadcastChannel
    })
    jest.clearAllMocks()
    mockInit.mockResolvedValue(mockRemote)
    jest.useFakeTimers()
    localStorage.clear()
    session.expiry = Math.floor(Date.now() / 1000) + 172800
    let started = () => {}
    const requested = new Promise<void>((resolve) => {
      started = resolve
    })
    mockRemote.request.mockImplementation(() => {
      started()
      return new Promise<unknown>(() => {})
    })
    const instance = new WalletConnectCommunicationClient(
      { network: NetworkType.MAINNET, opts: {} },
      () => true
    )
    try {
      await instance.init()
      const serializer = new Serializer()
      let receive: (message: string) => void = () => {}
      let fail: (error: unknown) => void = () => {}
      const received = new Promise<string>((resolve, reject) => {
        receive = resolve
        fail = reject
      })
      await instance.listenForEncryptedMessage('wallet-key', (serialized) => {
        serializer.deserialize(serialized).then((message) => {
          if (
            message !== null &&
            typeof message === 'object' &&
            'type' in message &&
            message.type === BeaconMessageType.Disconnect
          )
            receive(serialized)
        }, fail)
      })
      const request = {
        id: 'pending-operation',
        version: '2',
        senderId: 'dapp',
        type: BeaconMessageType.OperationRequest,
        network: { type: NetworkType.MAINNET },
        sourceAddress: 'tz1account',
        operationDetails: []
      } satisfies OperationRequest
      await instance.sendMessage(await serializer.serialize(request))
      await requested

      const failure = new Error('Notification codec unavailable')
      const encode = fails
        ? jest.spyOn(Serializer.prototype, 'serialize').mockRejectedValueOnce(failure)
        : undefined
      let encodingStarted = () => {}
      const encoding = new Promise<void>((resolve) => {
        encodingStarted = resolve
      })
      let release = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const originalEncode = Serializer.prototype.serialize
      if (mode === 'replacement') {
        jest.spyOn(Serializer.prototype, 'serialize').mockImplementationOnce(async (message) => {
          encodingStarted()
          await gate
          return originalEncode.call(serializer, message)
        })
      }
      const replacement = {
        ...mockRemote,
        disconnect: jest.fn(async () => {}),
        session: {
          keys: ['replacement-topic'],
          get: jest.fn(() => ({ ...session, topic: 'replacement-topic' }))
        }
      }
      const closing = instance.closeActiveSession('tz1account')
      if (mode === 'replacement') {
        await encoding
        await instance.closeSignClient()
        mockInit.mockResolvedValueOnce(replacement)
        await instance.init()
        release()
      }

      if (fails) {
        await expect(closing).rejects.toBe(failure)
      } else {
        await closing
        expect(await serializer.deserialize(await received)).toEqual({
          id: 'pending-operation',
          type: BeaconMessageType.Disconnect,
          errorType: BeaconErrorType.ABORTED_ERROR,
          version: '2',
          senderId: 'restored-topic'
        })
      }
      expect(mockRemote.disconnect).toHaveBeenCalledTimes(1)
      expect(mockRemote.disconnect).toHaveBeenCalledWith({
        topic: 'restored-topic',
        reason: { code: 0, message: 'Force new connection' }
      })
      if (mode === 'replacement') {
        expect(replacement.disconnect).not.toHaveBeenCalled()
        expect(instance.currentSession()?.topic).toBe('replacement-topic')
      }
      if (fails) {
        await instance.closeActiveSession('tz1account')
        expect(encode).toHaveBeenCalledTimes(1)
        expect(mockRemote.disconnect).toHaveBeenCalledTimes(2)
      }
    } finally {
      channels.forEach((channel) => channel.close())
      jest.restoreAllMocks()
      jest.clearAllTimers()
      jest.useRealTimers()
      if (original) Object.defineProperty(globalThis, 'BroadcastChannel', original)
      else Reflect.deleteProperty(globalThis, 'BroadcastChannel')
      localStorage.clear()
    }
  }
)
