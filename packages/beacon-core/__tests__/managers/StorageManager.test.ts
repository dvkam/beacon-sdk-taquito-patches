import { LocalStorage } from '../../src'
import { StorageManager } from '../../src/managers/StorageManager'
import {
  AppMetadata,
  Storage,
  StorageKey,
  StorageKeyReturnType,
  defaultValues
} from '@ecadlabs/beacon-types'

class ReferenceStorage extends Storage {
  private readonly values: StorageKeyReturnType = { ...defaultValues }

  public async get<K extends StorageKey>(key: K): Promise<StorageKeyReturnType[K]> {
    return this.values[key]
  }
  public async set<K extends StorageKey>(key: K, value: StorageKeyReturnType[K]): Promise<void> {
    this.values[key] = value
  }
  public async delete<K extends StorageKey>(key: K): Promise<void> {
    this.values[key] = defaultValues[key]
  }
  public async subscribeToStorageChanged(
    _callback: Parameters<Storage['subscribeToStorageChanged']>[0]
  ): Promise<void> {}
  public getPrefixedKey<K extends StorageKey>(key: K): string {
    return key
  }
}

const first = { senderId: 'first', name: 'First' }
const second = { senderId: 'second', name: 'Second' }
const third = { senderId: 'third', name: 'Third' }
const updated = { senderId: 'first', name: 'Updated' }
const matchesFirst = (entry: AppMetadata) => entry.senderId === first.senderId

describe('StorageManager collection operations', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('keeps keyed CRUD, overwrite and removal behavior with LocalStorage', async () => {
    const manager = new StorageManager(
      new LocalStorage('collections'),
      StorageKey.APP_METADATA_LIST
    )
    await expect(manager.getAll()).resolves.toEqual([])
    await manager.addOne(first, matchesFirst)
    await manager.addOne(second, (entry) => entry.senderId === second.senderId)
    await manager.addOne(updated, matchesFirst, false)
    await expect(manager.getOne(matchesFirst)).resolves.toEqual(first)
    await manager.addOne(updated, matchesFirst)
    await expect(manager.getAll()).resolves.toEqual([updated, second])
    await expect(manager.getOne((entry) => entry.senderId === 'missing')).resolves.toBeUndefined()
    await manager.remove(matchesFirst)
    await expect(manager.getAll()).resolves.toEqual([second])
    await manager.removeAll()
    await expect(manager.getAll()).resolves.toEqual([])
  })

  it('mutates additions in place but preserves prior snapshots when removing', async () => {
    const storage = new ReferenceStorage()
    const original = [first, second, first]
    await storage.set(StorageKey.APP_METADATA_LIST, original)
    const manager = new StorageManager(storage, StorageKey.APP_METADATA_LIST)
    await manager.addOne(updated, matchesFirst)
    await manager.addOne(third, (entry) => entry.senderId === third.senderId)
    await expect(manager.getAll()).resolves.toBe(original)
    expect(original).toEqual([updated, second, updated, third])
    await manager.remove(matchesFirst)
    const retained = await manager.getAll()
    expect(retained).not.toBe(original)
    expect(retained).toEqual([second, third])
    expect(retained[0]).toBe(second)
    expect(retained[1]).toBe(third)
    expect(original).toEqual([updated, second, updated, third])
  })

  it('skips sparse entries and ignores appended entries while filtering', async () => {
    const storage = new ReferenceStorage()
    const original: AppMetadata[] = []
    original[1] = first
    original[3] = second
    await storage.set(StorageKey.APP_METADATA_LIST, original)
    const manager = new StorageManager(storage, StorageKey.APP_METADATA_LIST)
    const predicate = jest.fn((entry: AppMetadata) => {
      if (entry === first) {
        original.push(third)
      }
      return false
    })
    await manager.remove(predicate)
    expect(predicate.mock.calls.map(([entry]) => entry)).toEqual([first, second])
    await expect(manager.getAll()).resolves.toEqual([first, second])
  })
})
