import {
  PermissionScope,
  AccountIdentifier,
  Origin,
  Network,
  StorageKey,
  Storage
} from '@ecadlabs/beacon-types'

export interface AccountInfoOld {
  accountIdentifier: AccountIdentifier
  beaconId: string
  origin: {
    type: Origin
    id: string
  }
  address: string
  pubkey: string
  network: Network
  scopes: PermissionScope[]
  connectedAt: Date
}

export interface P2PPairingRequestOld {
  name: string
  pubKey: string
  relayServer: string
}

export const migrate_0_7_0 = async (storage: Storage): Promise<void> => {
  // Migrate AccountInfo
  const accountInfos = await storage.get(StorageKey.ACCOUNTS)
  accountInfos.forEach((accountInfo) => {
    // pubkey is now publicKey
    if ('pubkey' in accountInfo) {
      const legacyKey = accountInfo.pubkey
      if (typeof legacyKey === 'string' && legacyKey) {
        accountInfo.publicKey = legacyKey
        const legacyAccount: { pubkey?: unknown } = accountInfo
        delete legacyAccount.pubkey
      }
    }
    // connectedAt is now a number
    accountInfo.connectedAt = new Date(accountInfo.connectedAt).getTime()
  })
  await storage.set(StorageKey.ACCOUNTS, accountInfos)

  // Migrate P2PPeers
  const P2PPairingRequests = await storage.get(StorageKey.TRANSPORT_P2P_PEERS_DAPP)
  P2PPairingRequests.forEach((p2pPairInfo) => {
    // pubKey is now publicKey
    if ('pubKey' in p2pPairInfo) {
      const legacyKey = p2pPairInfo.pubKey
      if (typeof legacyKey === 'string' && legacyKey) {
        p2pPairInfo.publicKey = legacyKey
        const legacyPeer: { pubKey?: unknown } = p2pPairInfo
        delete legacyPeer.pubKey
      }
    }
  })
  await storage.set(StorageKey.TRANSPORT_P2P_PEERS_DAPP, P2PPairingRequests)

  await storage.set(StorageKey.BEACON_SDK_VERSION, '0.7.0')
}
