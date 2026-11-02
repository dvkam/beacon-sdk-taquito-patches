import {
  BeaconMessageType,
  type AppMetadata,
  type BeaconMessage,
  type BeaconMessageWrapper,
  type BeaconRequestInputMessage,
  type BlockchainResponseV3,
  type PermissionResponseV3,
  type ConnectionContext,
  type ErrorResponse
} from '@ecadlabs/beacon-types'
import { ExposedPromise } from '@ecadlabs/beacon-utils'

export type PendingMessage = BeaconMessage | BeaconMessageWrapper<{ type: unknown }>
export type RequestFailure = ErrorResponse | Error
export interface RequestResult<U extends PendingMessage> {
  message: U
  connectionInfo: ConnectionContext
}
export type ResponseSelector<U extends PendingMessage> = (message: PendingMessage) => U | undefined
export interface PendingRequest {
  resolve: (
    input: RequestResult<PendingMessage>,
    beforeResolve: (message: PendingMessage) => Promise<void>
  ) => Promise<boolean>
  reject: (reason?: RequestFailure) => void
}

const snapshot = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? { ...value } : undefined

// Exclude the complete envelope member before narrowing the inherited canonical
// V2 message domain. This does not validate unknown V2 wire data.
const isEnvelope = (message: PendingMessage): message is BeaconMessageWrapper<{ type: unknown }> =>
  'message' in message &&
  message.message !== null &&
  (typeof message.message === 'object' || typeof message.message === 'function') &&
  'type' in message.message

const copyV2Response = (message: BeaconMessage): BeaconMessage => {
  if (message.type === BeaconMessageType.PermissionResponse) {
    return {
      ...message,
      appMetadata: { ...message.appMetadata },
      network: { ...message.network },
      scopes: [...message.scopes],
      ...(message.threshold === undefined ? {} : { threshold: { ...message.threshold } }),
      ...(message.notification === undefined ? {} : { notification: { ...message.notification } })
    }
  }

  return { ...message }
}

const hasV2Type = <K extends BeaconMessage['type']>(
  message: BeaconMessage,
  type: K
): message is Extract<BeaconMessage, { type: K }> => message.type === type

export const anyPendingResponse: ResponseSelector<PendingMessage> = (message) => {
  const selected = { ...message }

  return isEnvelope(selected)
    ? { ...selected, message: { ...selected.message } }
    : copyV2Response(selected)
}

export const v2Response =
  <K extends BeaconMessage['type']>(
    type: K
  ): ResponseSelector<Extract<BeaconMessage, { type: K }>> =>
  (message) => {
    const selected = { ...message }
    if (isEnvelope(selected)) {
      return undefined
    }
    const response = copyV2Response(selected)

    return hasV2Type(response, type) ? response : undefined
  }

export const v2ResponseForRequest = (
  type: BeaconRequestInputMessage['type']
): ResponseSelector<BeaconMessage> => {
  const responses = {
    [BeaconMessageType.PermissionRequest]: BeaconMessageType.PermissionResponse,
    [BeaconMessageType.OperationRequest]: BeaconMessageType.OperationResponse,
    [BeaconMessageType.SignPayloadRequest]: BeaconMessageType.SignPayloadResponse,
    [BeaconMessageType.BroadcastRequest]: BeaconMessageType.BroadcastResponse,
    [BeaconMessageType.ProofOfEventChallengeRequest]:
      BeaconMessageType.ProofOfEventChallengeResponse,
    [BeaconMessageType.SimulatedProofOfEventChallengeRequest]:
      BeaconMessageType.SimulatedProofOfEventChallengeResponse
  } satisfies Record<BeaconRequestInputMessage['type'], BeaconMessage['type']>

  return v2Response(responses[type])
}

const metadataSnapshot = (value: unknown): AppMetadata | undefined => {
  const metadata = snapshot(value)
  if (
    !metadata ||
    typeof metadata.senderId !== 'string' ||
    typeof metadata.name !== 'string' ||
    (metadata.icon !== undefined && typeof metadata.icon !== 'string')
  ) {
    return undefined
  }

  return { ...metadata, senderId: metadata.senderId, name: metadata.name, icon: metadata.icon }
}

const v3Snapshot = (message: PendingMessage) => {
  const outer = snapshot(message)
  if (
    !outer ||
    typeof outer.id !== 'string' ||
    typeof outer.senderId !== 'string' ||
    outer.version !== '3'
  ) {
    return undefined
  }
  const payload = snapshot(outer.message)
  if (!payload || !('type' in payload)) {
    return undefined
  }

  return {
    outer,
    payload,
    headers: { id: outer.id, senderId: outer.senderId, version: outer.version }
  }
}

export const v3PermissionResponse =
  (blockchainIdentifier: string): ResponseSelector<BeaconMessageWrapper<PermissionResponseV3>> =>
  (message) => {
    const value = v3Snapshot(message)
    if (!value) {
      return undefined
    }
    const { outer, payload, headers } = value
    if (
      payload.type !== BeaconMessageType.PermissionResponse ||
      typeof payload.blockchainIdentifier !== 'string' ||
      payload.blockchainIdentifier !== blockchainIdentifier
    ) {
      return undefined
    }
    const data = snapshot(payload.blockchainData)
    if (!data) {
      return undefined
    }
    const appMetadata = metadataSnapshot(data.appMetadata)
    if (!appMetadata || !Array.isArray(data.scopes)) {
      return undefined
    }
    const scopeValues: unknown[] = data.scopes
    const scopes: string[] = []
    for (const scope of scopeValues) {
      if (typeof scope !== 'string') {
        return undefined
      }
      scopes.push(scope)
    }

    return {
      ...outer,
      ...headers,
      message: {
        ...payload,
        type: BeaconMessageType.PermissionResponse,
        blockchainIdentifier: payload.blockchainIdentifier,
        blockchainData: { ...data, appMetadata, scopes }
      }
    }
  }

export const v3BlockchainResponse =
  (blockchainIdentifier: string): ResponseSelector<BeaconMessageWrapper<BlockchainResponseV3>> =>
  (message) => {
    const value = v3Snapshot(message)
    if (!value) {
      return undefined
    }
    const { outer, payload, headers } = value
    if (
      payload.type !== BeaconMessageType.BlockchainResponse ||
      typeof payload.blockchainIdentifier !== 'string' ||
      payload.blockchainIdentifier !== blockchainIdentifier ||
      !('blockchainData' in payload)
    ) {
      return undefined
    }

    return {
      ...outer,
      ...headers,
      message: {
        ...payload,
        type: BeaconMessageType.BlockchainResponse,
        blockchainIdentifier: payload.blockchainIdentifier,
        blockchainData: payload.blockchainData
      }
    }
  }

export const responseType = (message: PendingMessage): unknown => {
  if (message.version === '3' && isEnvelope(message)) {
    return message.message.type
  }

  return 'type' in message ? message.type : undefined
}

export const responseAppMetadata = (message: PendingMessage): AppMetadata | undefined => {
  if (message.version === '3' && isEnvelope(message)) {
    const data =
      'blockchainData' in message.message ? snapshot(message.message.blockchainData) : undefined

    return data ? metadataSnapshot(data.appMetadata) : undefined
  }

  return 'appMetadata' in message ? metadataSnapshot(message.appMetadata) : undefined
}

export const createPendingRequest = <U extends PendingMessage>(
  id: string,
  promise: ExposedPromise<RequestResult<U>, RequestFailure>,
  select: ResponseSelector<U>
): PendingRequest => ({
  resolve: async ({ message, connectionInfo }, beforeResolve) => {
    try {
      const selected = select(message)
      if (!selected || selected.id !== id) {
        throw new Error(`Unexpected response for request "${id}"`)
      }
      const { id: connectionId, origin, extras } = connectionInfo
      const selectedContext: ConnectionContext = {
        id: connectionId,
        origin,
        ...(extras === undefined ? {} : { extras })
      }
      await beforeResolve(selected)
      promise.resolve({ message: selected, connectionInfo: selectedContext })

      return true
    } catch (error: unknown) {
      const failure =
        error instanceof Error
          ? error
          : Object.assign(new Error(`Unable to complete response for request "${id}"`), {
              cause: error
            })
      promise.reject(failure)

      return false
    }
  },
  reject: (reason) => promise.reject(reason)
})
