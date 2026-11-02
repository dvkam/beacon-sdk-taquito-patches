import { AppMetadataManager, LocalStorage } from '@ecadlabs/beacon-core'
import {
  AppMetadata,
  BeaconMessageType,
  ConnectionContext,
  NetworkType,
  Origin,
  PermissionRequest
} from '@ecadlabs/beacon-types'
import { IncomingRequestInterceptor } from '../src/interceptors/IncomingRequestInterceptor'

const connectionInfo: ConnectionContext = { origin: Origin.P2P, id: 'peer' }
function request(appMetadata: AppMetadata): PermissionRequest {
  return {
    id: 'request',
    version: '2',
    senderId: 'dapp',
    type: BeaconMessageType.PermissionRequest,
    appMetadata,
    network: { type: NetworkType.MAINNET },
    scopes: []
  }
}
describe('incoming V2 permission metadata', () => {
  beforeEach(() => localStorage.clear())

  it.each([
    {
      name: 'converts a valid legacy identifier',
      metadata: { senderId: '', name: 'dapp', beaconId: 'legacy-dapp', extra: 'retained' },
      expected: { senderId: 'legacy-dapp', name: 'dapp', extra: 'retained' }
    },
    {
      name: 'does not promote a malformed truthy legacy identifier',
      metadata: { senderId: '', name: 'dapp', beaconId: { invalid: true }, extra: 'retained' },
      expected: { senderId: '', name: 'dapp', beaconId: { invalid: true }, extra: 'retained' }
    },
    {
      name: 'keeps a modern identifier ahead of the legacy identifier',
      metadata: {
        senderId: 'modern-dapp',
        name: 'dapp',
        beaconId: 'legacy-dapp',
        extra: 'retained'
      },
      expected: {
        senderId: 'modern-dapp',
        name: 'dapp',
        beaconId: 'legacy-dapp',
        extra: 'retained'
      }
    }
  ])('$name', async ({ metadata, expected }) => {
    const storage = new LocalStorage('incoming-metadata')
    const appMetadataManager = new AppMetadataManager(storage)
    const message = request(metadata)
    const delivered = vi.fn()

    await IncomingRequestInterceptor.intercept({
      message,
      connectionInfo,
      appMetadataManager,
      interceptorCallback: delivered
    })

    expect(metadata).toEqual(expected)
    expect(await appMetadataManager.getAppMetadataList()).toEqual([expected])
    expect(delivered).toHaveBeenCalledWith(message, connectionInfo)
  })
})
