import { SigningType } from '@ecadlabs/beacon-types'
import { packDataBytes, unpackDataBytes } from '@taquito/michel-codec'

export type SignPayloadInspection =
  | { valid: false; reason: string }
  | {
      valid: true
      normalizedHex: string
      kind: 'signed_message_text' | 'micheline'
      validation: 'canonical_micheline'
      decodedText?: string
    }
  | { valid: true; normalizedHex: string; kind: 'operation'; validation: 'watermark_only' }
  | { valid: true; normalizedHex: string; kind: 'raw_bytes'; validation: 'hex' }

const MAX_PAYLOAD_BYTES = 1024 * 1024
const SIGNED_MESSAGE_PREFIX = 'Tezos Signed Message: '

/**
 * Pack the exact supplied UTF-8 text as a Micheline string (0501 + byte length + bytes).
 * Callers add their own message prefix/domain/nonce. This does not construct an authentication protocol.
 */
export const packMessageText = (text: string): string => {
  if (typeof text !== 'string') {
    throw new TypeError('Expected message text')
  }
  const bytes = new TextEncoder().encode(text)
  if (bytes.length + 6 > MAX_PAYLOAD_BYTES) {
    throw new RangeError('Signing payload exceeds 1 MiB')
  }
  if (new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) !== text) {
    throw new TypeError('Invalid Unicode message text')
  }

  return packDataBytes({ ['string']: text }).bytes
}

const inspectMicheline = (normalizedHex: string): SignPayloadInspection => {
  try {
    let decoded = unpackDataBytes({ bytes: normalizedHex })
    if (normalizedHex.startsWith('0501')) {
      // The codec's default TextDecoder drops a leading BOM. Preserve exact top-level text.
      const bytes = Uint8Array.from(normalizedHex.slice(12).match(/../g) ?? [], (byte) =>
        parseInt(byte, 16)
      )
      decoded = {
        ['string']: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
      }
    }
    // Exact repacking rejects trailing, truncated and noncanonical encodings.
    if (packDataBytes(decoded).bytes !== normalizedHex) {
      return { valid: false, reason: 'Unsupported or noncanonical packed Micheline encoding' }
    }
    const decodedText = !Array.isArray(decoded) && 'string' in decoded ? decoded.string : undefined

    return {
      valid: true,
      normalizedHex,
      kind: decodedText?.startsWith(SIGNED_MESSAGE_PREFIX) ? 'signed_message_text' : 'micheline',
      validation: 'canonical_micheline',
      ...(decodedText !== undefined ? { decodedText } : {})
    }
  } catch {
    return { valid: false, reason: 'Invalid packed Micheline data' }
  }
}

/**
 * Inspect hex signing bytes without changing requests or inferring RAW text encoding.
 * A successful operation result validates its 03 watermark only, not forged operation contents.
 */
export const inspectSignPayload = (
  payload: string,
  signingType?: SigningType
): SignPayloadInspection => {
  if (typeof payload !== 'string') {
    return { valid: false, reason: 'Expected hex payload' }
  }
  if (payload.length > MAX_PAYLOAD_BYTES * 2 + 2) {
    return { valid: false, reason: 'Signing payload exceeds 1 MiB' }
  }
  const normalizedHex = (
    payload.startsWith('0x') || payload.startsWith('0X') ? payload.slice(2) : payload
  ).toLowerCase()
  if (!/^(?:[0-9a-f]{2})+$/.test(normalizedHex)) {
    return { valid: false, reason: 'Expected nonempty, even-length hex payload' }
  }
  if (normalizedHex.length / 2 > MAX_PAYLOAD_BYTES) {
    return { valid: false, reason: 'Signing payload exceeds 1 MiB' }
  }
  if (signingType !== undefined && !Object.values(SigningType).includes(signingType)) {
    return { valid: false, reason: 'Unsupported signing type' }
  }
  if (signingType === SigningType.MICHELINE) {
    return normalizedHex.startsWith('05')
      ? inspectMicheline(normalizedHex)
      : { valid: false, reason: 'Micheline payload requires 05 prefix' }
  }
  if (
    signingType === SigningType.OPERATION ||
    (normalizedHex.startsWith('03') && normalizedHex.length > 2)
  ) {
    return normalizedHex.startsWith('03') && normalizedHex.length > 2
      ? { valid: true, normalizedHex, kind: 'operation', validation: 'watermark_only' }
      : { valid: false, reason: 'Operation payload requires 03 watermark and payload bytes' }
  }
  if (normalizedHex.startsWith('05')) {
    const inspected = inspectMicheline(normalizedHex)
    if (inspected.valid || signingType !== SigningType.RAW) {
      return inspected
    }
  }

  return { valid: true, normalizedHex, kind: 'raw_bytes', validation: 'hex' }
}
