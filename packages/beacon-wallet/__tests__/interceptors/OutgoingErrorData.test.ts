import { AppMetadataManager, LocalStorage, PermissionManager } from '@ecadlabs/beacon-core'
import { BeaconErrorType, BeaconMessageType, NetworkType } from '@ecadlabs/beacon-types'
import { OutgoingResponseInterceptor } from '../../src/interceptors/OutgoingResponseInterceptor'

describe('outgoing transaction error data', () => {
  const interceptError = async (errorData: unknown) => {
    const storage = new LocalStorage()
    const callback = jest.fn<void, [unknown]>()
    await OutgoingResponseInterceptor.intercept({
      senderId: 'wallet',
      request: {
        id: 'request',
        senderId: 'dapp',
        version: '2',
        type: BeaconMessageType.OperationRequest,
        network: { type: NetworkType.MAINNET },
        operationDetails: [],
        sourceAddress: 'tz1source'
      },
      message: {
        id: 'request',
        type: BeaconMessageType.Error,
        errorType: BeaconErrorType.TRANSACTION_INVALID_ERROR,
        errorData
      },
      ownAppMetadata: { senderId: 'wallet', name: 'Wallet' },
      appMetadataManager: new AppMetadataManager(storage),
      permissionManager: new PermissionManager(storage),
      interceptorCallback: callback
    })
    expect(callback).toHaveBeenCalledTimes(1)
    const response = callback.mock.calls[0]?.[0]
    if (
      response === null ||
      typeof response !== 'object' ||
      !('type' in response) ||
      response.type !== BeaconMessageType.Error
    )
      throw new Error('Expected error response')
    return response
  }

  it('preserves complete RPC records and additional fields', async () => {
    const errorData = [{ kind: 'temporary', id: 'proto.error', with: { int: '42' }, extra: 'kept' }]
    const response = await interceptError(errorData)
    expect('errorData' in response ? response.errorData : undefined).toBe(errorData)
  })

  it.each([[{ kind: { value: 'temporary' }, id: 42 }], [null]])(
    'omits malformed RPC identifiers: %p',
    async (record) => {
      const response = await interceptError([record])
      expect(response).not.toHaveProperty('errorData')
    }
  )
})
