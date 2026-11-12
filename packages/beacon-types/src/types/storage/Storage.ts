import { StorageKey } from './StorageKey'
import { StorageKeyReturnType } from './StorageKeyReturnType'

/** Change values use the same serialized representation as browser localStorage. */
export interface StorageChangeEvent {
  eventType: 'storageCleared' | 'entryModified'
  /** The physical storage key, including any configured prefix. */
  key: string | null
  oldValue: string | null
  newValue: string | null
}

/** Return values are ignored. Adapters must observe asynchronous listener failures. */
export type StorageChangeListener = (event: StorageChangeEvent) => unknown

/**
 * @internalapi
 *
 * The storage used in the SDK
 */
export abstract class Storage {
  /**
   * Returns a promise that resolves to true if the storage option is available on this platform.
   */
  public static isSupported(): Promise<boolean> {
    return Promise.resolve(false)
  }

  /**
   * Gets a value from storage and returns it
   *
   * @param key The storage key
   */
  public abstract get<K extends StorageKey>(key: K): Promise<StorageKeyReturnType[K]>

  /**
   * Sets a value in the storage and persist it
   *
   * @param key The storage key
   * @param value The value to be persisted
   */
  public abstract set<K extends StorageKey>(key: K, value: StorageKeyReturnType[K]): Promise<void>

  /**
   * Delete a key from storage
   *
   * @param key The storage key
   */
  public abstract delete<K extends StorageKey>(key: K): Promise<void>

  /**
   * Subscribe to changes made by other contexts. Resolves after registration.
   * Backends without external-change notifications reject the subscription;
   * their read and write operations remain available.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Keep the callback argument for Storage compatibility.
  public subscribeToStorageChanged(_callback: StorageChangeListener): Promise<void> {
    return Promise.reject(new Error('This storage backend does not support change notifications.'))
  }

  /**
   * Get the key with the internal prefix
   *
   * @param key the storage key
   */
  public abstract getPrefixedKey<K extends StorageKey>(key: K): string
}
