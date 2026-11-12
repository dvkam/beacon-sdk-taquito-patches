import {
  Storage,
  StorageChangeListener,
  StorageKey,
  StorageKeyReturnType
} from '@ecadlabs/beacon-types'
import { Logger } from '../utils/Logger'
import { normalizeStoredValue } from './storage-normalization'

const logger = new Logger('LocalStorage')

/**
 * @internalapi
 *
 * A storage that can be used in the browser
 */
export class LocalStorage extends Storage {
  constructor(private readonly prefix?: string) {
    super()
  }
  public static async isSupported(): Promise<boolean> {
    return Promise.resolve(Boolean(typeof window !== 'undefined') && Boolean(window.localStorage))
  }

  public async get<K extends StorageKey>(key: K): Promise<StorageKeyReturnType[K]> {
    const value = localStorage.getItem(this.getPrefixedKey(key))

    return normalizeStoredValue(key, value)
  }

  public async set<K extends StorageKey>(key: K, value: StorageKeyReturnType[K]): Promise<void> {
    if (value === undefined) {
      return this.delete(key)
    }

    if (typeof value === 'string') {
      return localStorage.setItem(this.getPrefixedKey(key), value)
    } else {
      return localStorage.setItem(this.getPrefixedKey(key), JSON.stringify(value))
    }
  }

  public async delete<K extends StorageKey>(key: K): Promise<void> {
    return Promise.resolve(localStorage.removeItem(this.getPrefixedKey(key)))
  }

  public async subscribeToStorageChanged(callback: StorageChangeListener): Promise<void> {
    const storageArea = window.localStorage
    window.addEventListener('storage', (event) => {
      if (event.storageArea !== storageArea) {
        return
      }
      if (
        event.key !== null &&
        this.prefix &&
        !Object.values(StorageKey).some((key) => this.getPrefixedKey(key) === event.key)
      ) {
        return
      }
      try {
        const result = callback({
          eventType: event.key === null ? 'storageCleared' : 'entryModified',
          key: event.key,
          oldValue: event.oldValue,
          newValue: event.newValue
        })
        Promise.resolve(result).catch((error: unknown) =>
          logger.warn('storage change callback', error)
        )
      } catch (error: unknown) {
        logger.warn('storage change callback', error)
      }
    })
  }

  public getPrefixedKey(key: string): string {
    return this.prefix ? `${this.prefix}-${key}` : key
  }
}
