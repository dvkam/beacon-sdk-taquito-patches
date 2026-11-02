import { AppMetadataManager, LocalStorage } from '@ecadlabs/beacon-core'
import {
  AppMetadata,
  BeaconMessageType,
  ConnectionContext,
  NetworkType,
  Origin,
  PermissionRequest,
  StorageKey,
  StorageKeyReturnType
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
function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
class GatedLocalStorage extends LocalStorage {
  readonly entered = deferred()
  readonly release = deferred()
  failure: Error | undefined
  public async set<K extends StorageKey>(key: K, value: StorageKeyReturnType[K]): Promise<void> {
    this.entered.resolve()
    await this.release.promise
    if (this.failure) {
      throw this.failure
    }
    return super.set(key, value)
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
    const callback = deferred()
    const message = request(metadata)
    const delivered = jest.fn(() => callback.resolve())

    await IncomingRequestInterceptor.intercept({
      message,
      connectionInfo,
      appMetadataManager,
      interceptorCallback: delivered
    })
    await callback.promise

    expect(metadata).toEqual(expected)
    expect(await appMetadataManager.getAppMetadataList()).toEqual([expected])
    expect(delivered).toHaveBeenCalledWith(message, connectionInfo)
  })

  it('completes only after metadata persistence and callback delivery', async () => {
    const storage = new GatedLocalStorage('incoming-completion')
    const appMetadataManager = new AppMetadataManager(storage)
    const callback = deferred()
    let completed = false
    const interception = IncomingRequestInterceptor.intercept({
      message: request({ senderId: 'dapp', name: 'dapp' }),
      connectionInfo,
      appMetadataManager,
      interceptorCallback: () => callback.resolve()
    })
    interception.then(() => {
      completed = true
    })
    await storage.entered.promise
    await Promise.resolve()
    const completedBeforePersistence = completed
    storage.release.resolve()
    await callback.promise
    await interception

    expect(completedBeforePersistence).toBe(false)
    expect(await appMetadataManager.getAppMetadataList()).toEqual([
      { senderId: 'dapp', name: 'dapp' }
    ])
  })

  it('rejects with the original persistence failure and does not deliver a request', async () => {
    const storage = new GatedLocalStorage('incoming-failure')
    const failure = new Error('metadata write failed')
    storage.failure = failure
    const delivered = jest.fn()
    const interception = IncomingRequestInterceptor.intercept({
      message: request({ senderId: 'dapp', name: 'dapp' }),
      connectionInfo,
      appMetadataManager: new AppMetadataManager(storage),
      interceptorCallback: delivered
    })
    const rejection = expect(interception).rejects.toBe(failure)
    await storage.entered.promise
    storage.release.resolve()

    await rejection
    expect(delivered).not.toHaveBeenCalled()
    expect(await storage.get(StorageKey.APP_METADATA_LIST)).toEqual([])
  })
})
