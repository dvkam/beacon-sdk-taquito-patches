import { StorageKey } from '@ecadlabs/beacon-types'
import { ChromeStorage } from '../../src/storage/ChromeStorage'
import { LocalStorage } from '../../src/storage/LocalStorage'
import { Logger } from '../../src/utils/Logger'

beforeEach(() => {
  vi.spyOn(window, 'addEventListener')
})

afterEach(() => {
  for (const [type, listener] of vi.mocked(window.addEventListener).mock.calls) {
    if (type === 'storage') window.removeEventListener(type, listener)
  }
  vi.restoreAllMocks()
})

function emit(key: string | null, storageArea: globalThis.Storage = localStorage): void {
  window.dispatchEvent(
    new StorageEvent('storage', {
      key,
      oldValue: key === null ? null : 'old',
      newValue: key === null ? null : 'new',
      storageArea
    })
  )
}

it('keeps prefixed physical keys and isolates storage areas and namespaces', async () => {
  const listener = vi.fn()
  await new LocalStorage('app').subscribeToStorageChanged(listener)
  emit(`other-${StorageKey.ACTIVE_ACCOUNT}`)
  emit(`app-nested-${StorageKey.ACTIVE_ACCOUNT}`)
  emit(`app-${StorageKey.ACTIVE_ACCOUNT}`, sessionStorage)
  emit(null, sessionStorage)
  emit(`app-${StorageKey.ACTIVE_ACCOUNT}`)
  emit(null)
  expect(listener.mock.calls).toEqual([
    [
      {
        eventType: 'entryModified',
        key: `app-${StorageKey.ACTIVE_ACCOUNT}`,
        oldValue: 'old',
        newValue: 'new'
      }
    ],
    [{ eventType: 'storageCleared', key: null, oldValue: null, newValue: null }]
  ])
})

it('treats the empty key as an entry change rather than clearing storage', async () => {
  const listener = vi.fn()
  await new LocalStorage().subscribeToStorageChanged(listener)
  emit('')
  expect(listener).toHaveBeenCalledExactlyOnceWith({
    eventType: 'entryModified',
    key: '',
    oldValue: 'old',
    newValue: 'new'
  })
})

it.each(['throw', 'reject'] as const)(
  'reports a listener %s once without preventing later notifications',
  async (failure) => {
    const error = new Error('listener failed')
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    let calls = 0
    await new LocalStorage().subscribeToStorageChanged(() => {
      if (++calls > 1) return { legacyReturn: true }
      if (failure === 'throw') throw error
      return Promise.reject(error)
    })
    emit(StorageKey.ACTIVE_ACCOUNT)
    emit(StorageKey.ACCOUNTS)
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledExactlyOnceWith('storage change callback', error)
    )
    expect(calls).toBe(2)
  }
)

it('rejects unsupported Chrome subscriptions without requiring a browser API', async () => {
  await expect(new ChromeStorage().subscribeToStorageChanged(() => {})).rejects.toThrow(
    'does not support change notifications'
  )
})
