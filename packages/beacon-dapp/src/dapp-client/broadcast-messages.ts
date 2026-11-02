import {
  AppMetadata,
  BeaconBaseMessage,
  BeaconRequestInputMessage,
  BlockchainMessage,
  BeaconMessage,
  BeaconMessageType,
  BeaconMessageWrapper,
  BeaconErrorType,
  ChangeAccountRequest,
  ErrorResponse,
  ConnectionContext,
  Network,
  NetworkType,
  Origin,
  PermissionScope,
  SigningType,
  Threshold
} from '@ecadlabs/beacon-types'
/** The closed V2 messages received by the dApp, not the V2 request schema. */
export type BroadcastV2Response = Extract<
  BeaconMessage,
  {
    type:
      | BeaconMessageType.PermissionResponse
      | BeaconMessageType.OperationResponse
      | BeaconMessageType.SignPayloadResponse
      | BeaconMessageType.BroadcastResponse
      | BeaconMessageType.ProofOfEventChallengeResponse
      | BeaconMessageType.SimulatedProofOfEventChallengeResponse
      | BeaconMessageType.Error
      | BeaconMessageType.Acknowledge
      | BeaconMessageType.Disconnect
      | BeaconMessageType.ChangeAccountRequest
  }
>
export type BroadcastResponseMessage =
  | BroadcastV2Response
  | BeaconMessageWrapper<{
      type: unknown
    }>
const snapshot = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value } : undefined
const member = <T>(values: readonly T[], value: unknown): T | undefined =>
  values.find((candidate) => candidate === value)
const optionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string'
const parseMetadata = (value: unknown): AppMetadata | undefined => {
  const data = snapshot(value)
  if (
    !data ||
    typeof data.senderId !== 'string' ||
    typeof data.name !== 'string' ||
    !optionalString(data.icon)
  ) {
    return
  }

  return { ...data, senderId: data.senderId, name: data.name, icon: data.icon }
}
const parseNetwork = (value: unknown): Network | undefined => {
  const data = snapshot(value)
  if (!data || !optionalString(data.name) || !optionalString(data.rpcUrl)) {
    return
  }
  const type = member(Object.values(NetworkType), data.type)
  if (type === undefined) {
    return
  }

  return { ...data, type, name: data.name, rpcUrl: data.rpcUrl }
}
const parseThreshold = (value: unknown): Threshold | undefined => {
  const data = snapshot(value)
  if (!data || typeof data.amount !== 'string' || typeof data.timeframe !== 'string') {
    return
  }

  return { ...data, amount: data.amount, timeframe: data.timeframe }
}
const parseNotification = (
  value: unknown
): NonNullable<ChangeAccountRequest['notification']> | undefined => {
  const data = snapshot(value)
  if (
    !data ||
    typeof data.version !== 'number' ||
    typeof data.apiUrl !== 'string' ||
    typeof data.token !== 'string'
  ) {
    return
  }

  return { ...data, version: data.version, apiUrl: data.apiUrl, token: data.token }
}
const parseAccountFields = (
  data: Record<string, unknown>
): Omit<ChangeAccountRequest, keyof BeaconBaseMessage> | undefined => {
  if (
    !optionalString(data.address) ||
    !optionalString(data.publicKey) ||
    (data.verificationType !== undefined && data.verificationType !== 'proof_of_event')
  ) {
    return
  }
  // onNewAccount has always supplied this V2 legacy default. Do not apply it to V3.
  const walletType = data.walletType ?? 'implicit'
  if (walletType !== 'implicit' && walletType !== 'abstracted_account') {
    return
  }
  const network = parseNetwork(data.network)
  if (!network || !Array.isArray(data.scopes)) {
    return
  }
  const scopes: PermissionScope[] = []
  for (const value of data.scopes) {
    const scope = member(Object.values(PermissionScope), value)
    if (scope === undefined) {
      return
    }
    scopes.push(scope)
  }
  const threshold = data.threshold === undefined ? undefined : parseThreshold(data.threshold)
  const notification =
    data.notification === undefined ? undefined : parseNotification(data.notification)
  if (
    (data.threshold !== undefined && !threshold) ||
    (data.notification !== undefined && !notification)
  ) {
    return
  }

  return {
    address: data.address,
    publicKey: data.publicKey,
    verificationType: data.verificationType,
    walletType,
    network,
    scopes,
    threshold,
    notification
  }
}
const parseOtherResponse = (
  data: Record<string, unknown>,
  headers: Pick<BeaconBaseMessage, 'id' | 'senderId' | 'version'>
): BroadcastV2Response | undefined => {
  switch (data.type) {
    case BeaconMessageType.OperationResponse:
    case BeaconMessageType.BroadcastResponse:
      if (typeof data.transactionHash !== 'string') {
        return
      }

      return { ...data, ...headers, type: data.type, transactionHash: data.transactionHash }
    case BeaconMessageType.SignPayloadResponse: {
      const signingType = member(Object.values(SigningType), data.signingType)
      if (signingType === undefined || typeof data.signature !== 'string') {
        return
      }

      return { ...data, ...headers, type: data.type, signingType, signature: data.signature }
    }
    case BeaconMessageType.ProofOfEventChallengeResponse:
      if (typeof data.payloadHash !== 'string' || typeof data.isAccepted !== 'boolean') {
        return
      }

      return {
        ...data,
        ...headers,
        type: data.type,
        payloadHash: data.payloadHash,
        isAccepted: data.isAccepted
      }
    case BeaconMessageType.SimulatedProofOfEventChallengeResponse:
      if (typeof data.operationsList !== 'string' || typeof data.errorMessage !== 'string') {
        return
      }

      return {
        ...data,
        ...headers,
        type: data.type,
        operationsList: data.operationsList,
        errorMessage: data.errorMessage
      }
    case BeaconMessageType.Error: {
      const errorType = member(Object.values(BeaconErrorType), data.errorType)
      if (errorType === undefined) {
        return
      }

      return { ...data, ...headers, type: data.type, errorType }
    }
    case BeaconMessageType.Acknowledge:
    case BeaconMessageType.Disconnect:
      return { ...data, ...headers, type: data.type }
    default:
      return
  }
}
const parseV2Message = (
  data: Record<string, unknown>,
  headers: Pick<BeaconBaseMessage, 'id' | 'senderId' | 'version'>
): BroadcastV2Response | undefined => {
  switch (data.type) {
    case BeaconMessageType.PermissionResponse: {
      const fields = parseAccountFields(data)
      const appMetadata = parseMetadata(data.appMetadata)
      if (!fields || !appMetadata) {
        return
      }

      return { ...data, ...headers, ...fields, type: data.type, appMetadata }
    }
    case BeaconMessageType.ChangeAccountRequest: {
      const fields = parseAccountFields(data)
      if (!fields) {
        return
      }

      return { ...data, ...headers, ...fields, type: data.type }
    }
    default:
      return parseOtherResponse(data, headers)
  }
}
const parseMessage = (value: unknown): BroadcastResponseMessage | undefined => {
  const data = snapshot(value)
  if (
    !data ||
    typeof data.id !== 'string' ||
    typeof data.senderId !== 'string' ||
    typeof data.version !== 'string'
  ) {
    return
  }
  const headers = { id: data.id, senderId: data.senderId, version: data.version }
  const inner = snapshot(data.message)
  // Reserve complete envelope shapes even when extra V2 fields or a broad version are present.
  if (inner && 'type' in inner) {
    return { ...data, ...headers, message: { ...inner, type: inner.type } }
  }

  return parseV2Message(data, headers)
}
/** Validate cloneable response data; browser-only callback extras are not a channel contract. */
export const parseBroadcastResponse = (
  value: unknown
):
  | {
      message: BroadcastResponseMessage
      connectionInfo: ConnectionContext
    }
  | undefined => {
  const packet = snapshot(value)
  if (!packet || packet.type !== 'RESPONSE') {
    return
  }
  const data = snapshot(packet.data)
  if (!data) {
    return
  }
  const message = parseMessage(data.message)
  const context = snapshot(data.connectionInfo)
  if (!message || !context || typeof context.id !== 'string') {
    return
  }
  const origin = member(Object.values(Origin), context.origin)
  if (origin === undefined) {
    return
  }

  return { message, connectionInfo: { id: context.id, origin } }
}

export type DelegatedV2Request = Record<string, unknown> & {
  type: BeaconRequestInputMessage['type']
}

export type DelegatedRequest =
  | { id: string; protocol: '2'; data: DelegatedV2Request }
  | {
      id: string
      protocol: '3'
      data: BlockchainMessage & { type: BeaconMessageType.BlockchainRequest }
    }

const delegatedV2Kinds: readonly BeaconRequestInputMessage['type'][] = [
  BeaconMessageType.PermissionRequest,
  BeaconMessageType.OperationRequest,
  BeaconMessageType.SignPayloadRequest,
  BeaconMessageType.BroadcastRequest,
  BeaconMessageType.ProofOfEventChallengeRequest,
  BeaconMessageType.SimulatedProofOfEventChallengeRequest
]

/** Validate routing fields; request payloads remain opaque to this forwarding boundary. */
export const parseDelegatedRequest = (value: unknown): DelegatedRequest | undefined => {
  const packet = snapshot(value)
  if (!packet || typeof packet.id !== 'string') {
    return
  }
  const data = snapshot(packet.data)
  if (!data || data.type !== packet.type) {
    return
  }
  if (packet.type === BeaconMessageType.BlockchainRequest) {
    if (typeof data.blockchainIdentifier !== 'string' || !('blockchainData' in data)) {
      return
    }

    return {
      id: packet.id,
      protocol: '3',
      data: {
        ...data,
        type: BeaconMessageType.BlockchainRequest,
        blockchainIdentifier: data.blockchainIdentifier,
        blockchainData: data.blockchainData
      }
    }
  }
  const type = member(delegatedV2Kinds, packet.type)
  if (type === undefined) {
    return
  }

  return { id: packet.id, protocol: '2', data: { ...data, type } }
}

/** Build a synthetic delegated failure without claiming a schema for opaque error details. */
export const delegatedErrorResponse = (
  id: string,
  error: unknown
): Omit<ErrorResponse, 'errorData'> & { errorData?: unknown } => {
  const headers = { id, type: BeaconMessageType.Error, version: '2', senderId: '' } satisfies Pick<
    ErrorResponse,
    'id' | 'type' | 'version' | 'senderId'
  >
  try {
    const data = snapshot(error)
    const errorType =
      data?.type === BeaconMessageType.Error
        ? member(Object.values(BeaconErrorType), data.errorType)
        : undefined
    if (data && errorType !== undefined) {
      return { ...data, ...headers, errorType }
    }
  } catch {
    // Thrown values can themselves have throwing getters. The caller logs the original value.
  }

  return { ...headers, errorType: BeaconErrorType.UNKNOWN_ERROR }
}

export type BroadcastApplicationPacket =
  | { type: 'RESPONSE'; response: NonNullable<ReturnType<typeof parseBroadcastResponse>> }
  | { type: 'REQUEST'; request: DelegatedRequest }
  | { type: 'DISCONNECT' }

/** Snapshot the application envelope before selecting its routing parser. */
export const parseBroadcastPacket = (value: unknown): BroadcastApplicationPacket | undefined => {
  const packet = snapshot(value)
  if (!packet) {
    return
  }
  if (packet.type === 'RESPONSE') {
    const response = parseBroadcastResponse(packet)

    return response ? { type: 'RESPONSE', response } : undefined
  }
  if (packet.type === 'DISCONNECT') {
    return { type: 'DISCONNECT' }
  }
  const request = parseDelegatedRequest(packet)

  return request ? { type: 'REQUEST', request } : undefined
}
