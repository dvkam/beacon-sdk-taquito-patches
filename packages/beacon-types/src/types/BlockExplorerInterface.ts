import type { Network } from './beacon/Network'

export interface BlockExplorerInterface {
  getAddressLink(address: string, network: Network): Promise<string>
  getTransactionLink(transactionId: string, network: Network): Promise<string>
}
