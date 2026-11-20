import {
  BeaconErrorType,
  BeaconMessageType,
  isBeaconError,
  isRequestErrorResponse,
  RequestErrorResponse
} from '@ecadlabs/beacon-types'

export const explicitUndefinedOrigin = {
  type: BeaconMessageType.Error,
  errorType: BeaconErrorType.NOT_GRANTED_ERROR,
  id: 'request',
  version: '2',
  senderId: 'wallet',
  errorOrigin: undefined
} satisfies RequestErrorResponse

export function requestOrigin(value: unknown): string | undefined {
  if (isRequestErrorResponse(value) && 'errorOrigin' in value) {
    // @ts-expect-error Presence does not exclude an explicitly undefined origin.
    value.errorOrigin.toUpperCase()
    return value.errorOrigin?.toUpperCase()
  }

  return undefined
}

export function exceptionOrigin(value: unknown): string | undefined {
  if (isBeaconError(value) && 'errorOrigin' in value) {
    // @ts-expect-error BeaconError instances also retain an explicitly undefined origin.
    value.errorOrigin.toUpperCase()
    return value.errorOrigin?.toUpperCase()
  }

  return undefined
}
