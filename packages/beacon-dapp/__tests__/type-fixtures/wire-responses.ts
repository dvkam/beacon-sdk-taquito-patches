import { BeaconMessageType, DAppClient, type ResponseMessage, SigningType } from '../../src'

// Routing a wire reply does not establish that the wallet supplied all payload fields.
export const header: ResponseMessage = {
  id: 'request',
  version: '2',
  senderId: 'wallet',
  type: BeaconMessageType.SignPayloadResponse
}

export function inspect(message: ResponseMessage): string | undefined {
  // @ts-expect-error Wire headers do not establish a signature.
  const signature: string = message.signature
  void signature

  if ('signature' in message && typeof message.signature === 'string') {
    return message.signature
  }

  return undefined
}

export async function sign(client: DAppClient): Promise<string> {
  const response = await client.requestSignPayload({ payload: 'aa', signingType: SigningType.RAW })
  // The existing public request contract is unchanged.
  const signature: string = response.signature

  return signature
}
