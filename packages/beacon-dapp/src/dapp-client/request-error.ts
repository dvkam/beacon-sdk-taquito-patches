import {
  BeaconBaseMessage,
  BeaconErrorType,
  BeaconMessage,
  BeaconMessageType,
  BeaconMessageWrapper,
  BlockchainMessage,
  ConnectionContext,
  ErrorResponse,
  WalletInfo,
  ErrorOrigin,
  RequestErrorResponse,
  TezosRpcError,
  isErrorOrigin,
  isErrorResponse,
  isRequestErrorResponse,
  isTezosRpcError,
  BeaconError,
  isBeaconError,
  getError
} from '@ecadlabs/beacon-types'

export type { ErrorOrigin, RequestErrorResponse, TezosRpcError }
export {
  isErrorOrigin,
  isErrorResponse,
  isRequestErrorResponse,
  isTezosRpcError,
  BeaconError,
  isBeaconError
}

export const toBeaconError = (error: RequestErrorResponse): BeaconError =>
  getError(error.errorType, error.errorData, {
    id: error.id,
    version: error.version,
    senderId: error.senderId,
    errorOrigin: error.errorOrigin
  })

/** Keeps request-error events plain while preserving existing wire error objects. */
export const errorEventResponse = (error: ErrorResponse): ErrorResponse =>
  isBeaconError(error)
    ? {
        id: error.id,
        type: BeaconMessageType.Error,
        errorType: error.errorType,
        version: error.version,
        senderId: error.senderId,
        ...(error.errorOrigin ? { errorOrigin: error.errorOrigin } : {}),
        ...(error.errorData !== undefined ? { errorData: error.errorData } : {})
      }
    : error

/**
 * An error as a wallet may put it on the wire. Responses are not validated before routing, and
 * wallets do not always fill `errorType`.
 *
 * @category DApp
 */
export interface WireErrorPayload {
  type: BeaconMessageType.Error
  errorType?: unknown
  errorData?: unknown
  errorOrigin?: unknown
}

/** A V2 error message as a wallet may send it. @category DApp */
export interface WireErrorMessage extends WireErrorPayload {
  id: string
  version: string
  senderId: string
}

/** The message inside a V3 envelope. Its shape depends on the blockchain. @category DApp */
export interface V3ResponsePayload {
  type: unknown
}

/**
 * A response as it reaches the dApp: V2 wire headers or a V3 envelope.
 * Payload fields remain unverified until the relevant consumer narrows them. Older wallets
 * can omit response fields such as signingType; routing must not invent those fields.
 * @category DApp
 */
export type ResponseMessage =
  | BeaconMessage
  | BeaconBaseMessage
  | WireErrorMessage
  | BeaconMessageWrapper<BeaconBaseMessage | BlockchainMessage | V3ResponsePayload>

/**
 * The answer a response carries: the V2 message itself, or the message inside a V3 envelope.
 *
 * @category DApp
 */
export type ResponseOutput =
  BeaconMessage | WireErrorMessage | BeaconBaseMessage | BlockchainMessage | V3ResponsePayload

interface LateResponseBase {
  requestId: string
  requestType: BeaconMessageType
  /**
   * The response as received, for debugging. An error inside it carries the same
   * `errorOrigin` as `error`, so a wallet cannot use this field to pass its error off as local.
   */
  message: ResponseMessage
  connectionInfo: ConnectionContext
  walletInfo: WalletInfo
}

/**
 * A late answer that is not an error.
 *
 * @category DApp
 */
export interface LateSuccessResponseInfo extends LateResponseBase {
  kind: 'success'
  /** What the request method would have returned: the V2 message, or the V3 inner message. */
  output: ResponseOutput
  /**
   * Set when the answer is an operation or broadcast response, or a V3 blockchain response,
   * with a non-empty transaction hash. The operation may already be on chain.
   */
  transactionHash?: string
}

/**
 * A late answer that is an error. `error` is what the caller would have been rejected with.
 *
 * @category DApp
 */
export interface LateErrorResponseInfo extends LateResponseBase {
  kind: 'error'
  error: RequestErrorResponse
}

/**
 * Payload of the LATE_RESPONSE_RECEIVED event: a wallet answer for a request whose deadline had
 * already fired. The caller already received a PEER_UNREACHABLE rejection.
 *
 * @category DApp
 */
export type LateResponseInfo = LateSuccessResponseInfo | LateErrorResponseInfo

/** The parts of the late event that come from the response itself. */
export type LateResponseClassification =
  | Pick<LateSuccessResponseInfo, 'kind' | 'message' | 'output' | 'transactionHash'>
  | Pick<LateErrorResponseInfo, 'kind' | 'message' | 'error'>

/** Routing keys on the message type alone; wallets do not always fill `errorType`. */
const isErrorMessage = (value: unknown): value is { type: BeaconMessageType.Error } =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  'type' in value &&
  value.type === BeaconMessageType.Error

// Only a version 3 envelope wraps its payload; a V2 message may carry its own `message` field.
const isV3Envelope = (
  message: ResponseMessage
): message is BeaconMessageWrapper<BeaconBaseMessage | BlockchainMessage | V3ResponsePayload> =>
  'message' in message && message.version === '3'

export const responseOutput = (message: ResponseMessage): ResponseOutput =>
  isV3Envelope(message) ? message.message : message

const isKnownErrorType = (value: unknown): value is BeaconErrorType =>
  Object.values(BeaconErrorType).some((candidate) => candidate === value)

const normalizeErrorPayload = (
  value: WireErrorPayload,
  header: Pick<RequestErrorResponse, 'id' | 'senderId' | 'version'>,
  diagnostic: unknown
): RequestErrorResponse => {
  const errorType = 'errorType' in value ? value.errorType : undefined
  const origin =
    'errorOrigin' in value && isErrorOrigin(value.errorOrigin) ? value.errorOrigin : 'local'

  return {
    ...value,
    ...header,
    type: BeaconMessageType.Error,
    errorOrigin: origin,
    errorType: isKnownErrorType(errorType) ? errorType : BeaconErrorType.UNKNOWN_ERROR,
    ...(!isKnownErrorType(errorType) && typeof errorType === 'string' && errorType.length > 0
      ? { errorData: diagnostic }
      : 'errorData' in value
        ? { errorData: value.errorData }
        : {})
  }
}

// Application hooks can reject with accessors or proxies. Read only the fields
// needed for classification, and keep an unreadable rejection as the diagnostic.
export const normalizeErrorResponse = (value: unknown): RequestErrorResponse | undefined => {
  try {
    if (!isErrorMessage(value)) {
      return undefined
    }
    const id = 'id' in value ? value.id : undefined
    const senderId = 'senderId' in value ? value.senderId : undefined
    const version = 'version' in value ? value.version : undefined
    if (typeof id !== 'string' || typeof senderId !== 'string' || typeof version !== 'string') {
      return undefined
    }

    const errorType = 'errorType' in value ? value.errorType : undefined
    const errorData = 'errorData' in value ? value.errorData : undefined
    const diagnostic = !isKnownErrorType(errorType) && errorData === undefined ? value : errorData

    return normalizeErrorPayload(
      {
        type: BeaconMessageType.Error,
        errorType,
        errorOrigin: 'errorOrigin' in value ? value.errorOrigin : undefined,
        ...(diagnostic !== undefined ? { errorData: diagnostic } : {})
      },
      { id, senderId, version },
      value
    )
  } catch {
    return undefined
  }
}

export const diagnosticMessage = (
  value: unknown,
  source: 'error' | 'diagnostic'
): string | undefined => {
  try {
    if (source === 'error' && !(value instanceof Error)) {
      return undefined
    }
    const message =
      typeof value === 'object' && value !== null && 'message' in value ? value.message : undefined

    return typeof message === 'string' ? message : undefined
  } catch {
    return undefined
  }
}

export const localError = (error: ErrorResponse): RequestErrorResponse => ({
  ...error,
  errorOrigin: 'local'
})

/**
 * Builds the error a caller is rejected with from an error that arrived on the response path,
 * or returns undefined when the response is not an error.
 *
 * Wallet messages and errors forwarded by the leader tab arrive on the same path, so the
 * message cannot be trusted to say where it came from. A claimed `errorOrigin` is kept only
 * when `trustClaimedOrigin` is set: in a follower tab, whose leader stamps what it forwards,
 * and for messages the WalletConnect adapter built itself. Anything else came from the wallet.
 */
export const toRequestError = (
  message: ResponseMessage,
  trustClaimedOrigin: boolean
): RequestErrorResponse | undefined => {
  const answer: unknown = responseOutput(message)
  if (!isErrorMessage(answer)) {
    return undefined
  }
  const claimed = 'errorOrigin' in answer ? answer.errorOrigin : undefined
  const errorOrigin = trustClaimedOrigin && isErrorOrigin(claimed) ? claimed : 'wallet'
  const diagnostic = isV3Envelope(message)
    ? { ...message, message: { ...answer, errorOrigin } }
    : { ...message, errorOrigin }

  return normalizeErrorPayload(
    { ...answer, errorOrigin },
    { id: message.id, version: message.version, senderId: message.senderId ?? '' },
    diagnostic
  )
}

/**
 * Sets `errorOrigin` on the error inside a response and leaves anything else unchanged. Used
 * when the leader forwards a response, and for the raw message in the late event.
 */
export const stampErrorOrigin = <M extends ResponseMessage>(
  message: M,
  trustClaimedOrigin: boolean
): M => {
  const error = toRequestError(message, trustClaimedOrigin)
  if (!error) {
    return message
  }
  // Spread from a value: ErrorResponse does not declare errorOrigin, the wire message has it.
  const stamp = { errorOrigin: error.errorOrigin }
  if (isV3Envelope(message)) {
    return { ...message, senderId: error.senderId, message: { ...message.message, ...stamp } }
  }

  return { ...message, senderId: error.senderId, ...stamp }
}

const hashOf = (value: unknown): string | undefined =>
  typeof value === 'object' &&
  value !== null &&
  'transactionHash' in value &&
  typeof value.transactionHash === 'string' &&
  value.transactionHash.length > 0
    ? value.transactionHash
    : undefined

/** The transaction hash of a response that submitted something. V3 blockchainData is untyped. */
const transactionHashOf = (message: ResponseMessage): string | undefined => {
  if (isV3Envelope(message)) {
    const inner: unknown = message.message

    return typeof inner === 'object' &&
      inner !== null &&
      'type' in inner &&
      inner.type === BeaconMessageType.BlockchainResponse &&
      'blockchainData' in inner
      ? hashOf(inner.blockchainData)
      : undefined
  }

  return message.type === BeaconMessageType.OperationResponse ||
    message.type === BeaconMessageType.BroadcastResponse
    ? hashOf(message)
    : undefined
}

/** Normalises a late response the same way the request methods treat a timely one. */
export const classifyLateResponse = (
  message: ResponseMessage,
  trustClaimedOrigin: boolean
): LateResponseClassification => {
  const error = toRequestError(message, trustClaimedOrigin)
  if (error) {
    return { kind: 'error', message: stampErrorOrigin(message, trustClaimedOrigin), error }
  }

  return {
    kind: 'success',
    message,
    output: responseOutput(message),
    transactionHash: transactionHashOf(message)
  }
}
