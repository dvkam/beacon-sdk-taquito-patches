import {
  StorageKey,
  Storage,
  StorageKeyReturnType,
  AccountInfo,
  defaultValues,
  Origin,
  NetworkType,
  PermissionScope
} from '@ecadlabs/beacon-types'
import { LocalStorage } from '../../src/storage/LocalStorage'
import { migrate_0_7_0 } from '../../src/migrations/migrate-0.7.0'

const accountDetails = {
  accountIdentifier: 'account',
  beaconId: 'legacy-beacon',
  origin: { type: Origin.P2P, id: 'peer' },
  address: 'tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb',
  network: { type: NetworkType.MAINNET },
  scopes: [PermissionScope.OPERATION_REQUEST],
  extra: { keep: 'account-data' }
}

describe('0.7.0 storage migration', () => {
  let storage: LocalStorage

  beforeEach(() => {
    localStorage.clear()
    storage = new LocalStorage('legacy-migration')
  })

  afterEach(() => localStorage.clear())

  const seed = (key: StorageKey, records: unknown[]): void => {
    localStorage.setItem(storage.getPrefixedKey(key), JSON.stringify(records))
  }

  it('renames legacy keys, converts the stored date and preserves other fields', async () => {
    seed(StorageKey.ACCOUNTS, [
      {
        ...accountDetails,
        pubkey: 'edpk-legacy',
        publicKey: 'replaced-account-key',
        connectedAt: '2020-01-01T00:00:00.000Z'
      }
    ])
    seed(StorageKey.TRANSPORT_P2P_PEERS_DAPP, [
      {
        name: 'Legacy wallet',
        pubKey: 'peer-legacy',
        publicKey: 'replaced-peer-key',
        relayServer: 'relay.example',
        extra: ['peer-data']
      }
    ])

    await migrate_0_7_0(storage)

    await expect(storage.get(StorageKey.ACCOUNTS)).resolves.toEqual([
      {
        ...accountDetails,
        publicKey: 'edpk-legacy',
        connectedAt: 1577836800000
      }
    ])
    await expect(storage.get(StorageKey.TRANSPORT_P2P_PEERS_DAPP)).resolves.toEqual([
      {
        name: 'Legacy wallet',
        publicKey: 'peer-legacy',
        relayServer: 'relay.example',
        extra: ['peer-data']
      }
    ])
    await expect(storage.get(StorageKey.BEACON_SDK_VERSION)).resolves.toBe('0.7.0')
  })

  it.each([42, { invalid: 'key' }])(
    'does not promote a non-string legacy key',
    async (legacyKey) => {
      seed(StorageKey.ACCOUNTS, [
        {
          ...accountDetails,
          publicKey: 'account-current',
          pubkey: legacyKey,
          connectedAt: 1577836800000
        }
      ])
      seed(StorageKey.TRANSPORT_P2P_PEERS_DAPP, [
        {
          name: 'Wallet',
          publicKey: 'peer-current',
          pubKey: legacyKey,
          relayServer: 'relay.example'
        }
      ])

      await migrate_0_7_0(storage)

      await expect(storage.get(StorageKey.ACCOUNTS)).resolves.toEqual([
        {
          ...accountDetails,
          publicKey: 'account-current',
          pubkey: legacyKey,
          connectedAt: 1577836800000
        }
      ])
      await expect(storage.get(StorageKey.TRANSPORT_P2P_PEERS_DAPP)).resolves.toEqual([
        {
          name: 'Wallet',
          publicKey: 'peer-current',
          pubKey: legacyKey,
          relayServer: 'relay.example'
        }
      ])
    }
  )
  it.each([undefined, ''])(
    'preserves modern records and an empty legacy key',
    async (legacyKey) => {
      const account = {
        ...accountDetails,
        senderId: 'sender',
        walletType: 'implicit',
        publicKey: 'account-current',
        connectedAt: 1577836800000,
        ...(legacyKey === undefined ? {} : { pubkey: legacyKey })
      }
      const peer = {
        name: 'Wallet',
        id: 'peer',
        version: '3',
        senderId: 'sender',
        publicKey: 'peer-current',
        relayServer: 'relay.example',
        extra: ['peer-data'],
        ...(legacyKey === undefined ? {} : { pubKey: legacyKey })
      }
      seed(StorageKey.ACCOUNTS, [account])
      seed(StorageKey.TRANSPORT_P2P_PEERS_DAPP, [peer])

      await migrate_0_7_0(storage)

      await expect(storage.get(StorageKey.ACCOUNTS)).resolves.toEqual([account])
      await expect(storage.get(StorageKey.TRANSPORT_P2P_PEERS_DAPP)).resolves.toEqual([peer])
      await expect(storage.get(StorageKey.BEACON_SDK_VERSION)).resolves.toBe('0.7.0')
    }
  )
  it('captures a legacy accessor once and preserves strict own-property deletion failure', async () => {
    const account: AccountInfo = {
      ...accountDetails,
      senderId: 'sender',
      walletType: 'implicit',
      publicKey: 'account-current',
      connectedAt: 1577836800000
    }
    let reads = 0
    Object.defineProperty(account, 'pubkey', {
      configurable: false,
      get: () => (++reads === 1 ? 'captured-key' : { invalid: 'key' })
    })
    const values: StorageKeyReturnType = { ...defaultValues, [StorageKey.ACCOUNTS]: [account] }
    const referenceStorage: Storage = {
      get: async (key) => values[key],
      set: async (key, value) => {
        values[key] = value
      },
      delete: async (key) => {
        values[key] = defaultValues[key]
      },
      subscribeToStorageChanged: async () => undefined,
      getPrefixedKey: (key) => key
    }

    await expect(migrate_0_7_0(referenceStorage)).rejects.toBeInstanceOf(TypeError)

    expect(reads).toBe(1)
    expect(account.publicKey).toBe('captured-key')
    expect(Object.getOwnPropertyDescriptor(account, 'pubkey')?.configurable).toBe(false)
    expect(values[StorageKey.ACCOUNTS][0]).toBe(account)
  })
})
