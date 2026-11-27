import { isPartialTezosOperation } from '@ecadlabs/beacon-utils/wallet'

export const acceptedOperations = (rows: unknown[]) => rows.filter(isPartialTezosOperation)
export const acceptedOperation = (value: unknown) => {
  if (isPartialTezosOperation(value)) return value
  return undefined
}
