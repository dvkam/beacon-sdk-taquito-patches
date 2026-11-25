# Request errors

## Update existing callers

If you used a prerelease that accepted envelope metadata as the only argument to
`TransactionInvalidBeaconError`, change that call to
`new TransactionInvalidBeaconError(undefined, options)`. This also applies to
apps that import the class through `@taquito/beacon-wallet` when they adopt this
Beacon release. The first argument supplies transaction data, including objects
with fields such as `id`. Pass the envelope metadata second.

```ts
const error = new TransactionInvalidBeaconError(rpcData, {
  id: requestId,
  senderId: walletSenderId,
  version: '2',
  errorOrigin: 'wallet'
})
```

Other Beacon error constructors still accept options as their first argument.
`getError(BeaconErrorType.TRANSACTION_INVALID_ERROR)` leaves both `data` and
`errorData` undefined.

Ordinary request-error events expose `WireRequestErrorResponse`, whose `errorType`
is a string because a wallet can introduce codes this SDK does not know. Use
`isRequestErrorResponse(event.errorResponse)` before indexing a
`Record<BeaconErrorType, Handler>`. To handle an unfamiliar code as a typed
error, call `toBeaconError(event.errorResponse)`.

`isErrorResponse` and `isRequestErrorResponse` now require a known code and
string `id`, `version` and `senderId` headers. For the original code in an
ordinary request-error event, read the wire response directly.

## Request rejection and event behavior

DAppClient permission, blockchain, operation, signing, broadcast and proof request methods reject with a `BeaconError` subclass. Use `isBeaconError(error)` to narrow an unknown rejection. Within the same tab, existing typed errors retain their identity and unexpected local failures become `UnknownBeaconError` with the original value in `errorData`; invalid V3 permission scopes and mismatched blockchain identifiers become `ParametersInvalidBeaconError`.

This normalization also covers preparation and response processing. The existing
event emission rules apply to normalized errors, and request-error events carry
plain response objects. `isRequestErrorResponse` also
validates the optional `errorOrigin`, which can be `wallet` or `local`. Empty
string headers remain valid for local failures before admission. An admitted
wallet error that omits `senderId` still rejects the request and uses an empty
string as its normalized sender.

An unset origin can be omitted or explicitly undefined. Check its value even when
the property is present.

The response guards return false if field inspection throws. A local error can
still have empty metadata before admission. When forwarding that error to a
follower, Beacon supplies version `2` if its version is empty so the terminal
reply passes incoming routing. The original local error remains unchanged.

Unfamiliar nonempty wallet error codes and their existing `errorData` pass through
plain request-error events and leader/follower forwarding. Public request methods
still reject with `UnknownBeaconError` for those codes. The response guards reject
unfamiliar codes because they cannot narrow them to the SDK's known error enum.

For a late error, `LATE_RESPONSE_RECEIVED.error` remains a `RequestErrorResponse`
with a known enum code. An unfamiliar code becomes `UNKNOWN_ERROR` in that derived
field. The event's `message` keeps the original code and both fields retain the
original diagnostic data. Origin attribution applies to both fields.

A delegated preparation failure crosses a tab boundary. Beacon sends a detached
copy of JSON data so that the localStorage fallback can encode the same reply as
the native channel. Plain objects with string data fields, arrays, strings,
booleans, null and numbers that round-trip through JSON retain their values. If the diagnostic
would change or fail during encoding, including a Map, Set, BigInt, cycle or
callback, the follower receives a summary in `errorData`. Its `diagnostic`
field is `"Uncloneable request diagnostic"`. Its `message` contains up to
256 UTF-16 code units from an own string `message` data property, including a
normal Error instance's message, or a generic explanation. Forwarding reads data
descriptors and does not invoke `toJSON` or property getters. Accessor messages
use the generic explanation. A same-tab caller keeps the original diagnostic by
identity.

V3 wallet errors and delegated preparation errors settle without looking up peer
metadata. If that lookup fails while processing a V3 success response, the
request rejects with a local `UnknownBeaconError` carrying the storage or wallet
lookup failure. Permission preparation stops before storing an account or
reporting success.

Local permission denials and rate limits create typed errors at their admission
checks and keep their existing `NO_PERMISSIONS` or `LOCAL_RATE_LIMIT_REACHED`
events. Unrelated plugin or dependency failures with the same message text remain
`UnknownBeaconError` with their original rejection in `errorData` within the same
tab, or a JSON copy or summary when delegated.

Malformed V3 permission responses carry the offending scopes or blockchain
identifier in errorData. Their errorOrigin is local because the SDK rejects the
response during validation. Other unexpected failures keep their original value
within the same tab; delegated preparation failures use the copies or summaries
described above.
