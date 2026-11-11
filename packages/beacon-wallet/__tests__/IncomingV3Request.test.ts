import { AppMetadataManager, LocalStorage } from '@ecadlabs/beacon-core'
import {
  BeaconBaseMessageV3,
  BeaconMessageEnvelopeV3,
  BeaconMessageType,
  ConnectionContext,
  Origin,
  StorageKey
} from '@ecadlabs/beacon-types'
import { IncomingRequestInterceptor } from '../src/interceptors/IncomingRequestInterceptor'

const connectionInfo: ConnectionContext = { origin: Origin.P2P, id: 'peer' }
function envelope<T extends BeaconBaseMessageV3>(message: T): BeaconMessageEnvelopeV3<T> {
  return { id: 'request', version: '3', senderId: 'outer-dapp', message }
}

describe('incoming V3 request envelopes', () => {
  beforeEach(() => localStorage.clear())

  it('persists validated permission metadata under the outer sender and preserves opaque extras', async () => {
    const message = envelope({
      type: BeaconMessageType.PermissionRequest,
      blockchainData: {
        appMetadata: {
          senderId: 'spoofed',
          name: 'dapp',
          icon: 'https://dapp.example/icon',
          extra: 42
        },
        chainOwned: { opaque: true }
      },
      extra: 'retained'
    })
    const storage = new LocalStorage('v3-permission')
    const delivered = vi.fn()

    await IncomingRequestInterceptor.intercept({
      message,
      connectionInfo,
      appMetadataManager: new AppMetadataManager(storage),
      interceptorCallback: delivered
    })

    expect(await storage.get(StorageKey.APP_METADATA_LIST)).toEqual([
      {
        senderId: 'outer-dapp',
        name: 'dapp',
        icon: 'https://dapp.example/icon',
        extra: 42
      }
    ])
    expect(delivered).toHaveBeenCalledWith(message, connectionInfo)
    expect(message.message.blockchainData.appMetadata.senderId).toBe('spoofed')
    expect(message.message.extra).toBe('retained')
  })

  it.each([
    { name: 'null metadata', metadata: null },
    { name: 'non-string name', metadata: { name: 42 } },
    { name: 'non-string icon', metadata: { name: 'dapp', icon: { invalid: true } } }
  ])('rejects $name before storage or delivery', async ({ metadata }) => {
    const storage = new LocalStorage('v3-invalid')
    const delivered = vi.fn()

    await expect(
      IncomingRequestInterceptor.intercept({
        message: envelope({
          type: BeaconMessageType.PermissionRequest,
          blockchainData: { appMetadata: metadata }
        }),
        connectionInfo,
        appMetadataManager: new AppMetadataManager(storage),
        interceptorCallback: delivered
      })
    ).rejects.toThrow('Invalid V3 permission metadata')

    expect(await storage.get(StorageKey.APP_METADATA_LIST)).toEqual([])
    expect(delivered).not.toHaveBeenCalled()
  })

  it('passes blockchain payloads through without claiming chain-specific fields', async () => {
    const message = envelope({
      type: BeaconMessageType.BlockchainRequest,
      blockchainData: null,
      extra: 42
    })
    const storage = new LocalStorage('v3-blockchain')
    const delivered = vi.fn()

    await IncomingRequestInterceptor.intercept({
      message,
      connectionInfo,
      appMetadataManager: new AppMetadataManager(storage),
      interceptorCallback: delivered
    })

    expect(delivered).toHaveBeenCalledWith(
      {
        id: 'request',
        version: '3',
        senderId: 'outer-dapp',
        message: { type: BeaconMessageType.BlockchainRequest, blockchainData: null, extra: 42 }
      },
      connectionInfo
    )
    expect(await storage.get(StorageKey.APP_METADATA_LIST)).toEqual([])
  })
  it('persists the validated optional icon even if a metadata accessor changes later', async () => {
    let reads = 0
    const metadata = {
      name: 'dapp',
      get icon(): unknown {
        return ++reads === 1 ? undefined : { invalid: true }
      }
    }
    const storage = new LocalStorage('v3-metadata-snapshot')
    await IncomingRequestInterceptor.intercept({
      message: envelope({
        type: BeaconMessageType.PermissionRequest,
        blockchainData: { appMetadata: metadata }
      }),
      connectionInfo,
      appMetadataManager: new AppMetadataManager(storage),
      interceptorCallback: () => undefined
    })

    expect(await storage.get(StorageKey.APP_METADATA_LIST)).toEqual([
      { senderId: 'outer-dapp', name: 'dapp' }
    ])
  })
})
