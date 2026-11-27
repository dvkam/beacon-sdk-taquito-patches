import {
  encodeTzip10RawPayload,
  inspectSignPayload,
  sanitizePartialTezosOperations,
  type SignPayloadInspection
} from '@ecadlabs/beacon-utils/wallet'
import type {
  PartialTezosOperation,
  WalletPartialTezosOperation,
  OperationRequestInput
} from '@ecadlabs/beacon-types'
export const preview: SignPayloadInspection = inspectSignPayload(encodeTzip10RawPayload('hello'))
export const operations: WalletPartialTezosOperation[] = sanitizePartialTezosOperations([])
export const legacy: PartialTezosOperation[] = operations
export const request: Pick<OperationRequestInput, 'operationDetails'> = {
  operationDetails: operations
}
