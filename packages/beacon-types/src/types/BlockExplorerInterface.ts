import type { Network } from './beacon/Network'
import type { NetworkType } from './beacon/NetworkType'

export interface BlockExplorerInterface {
  readonly rpcUrls: Partial<Record<NetworkType, string>>
  getAddressLink(address: string, network: Network): Promise<string>
  getTransactionLink(transactionId: string, network: Network): Promise<string>
}
