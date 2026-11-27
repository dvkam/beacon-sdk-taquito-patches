import {
  TezosOperationType,
  type PartialTezosOperation,
  type WalletPartialTezosOperation,
  type OperationRequestInput
} from '@ecadlabs/beacon-types'
import {
  packMessageText,
  isPartialTezosOperation,
  inspectSignPayload,
  sanitizePartialTezosOperations,
  type ValidatedWalletPartialTezosOperation,
  type SignPayloadInspection
} from '@ecadlabs/beacon-utils/wallet'
export const preview: SignPayloadInspection = inspectSignPayload(packMessageText('hello'))
export const operations: WalletPartialTezosOperation[] = sanitizePartialTezosOperations([])
export const legacy: PartialTezosOperation[] = operations
export const request: Pick<OperationRequestInput, 'operationDetails'> = {
  operationDetails: operations
}

export const modernOrigination: WalletPartialTezosOperation = {
  kind: TezosOperationType.ORIGINATION,
  balance: '0',
  script: {
    code: [
      { prim: 'parameter', args: [{ prim: 'unit' }] },
      { prim: 'storage', args: [{ prim: 'unit' }] },
      {
        prim: 'code',
        args: [
          [
            { prim: 'UNPAIR' },
            { prim: 'DROP' },
            { prim: 'PUSH', args: [{ prim: 'unit' }, { prim: 'Unit' }] },
            { prim: 'DROP' },
            { prim: 'PUSH', args: [{ prim: 'unit' }, { prim: 'Unit' }] },
            { prim: 'DROP' },
            { prim: 'NIL', args: [{ prim: 'operation' }] },
            { prim: 'PAIR' }
          ]
        ]
      }
    ],
    storage: { prim: 'Unit' }
  }
}
export const modernTicketCall: WalletPartialTezosOperation = {
  kind: TezosOperationType.TRANSACTION,
  amount: '0',
  destination: 'KT1GFkBEDZtngCS737gNgtt6LemG2a8kaifC',
  parameters: {
    entrypoint: 'default',
    value: {
      prim: 'Ticket',
      args: [
        { string: 'KT1GFkBEDZtngCS737gNgtt6LemG2a8kaifC' },
        { prim: 'unit' },
        { prim: 'Unit' },
        { int: '1' }
      ]
    }
  }
}
export const modernLegacy: PartialTezosOperation[] = [modernOrigination, modernTicketCall]

const delegationWithMetadata = {
  kind: TezosOperationType.DELEGATION,
  metadata: { label: 'untrusted' }
} satisfies WalletPartialTezosOperation & { metadata: { label: string } }
export const structuralOperation: WalletPartialTezosOperation = delegationWithMetadata

type ValidatedOperation = typeof isPartialTezosOperation extends (
  value: unknown
) => value is infer Operation
  ? Operation
  : never
// @ts-expect-error A structural operation has not passed the strict guard.
export const unvalidatedOperation: ValidatedOperation = structuralOperation

export const narrowOperation = (value: WalletPartialTezosOperation | string) => {
  if (isPartialTezosOperation(value)) {
    const operation: WalletPartialTezosOperation = value
    const operationRequest: Pick<OperationRequestInput, 'operationDetails'> = {
      operationDetails: [value]
    }
    return { operation, operationRequest }
  }
  // @ts-expect-error Rejected base operations remain possible in the false branch.
  value.toUpperCase()
  return value
}

export const checkSpread = (value: unknown): void => {
  if (isPartialTezosOperation(value)) {
    const copy = { ...value, metadata: 'untrusted' }
    // @ts-expect-error A fresh object must pass the guard before it carries validation evidence.
    const validated: ValidatedWalletPartialTezosOperation = copy
    void validated
  }
}
