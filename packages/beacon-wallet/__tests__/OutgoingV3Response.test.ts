import { AppMetadataManager, LocalStorage, PermissionManager } from '@ecadlabs/beacon-core'
import {
  BeaconMessageEnvelopeV3,
  BeaconMessageType,
  BeaconRequestMessage,
  BeaconResponseInputMessage,
  BlockchainMessage,
  NetworkType
} from '@ecadlabs/beacon-types'
import { OutgoingResponseInterceptor } from '../src/interceptors/OutgoingResponseInterceptor'

type Input =
  BeaconResponseInputMessage | BeaconMessageEnvelopeV3 | (BlockchainMessage & { id: string })

function config(message: Input, callback: (message: unknown) => unknown, version: '2' | '3' = '3') {
  const storage = new LocalStorage('outgoing-v3')
  const request: BeaconRequestMessage | BeaconMessageEnvelopeV3 =
    version === '2'
      ? {
          id: 'request',
          version,
          senderId: 'dapp',
          type: BeaconMessageType.OperationRequest,
          network: { type: NetworkType.MAINNET },
          sourceAddress: 'tz1source',
          operationDetails: []
        }
      : {
          id: 'request',
          version,
          senderId: 'dapp',
          message: { type: BeaconMessageType.BlockchainRequest }
        }
  return {
    message,
    request,
    senderId: 'wallet',
    ownAppMetadata: { senderId: 'wallet', name: 'Wallet' },
    permissionManager: new PermissionManager(storage),
    appMetadataManager: new AppMetadataManager(storage),
    interceptorCallback: callback
  }
}

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const wrappedResponse = {
  id: 'request',
  version: '3',
  senderId: 'wallet',
  message: { type: BeaconMessageType.BlockchainResponse, blockchainData: { opaque: true } }
}

describe('outgoing V3 response values', () => {
  beforeEach(() => localStorage.clear())

  it.each([
    { name: 'wrapped response', value: wrappedResponse },
    {
      name: 'flat chain response',
      value: {
        id: 'request',
        type: BeaconMessageType.BlockchainResponse,
        blockchainIdentifier: 'tezos',
        blockchainData: { opaque: true }
      }
    },
    {
      name: 'existing flat acknowledgement',
      value: { id: 'request', type: BeaconMessageType.Acknowledge }
    }
  ] satisfies { name: string; value: Input }[])(
    'preserves the $name without protocol normalization',
    async ({ value }) => {
      const callback = jest.fn()
      await OutgoingResponseInterceptor.intercept(config(value, callback))
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback.mock.calls[0]?.[0]).toBe(value)
    }
  )

  it('waits for asynchronous delivery of an enriched V2 response', async () => {
    const started = deferred()
    const release = deferred()
    const delivered = deferred()
    let finished = false
    let response: unknown
    const interception = OutgoingResponseInterceptor.intercept(
      config(
        { id: 'request', type: BeaconMessageType.Acknowledge },
        async (value) => {
          response = value
          started.resolve()
          await release.promise
          delivered.resolve()
          return 'ignored callback result'
        },
        '2'
      )
    )
    interception.then(() => {
      finished = true
    })
    await started.promise
    await Promise.resolve()
    const finishedBeforeDelivery = finished
    release.resolve()
    await delivered.promise
    await interception

    expect(finishedBeforeDelivery).toBe(false)
    expect(response).toEqual({
      id: 'request',
      type: BeaconMessageType.Acknowledge,
      version: '2',
      senderId: 'wallet'
    })
  })
  it.each([
    { name: 'wrapped response', value: wrappedResponse },
    { name: 'wrapper with a broad string version', value: { ...wrappedResponse, version: '2' } },
    {
      name: 'flat chain response',
      value: {
        id: 'request',
        type: BeaconMessageType.BlockchainResponse,
        blockchainIdentifier: 'tezos',
        blockchainData: null
      }
    }
  ] satisfies { name: string; value: Input }[])(
    'rejects the complete $name shape for V2 before delivery',
    async ({ value }) => {
      const callback = jest.fn()
      await expect(
        OutgoingResponseInterceptor.intercept(config(value, callback, '2'))
      ).rejects.toThrow('A V3 response shape cannot be sent for a V2 request')
      expect(callback).not.toHaveBeenCalled()
    }
  )

  it.each([{ message: 'diagnostic' }, { blockchainIdentifier: 'custom-tag' }])(
    'preserves V2 handling with an ordinary extra field: %p',
    async (extra) => {
      const callback = jest.fn()
      await OutgoingResponseInterceptor.intercept(
        config(
          {
            id: 'request',
            type: BeaconMessageType.Acknowledge,
            ...extra
          },
          callback,
          '2'
        )
      )

      expect(callback).toHaveBeenCalledWith({
        id: 'request',
        type: BeaconMessageType.Acknowledge,
        version: '2',
        senderId: 'wallet'
      })
    }
  )
})
