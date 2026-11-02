import type { ChangeAccountRequest } from '@ecadlabs/beacon-types'

type LegacyPublicKeyFields = Pick<ChangeAccountRequest, 'publicKey'> & {
  pubkey?: unknown
  pubKey?: unknown
}

export const getLegacyPublicKey = (message: LegacyPublicKeyFields): string | undefined => {
  for (const field of ['publicKey', 'pubkey', 'pubKey'] as const) {
    const value = message[field]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return undefined
}
