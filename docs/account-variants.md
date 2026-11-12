# Stored account variants

AccountInfo keeps its existing Tezos V2 shape. BlockchainAccountInfo describes a V3 account with chain-owned scopes and opaque chainData. It has no Tezos network or walletType. StoredAccountInfo is their union.

Client.getAccounts, Client.getAccount, DAppClient.getActiveAccount and setActiveAccount now expose StoredAccountInfo. ACTIVE_ACCOUNT_SET and the account passed to a Blockchain response callback use the same union. This makes an existing runtime distinction visible in TypeScript. Callers that access Tezos fields must narrow first.

```ts
const account = await client.getActiveAccount()
if (account?.network) {
  console.log(account.network.type)
} else if (account) {
  // The blockchain adapter owns account.chainData and account.scopes.
}
```

PERMISSION_REQUEST_SUCCESS keeps its existing flat output for V2. For V3, protocolVersion is '3' and output is the original response envelope, including output.message.blockchainIdentifier and output.message.blockchainData. The V3 event no longer invents a V2 network or empty permissions. Subscribers must narrow protocolVersion before reading protocol-specific output fields. The built-in toast still displays the account address.

AccountManager validates each stored record before exposing it. Invalid records cause an error and remain in storage for diagnosis or recovery. They are not silently removed. Legacy Tezos records without walletType receive the existing implicit default in memory. Legacy V3 records without a blockchainIdentifier remain readable; their chain identifier is unknown. New V3 records retain the actual identifier returned by the wallet.

Validation establishes the account fields used by the SDK. It does not validate the contents of chainData or authenticate a wallet. Chain-owned scope strings cannot grant Tezos V2 permissions merely because their spelling matches a Tezos permission.

V3 permission responses must match the requested blockchain and contain a dense array of string scopes before adapter dispatch. The SDK snapshots the response and copies the protocol request, account and response passed to adapter callbacks. Later callback mutation cannot change the permission-success event selection, granted permissions or returned response.

A blockchain adapter returning no accounts now causes a descriptive error before account storage or selection. Permission request cancellation and rollback continue to own any asynchronous write.
