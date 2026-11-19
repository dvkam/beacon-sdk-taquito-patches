# Request errors

DAppClient permission, blockchain, operation, signing, broadcast and proof request methods reject with a `BeaconError` subclass. Use `isBeaconError(error)` to narrow an unknown rejection. Within the same tab, existing typed errors retain their identity and unexpected local failures become `UnknownBeaconError` with the original value in `errorData`; invalid V3 permission scopes and mismatched blockchain identifiers become `ParametersInvalidBeaconError`.

This normalization also covers preparation and response processing. It does not add request-error events to failures that did not emit them before. Request-error events continue to carry plain response objects. `isErrorResponse` validates a known error type and string `id`, `version` and `senderId` headers; `isRequestErrorResponse` also validates the optional `errorOrigin` (`wallet` or `local`). Empty string headers remain valid for local failures before admission. An admitted wallet error that omits `senderId` still rejects the request; its normalized sender is an empty string.

Unfamiliar wallet error codes normalize to `UNKNOWN_ERROR` while preserving the
verified request ID, sender, version and trusted origin. The original attributed
response remains in `errorData`, including the unfamiliar code and wallet
diagnostics. The same rule applies to direct responses and leader/follower
forwarding. Known error codes keep their existing event shape, and the raw
response observation still retains the original wallet code.

Delegated preparation failures cross a tab boundary. Cloneable diagnostics are
retained as structured-clone copies. Uncloneable diagnostics become a two-field
summary in `errorData`: `message` contains the original string message when it
can be read, or a generic explanation, and `diagnostic` is
`"Uncloneable request diagnostic"`. Direct requests in the same tab keep the
original diagnostic identity.

Local permission denials and rate limits create typed errors at their admission
checks and keep their existing `NO_PERMISSIONS` or `LOCAL_RATE_LIMIT_REACHED`
events. Unrelated plugin or dependency failures with the same message text remain
`UnknownBeaconError` with their original rejection in `errorData` within the same
tab, or a clone-safe copy or summary when delegated.

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
response during validation. Other unexpected failures keep their original value
within the same tab; delegated preparation failures use the copies or summaries
described above.
