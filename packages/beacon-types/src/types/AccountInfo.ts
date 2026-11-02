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

/** A chain-owned V3 account as persisted by the DApp permission flow. */
export interface BlockchainAccountInfo extends Omit<
  AccountInfo,
  'network' | 'scopes' | 'walletType'
> {
  network?: undefined
  walletType?: undefined
  scopes: string[]
  chainData: unknown
}

export type StoredAccountInfo = AccountInfo | BlockchainAccountInfo
