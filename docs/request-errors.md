# Request errors

DAppClient permission, blockchain, operation, signing, broadcast and proof request methods reject with a `BeaconError` subclass. Use `isBeaconError(error)` to narrow an unknown rejection. Existing typed errors retain their identity. Unexpected local failures become `UnknownBeaconError`, with the original value in `errorData`; invalid V3 permission scopes and mismatched blockchain identifiers become `ParametersInvalidBeaconError`.

This normalization also covers preparation and response processing. It does not add request-error events to failures that did not emit them before. Request-error events continue to carry plain wire objects. `isErrorResponse` validates a known error type and string `id`, `version` and `senderId` headers; `isRequestErrorResponse` also validates the optional `errorOrigin` (`wallet` or `local`). Empty string headers remain valid for local failures before admission.

`TransactionInvalidBeaconError` preserves its first argument as transaction data. Pass envelope metadata as the second argument so RPC payload fields such as `id` cannot be mistaken for a Beacon request ID:

```ts
const error = new TransactionInvalidBeaconError(rpcData, {
  id: requestId,
  senderId: walletSenderId,
  version: '2',
  errorOrigin: 'wallet'
})
```

For metadata without transaction data, use `new TransactionInvalidBeaconError(undefined, options)`. Replace any options-only single-argument calls with this explicit form. Other Beacon error constructors still accept options as their first argument. `getError(BeaconErrorType.TRANSACTION_INVALID_ERROR)` leaves both `data` and `errorData` undefined.

## Prerelease migration

The options-only constructor form shipped in 4.9.0-ecad-beta.4 and beta.5.
A single object passed to TransactionInvalidBeaconError is now always transaction
data, including objects that contain option-like fields. To set metadata without
data, pass undefined first and options second. Taquito re-exports this class from
@taquito/beacon-wallet, so applications using that export need the same migration
when they adopt this Beacon release.

Malformed V3 permission responses carry the offending scopes or blockchain
identifier in errorData. Their errorOrigin is local because the SDK rejects the
response during validation. Other unexpected failures keep their original value.
