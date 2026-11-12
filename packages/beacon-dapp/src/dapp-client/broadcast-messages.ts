import {
  AppMetadata,
  BeaconBaseMessage,
  BeaconMessageType,
  BeaconMessageWrapper,
  BeaconRequestInputMessage,
  BlockchainMessage,
  ConnectionContext,
  Origin
} from '@ecadlabs/beacon-types'
import { ResponseMessage } from './request-error'

/** Only the routing contract is owned here; operation data is validated by the wallet. */
export interface ForwardedV2Request {
  type: BeaconRequestInputMessage['type']
}

export type ForwardedBroadcastRequest =
  | { kind: 'v2'; id: string; data: ForwardedV2Request }
  | { kind: 'v3'; id: string; data: BlockchainMessage }

type BroadcastPacket =
  | ForwardedBroadcastRequest
  | {
      kind: 'response'
      id: string
      message: ResponseMessage
      connectionInfo: ConnectionContext
    }
  | { kind: 'disconnect' }

const snapshot = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value } : undefined

const isV2RequestType = (value: unknown): value is ForwardedV2Request['type'] =>
  value === BeaconMessageType.PermissionRequest ||
  value === BeaconMessageType.OperationRequest ||
  value === BeaconMessageType.SignPayloadRequest ||
  value === BeaconMessageType.BroadcastRequest ||
  value === BeaconMessageType.ProofOfEventChallengeRequest ||
  value === BeaconMessageType.SimulatedProofOfEventChallengeRequest

/** This verifies metadata before it can be persisted, without claiming a full permission reply. */
export const readAppMetadata = (value: unknown): AppMetadata | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  const senderId = 'senderId' in value ? value.senderId : undefined
  const name = 'name' in value ? value.name : undefined
  const icon = 'icon' in value ? value.icon : undefined
  if (
    typeof senderId !== 'string' ||
    typeof name !== 'string' ||
    (icon !== undefined && typeof icon !== 'string')
  ) {
    return undefined
  }

  return { senderId, name, icon }
}

export const responseAppMetadata = (message: ResponseMessage): AppMetadata | undefined => {
  if (message.version === '3' && 'message' in message) {
    const inner = message.message
    const blockchainData =
      'blockchainData' in inner &&
      typeof inner.blockchainData === 'object' &&
      inner.blockchainData !== null
        ? inner.blockchainData
        : undefined

    return readAppMetadata(
      blockchainData && 'appMetadata' in blockchainData ? blockchainData.appMetadata : undefined
    )
  }

  return readAppMetadata('appMetadata' in message ? message.appMetadata : undefined)
}

const parseV2Response = (
  data: Record<string, unknown>,
  header: Pick<BeaconBaseMessage, 'id' | 'senderId' | 'version'>
): BeaconBaseMessage | undefined => {
  switch (data.type) {
    case BeaconMessageType.SignPayloadResponse:
      if (typeof data.signature !== 'string') {
        return undefined
      }
      break
    case BeaconMessageType.OperationResponse:
    case BeaconMessageType.BroadcastResponse:
      if (typeof data.transactionHash !== 'string') {
        return undefined
      }
      break
    case BeaconMessageType.ProofOfEventChallengeResponse:
      if (typeof data.payloadHash !== 'string' || typeof data.isAccepted !== 'boolean') {
        return undefined
      }
      break
    case BeaconMessageType.SimulatedProofOfEventChallengeResponse:
      if (typeof data.operationsList !== 'string' || typeof data.errorMessage !== 'string') {
        return undefined
      }
      break
    case BeaconMessageType.PermissionResponse:
      // Account-specific interpretation remains with the existing permission response path.
      if (!snapshot(data.network) || !Array.isArray(data.scopes)) {
        return undefined
      }
      break
    case BeaconMessageType.Acknowledge:
    case BeaconMessageType.Error:
      // Unknown or omitted errorType is handled by toRequestError, as on the wire.
      break
    default:
      return undefined
  }

  return { ...data, ...header, type: data.type }
}

const parseResponse = (value: unknown): ResponseMessage | undefined => {
  const data = snapshot(value)
  if (
    !data ||
    typeof data.id !== 'string' ||
    typeof data.version !== 'string' ||
    typeof data.senderId !== 'string'
  ) {
    return undefined
  }
  if (data.version === '3') {
    const message = snapshot(data.message)
    if (
      !message ||
      !('type' in message) ||
      message.type === BeaconMessageType.Disconnect ||
      message.type === BeaconMessageType.ChangeAccountRequest
    ) {
      // Notifications are handled by the leader's wallet listener, never forwarded as replies.
      return undefined
    }

    const envelope: BeaconMessageWrapper<{ type: unknown }> = {
      ...data,
      id: data.id,
      version: data.version,
      senderId: data.senderId,
      message: { ...message, type: message.type }
    }

    return envelope
  }

  return parseV2Response(data, { id: data.id, version: data.version, senderId: data.senderId })
}

const parsePacket = (value: unknown): BroadcastPacket | undefined => {
  const packet = snapshot(value)
  if (!packet) {
    return undefined
  }
  if (packet.type === 'DISCONNECT') {
    return { kind: 'disconnect' }
  }
  if (typeof packet.id !== 'string' || packet.id.length === 0) {
    return undefined
  }
  const data = snapshot(packet.data)
  if (!data) {
    return undefined
  }
  if (packet.type === 'RESPONSE') {
    const message = parseResponse(data.message)
    const context = snapshot(data.connectionInfo)
    const origin = Object.values(Origin).find((candidate) => candidate === context?.origin)
    if (
      !message ||
      message.id !== packet.id ||
      !context ||
      !origin ||
      typeof context.id !== 'string'
    ) {
      return undefined
    }

    return {
      kind: 'response',
      id: packet.id,
      message,
      connectionInfo: { origin, id: context.id }
    }
  }
  if (packet.type !== data.type) {
    return undefined
  }
  // These fields belong to the leader, never to an untrusted inter-tab payload.
  const input = { ...data }
  delete input.id
  delete input.senderId
  delete input.version
  if (isV2RequestType(input.type)) {
    return { kind: 'v2', id: packet.id, data: { ...input, type: input.type } }
  }
  if (
    input.type === BeaconMessageType.BlockchainRequest &&
    typeof input.blockchainIdentifier === 'string' &&
    'blockchainData' in input
  ) {
    return {
      kind: 'v3',
      id: packet.id,
      data: {
        ...input,
        type: input.type,
        blockchainIdentifier: input.blockchainIdentifier,
        blockchainData: input.blockchainData
      }
    }
  }

  return undefined
}

/** BroadcastChannel already clones inputs. Reject malformed envelopes before routing any request. */
export const parseBroadcastMessage = (value: unknown): BroadcastPacket | undefined => {
  try {
    return parsePacket(value)
  } catch {
    return undefined
  }
}
