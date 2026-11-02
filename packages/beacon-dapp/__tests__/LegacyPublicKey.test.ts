import { getLegacyPublicKey } from '../src/utils/legacy-public-key'

describe('legacy public keys', () => {
  it.each([
    { fields: { publicKey: 'modern', pubkey: 'lower', pubKey: 'camel' }, expected: 'modern' },
    { fields: { pubkey: 'lower', pubKey: 'camel' }, expected: 'lower' },
    { fields: { pubkey: '', pubKey: 'camel' }, expected: 'camel' },
    { fields: { pubkey: { invalid: true }, pubKey: 'camel' }, expected: 'camel' },
    { fields: { pubkey: { invalid: true }, pubKey: 42 }, expected: undefined }
  ])('selects the first usable key from $fields', ({ fields, expected }) => {
    expect(getLegacyPublicKey(fields)).toBe(expected)
  })
})
