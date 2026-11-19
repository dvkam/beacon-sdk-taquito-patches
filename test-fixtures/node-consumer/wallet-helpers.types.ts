import { TezosOperationType } from '@ecadlabs/beacon-types'
import {
  packMessageText,
  inspectSignPayload,
  sanitizePartialTezosOperations,
  type SignPayloadInspection
} from '@ecadlabs/beacon-utils/wallet'
import type {
  PartialTezosOperation,
  WalletPartialTezosOperation,
  OperationRequestInput
} from '@ecadlabs/beacon-types'
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
