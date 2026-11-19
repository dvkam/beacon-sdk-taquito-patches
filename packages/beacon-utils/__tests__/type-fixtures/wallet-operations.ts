import { managerOperations } from './manager-operations'
import {
  PartialTezosOperation,
  WalletPartialTezosOperation,
  TezosOperationType,
  OperationRequestInput
} from '@ecadlabs/beacon-types'
import { sanitizePartialTezosOperations } from '@ecadlabs/beacon-utils/wallet'

export const operations: WalletPartialTezosOperation[] = sanitizePartialTezosOperations([])
export const legacy: PartialTezosOperation[] = operations
export const request: Pick<OperationRequestInput, 'operationDetails'> = {
  operationDetails: operations
}
export const timeout: WalletPartialTezosOperation = {
  kind: TezosOperationType.SMART_ROLLUP_TIMEOUT,
  rollup: 'sr1rollup',
  stakers: { alice: 'tz1alice', bob: 'tz1bob' }
}
export const legacyTimeout: PartialTezosOperation = timeout
export const spoofed: WalletPartialTezosOperation = {
  kind: TezosOperationType.DELEGATION,
  // @ts-expect-error The wallet supplies source; the dApp cannot supply it here.
  source: 'tz1spoof'
}
export const consensus: WalletPartialTezosOperation = {
  // @ts-expect-error Consensus operations are outside the wallet manager subset.
  kind: TezosOperationType.ENDORSEMENT,
  level: 1
}

export const fixtureLegacy: PartialTezosOperation[] = managerOperations
