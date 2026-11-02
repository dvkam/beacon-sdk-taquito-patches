import type { BeaconMessageEnvelopeV3, BeaconRequestOutputMessage } from '@ecadlabs/beacon-types'

/** Wallet requests include V2 outputs and V3 envelopes with opaque chain payloads. */
export type WalletRequestOutputMessage = BeaconRequestOutputMessage | BeaconMessageEnvelopeV3
