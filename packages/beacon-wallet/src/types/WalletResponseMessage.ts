import type {
  BeaconMessage,
  BeaconMessageEnvelopeV3,
  BeaconResponseInputMessage,
  BlockchainMessage
} from '@ecadlabs/beacon-types'

type FlatV3ResponseInput = BlockchainMessage & Pick<BeaconMessageEnvelopeV3, 'id'>

/** V3 responses retain the existing flat and wrapped pass-through forms. */
export type WalletResponseInputMessage =
  BeaconResponseInputMessage | BeaconMessageEnvelopeV3 | FlatV3ResponseInput

/** V2 outputs are enriched; V3 values are forwarded without added headers. */
export type WalletResponseOutputMessage = BeaconMessage | WalletResponseInputMessage
