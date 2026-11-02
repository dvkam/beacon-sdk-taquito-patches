import { BeaconMessageType, Origin, type OperationResponse } from '@ecadlabs/beacon-types'
import {
  v3PermissionResponse,
  v2Response,
  createPendingRequest,
  type RequestResult,
  type RequestFailure
} from '../src/dapp-client/pending-responses'
import { ExposedPromise } from '@ecadlabs/beacon-utils'

it('rejects sparse scopes while constructing dense chain scopes and opaque extras', () => {
  const select = v3PermissionResponse('chain-test')
  const response = (scopes: unknown) => ({
    id: 'request',
    version: '3',
    senderId: 'wallet',
    message: {
      type: BeaconMessageType.PermissionResponse,
      blockchainIdentifier: 'chain-test',
      blockchainData: {
        appMetadata: { senderId: 'wallet', name: 'Wallet' },
        scopes,
        opaque: { retained: true }
      }
    }
  })
  expect(select(response(Array(1)))).toBeUndefined()
  expect(select(response(['transfer', undefined]))).toBeUndefined()
  expect(select(response(['transfer']))?.message.blockchainData).toEqual({
    appMetadata: { senderId: 'wallet', name: 'Wallet' },
    scopes: ['transfer'],
    opaque: { retained: true }
  })
})

it('captures permission data and metadata getters once before returning a typed snapshot', () => {
  let dataReads = 0
  let metadataReads = 0
  const response = {
    id: 'request',
    version: '3',
    senderId: 'wallet',
    message: {
      type: BeaconMessageType.PermissionResponse,
      blockchainIdentifier: 'chain-test',
      get blockchainData() {
        dataReads += 1
        if (dataReads > 1) throw new Error('data read again')
        return {
          scopes: ['transfer'],
          get appMetadata() {
            metadataReads += 1
            if (metadataReads > 1) throw new Error('metadata read again')
            return { senderId: 'wallet', name: 'Wallet' }
          }
        }
      }
    }
  }
  const selected = v3PermissionResponse('chain-test')(response)
  expect(dataReads).toBe(1)
  expect(metadataReads).toBe(1)
  expect(selected?.message.blockchainData.appMetadata).toEqual({
    senderId: 'wallet',
    name: 'Wallet'
  })
  expect(dataReads).toBe(1)
  expect(metadataReads).toBe(1)
})

it.each(['opaque selector throw', 'context getter throw'])(
  'rejects its owned promise without coercing an opaque reason: %s',
  async (mode) => {
    const opaque: unknown = Object.create(null)
    const failure = new Error('context unavailable')
    const promise = new ExposedPromise<RequestResult<OperationResponse>, RequestFailure>()
    const result = promise.promise.then(
      () => undefined,
      (reason: unknown) => reason
    )
    const selector =
      mode === 'opaque selector throw'
        ? () => {
            throw opaque
          }
        : v2Response(BeaconMessageType.OperationResponse)
    const pending = createPendingRequest('request', promise, selector)
    const connectionInfo = {
      origin: Origin.P2P,
      get id(): string {
        if (mode === 'context getter throw') throw failure
        return 'peer'
      }
    }
    const beforeResolve = jest.fn(async () => {})
    await expect(
      pending.resolve(
        {
          message: {
            id: 'request',
            version: '2',
            senderId: 'wallet',
            type: BeaconMessageType.OperationResponse,
            transactionHash: 'operation'
          },
          connectionInfo
        },
        beforeResolve
      )
    ).resolves.toBe(false)
    const reason = await result
    if (mode === 'context getter throw') expect(reason).toBe(failure)
    else expect(reason).toEqual(expect.objectContaining({ cause: opaque }))
    expect(beforeResolve).not.toHaveBeenCalled()
  }
)
