# Wallet request helpers

Wallets can opt into these helpers from `@ecadlabs/beacon-utils/wallet`. The root utility, SDK and wallet-client
entrypoints do not load these helpers or the codec. Receiving a request still behaves as before; the SDK
does not automatically validate or rewrite requests.

## Install the optional codec

Only the wallet subpath needs `@taquito/michel-codec`. It is an optional peer,
so installing Beacon alone does not install the codec or `@taquito/core`.
The root utility, SDK and wallet-client entrypoints work without it.

The supported range is `^25.1.1 || ^25.2.0-beta3`. It covers stable 25.x releases
from 25.1.1 and the 25.2.0 prereleases from beta3, and excludes 26.x.
The installed-consumer checks exercise 25.1.1 and 25.2.0-beta3.
An application must provide a compatible codec before importing the wallet
subpath. Taquito applications can reuse their compatible installed version.
Applications without it can install the tested stable version:

```sh
npm install @taquito/michel-codec@25.1.1
```

Importing the wallet subpath without its peer reports a missing-codec module error.

## Operations

`WalletPartialTezosOperation` is exported by `@ecadlabs/beacon-types`.
`isPartialTezosOperation(value)` checks its supported shapes, rejects unknown
properties, and rejects dApp-supplied `source`, `fee` and `counter`.

`sanitizePartialTezosOperations(operations)` creates a fresh array and nested
objects. It removes unknown properties and `source`, `fee` and `counter`.
`gas_limit` and `storage_limit` survive only as canonical nonnegative integer
strings, such as `"0"` or `"100"`; numbers, signs, whitespace, fractions and
leading zeroes are removed. Required invalid fields reject the whole call with
the original batch index. No operation is silently removed.

```ts
import { sanitizePartialTezosOperations } from '@ecadlabs/beacon-utils/wallet'

const operations = sanitizePartialTezosOperations(request.operationDetails)
// Continue the wallet's address checks, estimation, preview and approval flow.
```

Supported kinds are `transaction`, `origination`, `delegation`, `reveal`,
`set_deposits_limit`, `register_global_constant`, `transfer_ticket`,
`increase_paid_storage`, `update_companion_key`, `smart_rollup_originate`,
`smart_rollup_add_messages`, `smart_rollup_execute_outbox_message`,
`smart_rollup_publish`, `smart_rollup_cement`, `smart_rollup_recover_bond`,
`smart_rollup_refute`, `smart_rollup_timeout`, and `dal_publish_commitment`.
The legacy broad operation union remains available; its timeout alias now points
to the existing timeout interface, so sanitized output fits existing request types.

These are structural checks against Beacon's operation types. They do not check
address checksums, keys or proof cryptography, Michelson execution, current
protocol availability, fees, permissions, or the user's intent. Consensus,
evidence, governance and other operation kinds are rejected. Nested objects and
arrays have a maximum validation depth of 64. Micheline names must exist in the
installed codec's tag inventory. This includes instruction, type and data names;
the check does not validate each primitive's arity or Michelson semantics.
Micheline integers retain accepted decimal spellings such as "01" or "-0"; the
codec and node canonicalize them when encoding. Canonical spelling is required
only for the manager amounts and optional gas/storage limits described above.
The existing PVM and refutation enums are public exports for constructing the
advanced manager variants.

The shared Micheline wire type accepts string names so new protocol names can
be represented without updating Beacon's type inventory. The existing
MichelsonPrimitives export remains available for compatibility; it does not
define the validator's accepted names. Constructing a typed operation does not
replace runtime validation.

## Signing bytes

`packMessageText(text)` packs the exact supplied UTF-8 text as
`0501` + four-byte byte length + UTF-8 bytes. It preserves a leading Unicode BOM
and rejects lone surrogates. It does not prepend text or invent a domain, nonce
or expiry. The caller supplies those values.

```ts
import { packMessageText, inspectSignPayload } from '@ecadlabs/beacon-utils/wallet'
import { SigningType } from '@ecadlabs/beacon-types'

const payload = packMessageText('Tezos Signed Message: example.org hello')
const preview = inspectSignPayload(payload, SigningType.MICHELINE)
```

`inspectSignPayload(payload, signingType?)` accepts nonempty, even-length hex,
with an optional `0x` prefix, and returns lowercase `normalizedHex` on success.
It does not guess whether RAW text should be encoded as UTF-8. Inputs are capped
at 1 MiB of encoded bytes.

The `kind` describes recognized bytes; it does not change the requested signing
type. Canonical packed data, including RAW requests, produces `micheline` or
`signed_message_text` with `validation: 'canonical_micheline'`. Only a top-level string
starting with `Tezos Signed Message: ` gets the latter label. This is a display
convention, not proof of authentication, domain binding or replay protection.
The decoded string is available as `decodedText`.

An `operation` result has `validation: 'watermark_only'`: it checks the `03`
prefix and presence of following bytes. It does not parse a branch, operation
contents, a signature or their protocol validity. A RAW request can also expose
this operation hint. Other RAW bytes have `kind: 'raw_bytes'` and
`validation: 'hex'`. A malformed `05` payload can remain raw bytes only when RAW
was explicitly requested; an explicit MICHELINE request rejects it.

`valid: false` means invalid **or unsupported**, not proof that the bytes are
malformed. The public decoder in `@taquito/michel-codec` 25.1.1 strips leading
BOMs from nested strings, so exact canonical validation conservatively rejects
those values. For example, `0502000000090100000004efbbbf61` is a valid sequence
containing `"\uFEFFa"` but returns an unsupported/noncanonical result. Top-level
strings have a narrow UTF-8 correction and preserve their BOM. Other codec errors
and noncanonical/trailing bytes are rejected.

The helpers have a separate public entrypoint so applications that use only
the existing utility, SDK, dApp or wallet-client entrypoints do not load the codec.
Applications opting into the helpers include the codec in that module's bundle.
The packed browser test exercises this entrypoint independently of the default
SDK bundle.

## Sources

[TZIP-10](https://gitlab.com/tezos/tzip/-/blob/master/proposals/tzip-10/tzip-10.md)
defines the wallet interaction messages and arbitrary signing payloads. It does
not define the signed-message text prefix or an authentication format.
[Beacon's signing guide](https://docs.walletbeacon.io/guides/sign-payload/)
provides the `05` packed-string, `03` operation and RAW conventions used here.

[Octez's Micheline guide](https://octez.tezos.com/docs/shell/micheline.html)
describes the wire expression format and protocol-specific primitive vocabulary.
