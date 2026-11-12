import { PermissionEntity } from './PermissionEntity'
import { Notification } from './Notification'
import { Origin } from './Origin'

export type AccountIdentifier = string

export interface AccountInfo extends PermissionEntity {
  accountIdentifier: AccountIdentifier
  senderId: string
  origin: {
    type: Origin
    id: string
  }
  walletKey?: string
  publicKey?: string
  connectedAt: number
  notification?: Notification
  hasVerifiedChallenge?: boolean
  walletType: 'implicit' | 'abstracted_account'
  verificationType?: 'proof_of_event'
}

/** A V3 account whose network and permissions are owned by its blockchain adapter. */
export interface BlockchainAccountInfo extends Omit<
  AccountInfo,
  'network' | 'scopes' | 'walletType'
> {
  network?: undefined
  walletType?: undefined
  scopes: string[]
  chainData: unknown
  /** Older V3 records did not persist the blockchain identifier. */
  blockchainIdentifier?: string
}

export type StoredAccountInfo = AccountInfo | BlockchainAccountInfo
