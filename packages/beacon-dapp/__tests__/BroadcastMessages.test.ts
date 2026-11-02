import {
  BeaconMessageType,
  NetworkType,
  Origin,
  PermissionScope,
  SigningType,
  BeaconErrorType
} from '@ecadlabs/beacon-types'
import {
  parseBroadcastResponse,
  parseDelegatedRequest,
  delegatedErrorResponse
} from '../src/dapp-client/broadcast-messages'

const headers = { id: 'request', version: '2', senderId: 'wallet' }
const context = { origin: Origin.WALLETCONNECT, id: 'peer' }
const permission = {
  ...headers,
  type: BeaconMessageType.PermissionResponse,
  appMetadata: { senderId: 'wallet', name: 'Wallet' },
  network: { type: NetworkType.MAINNET },
  scopes: [PermissionScope.SIGN],
  pubkey: 'legacy-public-key'
}
function packet(message: unknown) {
  return { type: 'RESPONSE', data: { message, connectionInfo: context } }
}

it.each([BeaconMessageType.PermissionResponse, BeaconMessageType.ChangeAccountRequest])(
  'normalizes the established legacy wallet default without mutating input: %s',
  (type) => {
    const input = { ...permission, type, pubKey: 'other-legacy-key', extra: { retained: true } }
    const parsed = parseBroadcastResponse(packet(input))
    expect(parsed?.message).toEqual({ ...input, walletType: 'implicit' })
    expect(input).not.toHaveProperty('walletType')
    expect(parsed?.message).not.toBe(input)
  }
)

it('retains complete V2 response variants and opaque error details', () => {
  const messages = [
    { type: BeaconMessageType.OperationResponse, transactionHash: 'operation' },
    {
      type: BeaconMessageType.SignPayloadResponse,
      signingType: SigningType.RAW,
      signature: 'signature'
    },
    { type: BeaconMessageType.BroadcastResponse, transactionHash: 'broadcast' },
    {
      type: BeaconMessageType.ProofOfEventChallengeResponse,
      payloadHash: 'hash',
      isAccepted: true
    },
    {
      type: BeaconMessageType.SimulatedProofOfEventChallengeResponse,
      operationsList: 'encoded',
      errorMessage: ''
    },
    {
      type: BeaconMessageType.Error,
      errorType: BeaconErrorType.ABORTED_ERROR,
      errorData: { opaque: [7] }
    },
    { type: BeaconMessageType.Acknowledge },
    { type: BeaconMessageType.Disconnect }
  ]
  for (const fields of messages) {
    const message = { ...headers, ...fields, diagnostic: 'preserved' }
    expect(parseBroadcastResponse(packet(message))?.message).toEqual(message)
  }
})

it('rejects malformed response fields instead of claiming a complete permission response', () => {
  const invalid = [
    { ...permission, network: null },
    { ...permission, network: { type: 'invented' } },
    { ...permission, scopes: ['sign', 1] },
    { ...permission, scopes: Array(1) },
    { ...permission, appMetadata: { name: 'Wallet' } },
    { ...permission, threshold: { amount: '1', timeframe: 2 } },
    { ...permission, notification: { version: 1, apiUrl: 'url' } },
    { ...permission, walletType: 'invented' },
    { ...headers, type: BeaconMessageType.OperationResponse, transactionHash: null }
  ]
  for (const message of invalid) expect(parseBroadcastResponse(packet(message))).toBeUndefined()
})

it('preserves opaque V3 envelopes and classifies complete reserved shapes before V2 fields', () => {
  const message = {
    ...headers,
    type: BeaconMessageType.OperationResponse,
    transactionHash: null,
    message: { type: { opaque: 'chain-kind' }, blockchainData: null }
  }
  expect(parseBroadcastResponse(packet(message))?.message).toEqual(message)
  const ordinary = {
    ...headers,
    type: BeaconMessageType.OperationResponse,
    transactionHash: 'hash',
    message: 'diagnostic'
  }
  expect(parseBroadcastResponse(packet(ordinary))?.message).toEqual(ordinary)
})

it('rejects malformed packets and contexts without accessing nested fields', () => {
  for (const data of [
    undefined,
    null,
    [],
    {},
    { type: 'RESPONSE', data: null },
    packet(null),
    {
      type: 'RESPONSE',
      data: { message: permission, connectionInfo: { id: 'peer', origin: 'invented' } }
    }
  ]) {
    expect(parseBroadcastResponse(data)).toBeUndefined()
  }
})

it('checks delegated routing without inventing a full operation schema', () => {
  const opaque = { operationDetails: [{ chainExtension: { opaque: true } }] }
  const input = {
    id: 'delegated',
    type: BeaconMessageType.OperationRequest,
    data: { type: BeaconMessageType.OperationRequest, ...opaque, id: 'untrusted-inner-id' }
  }
  expect(parseDelegatedRequest(input)).toEqual({ id: 'delegated', protocol: '2', data: input.data })
  expect(
    parseDelegatedRequest({
      ...input,
      data: { ...input.data, type: BeaconMessageType.SignPayloadRequest }
    })
  ).toBeUndefined()
  expect(parseDelegatedRequest({ ...input, id: 7 })).toBeUndefined()
  const chain = {
    id: 'chain',
    type: BeaconMessageType.BlockchainRequest,
    data: {
      type: BeaconMessageType.BlockchainRequest,
      blockchainIdentifier: 'chain-test',
      blockchainData: { arbitrary: [null] }
    }
  }
  expect(parseDelegatedRequest(chain)).toEqual({ id: 'chain', protocol: '3', data: chain.data })
  expect(
    parseDelegatedRequest({ ...chain, data: { ...chain.data, blockchainIdentifier: 7 } })
  ).toBeUndefined()
})

it('constructs canonical delegated failures while retaining only honestly opaque diagnostics', () => {
  const errorData = { arbitrary: [null, 7] }
  const known = {
    id: 'untrusted-id',
    version: 7,
    senderId: null,
    type: BeaconMessageType.Error,
    errorType: BeaconErrorType.ABORTED_ERROR,
    errorData,
    extra: 'retained'
  }
  expect(delegatedErrorResponse('delegated', known)).toEqual({
    ...known,
    id: 'delegated',
    version: '2',
    senderId: ''
  })
  expect(delegatedErrorResponse('delegated', known).errorData).toBe(errorData)
  const hostile = {
    type: BeaconMessageType.Error,
    errorType: 42,
    toString() {
      throw new Error('must not coerce opaque errors')
    }
  }
  expect(delegatedErrorResponse('delegated', hostile)).toEqual({
    id: 'delegated',
    type: BeaconMessageType.Error,
    version: '2',
    senderId: '',
    errorType: BeaconErrorType.UNKNOWN_ERROR
  })
})
