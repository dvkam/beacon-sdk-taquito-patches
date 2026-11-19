import { describe, expect, it } from 'vitest'
import { SigningType } from '@ecadlabs/beacon-types'
import { managerOperations as operations } from './type-fixtures/manager-operations'
import {
  encodeTzip10RawPayload,
  inspectSignPayload,
  isPartialTezosOperation,
  sanitizePartialTezosOperations
} from '../src/wallet'

describe('wallet manager operation helpers', () => {
  it('rejects sparse operation batches and sparse nested sequences', () => {
    expect(() => sanitizePartialTezosOperations(new Array(1))).toThrow(/index 0/)
    expect(isPartialTezosOperation({ kind: 'register_global_constant', value: new Array(1) })).toBe(
      false
    )
  })

  it.each(operations)('preserves the supported $kind fields', (operation) => {
    expect(isPartialTezosOperation(operation)).toBe(true)
    expect(sanitizePartialTezosOperations([operation])).toEqual([operation])
  })
  it('strips wallet-owned and unknown fields without mutating input or nested values', () => {
    const input = {
      ...operations[0],
      source: 'spoof',
      fee: '1',
      counter: '2',
      injected: true,
      gas_limit: '100',
      storage_limit: '2.5',
      parameters: { entrypoint: 'default', value: { int: '7', source: 'spoof' }, extra: true }
    }
    const before = JSON.stringify(input)
    const result = sanitizePartialTezosOperations([input])
    expect(result).toEqual([{ ...operations[0], gas_limit: '100' }])
    expect(JSON.stringify(input)).toBe(before)
    expect(result[0]).not.toBe(input)
    expect(isPartialTezosOperation(input)).toBe(false)
  })
  it.each(['-1', '1.5', '', ' 2 ', 2, NaN])(
    'strips a noncanonical gas/storage value %s',
    (limit) => {
      expect(
        sanitizePartialTezosOperations([
          { kind: 'delegation', gas_limit: limit, storage_limit: limit }
        ])
      ).toEqual([{ kind: 'delegation' }])
    }
  )
  it.each([
    null,
    [],
    { kind: 'endorsement' },
    { kind: 'transaction', amount: 1, destination: 'tz1' },
    { kind: 'transaction', amount: '-1', destination: 'tz1' },
    { kind: 'origination', balance: '0' },
    { kind: 'register_global_constant', value: { prim: 'NOT_A_PRIMITIVE' } }
  ])('rejects invalid or unsupported input %j', (operation) => {
    expect(isPartialTezosOperation(operation)).toBe(false)
    expect(() => sanitizePartialTezosOperations([operations[0], operation])).toThrow(/index 1/)
  })
  it('rejects malformed nested refutations and cyclic or overdeep Micheline', () => {
    const recursive: { prim: string; args?: unknown[] } = { prim: 'Pair' }
    recursive.args = [recursive]
    expect(isPartialTezosOperation({ kind: 'register_global_constant', value: recursive })).toBe(
      false
    )
    expect(
      isPartialTezosOperation({
        ...operations[15],
        refutation: { refutation_kind: 'move', choice: '0', step: [{ tick: -1 }] }
      })
    ).toBe(false)
  })
  it('preserves move/proof forms and strips nested untrusted properties', () => {
    const operation = {
      ...operations[15],
      refutation: {
        refutation_kind: 'move',
        choice: '0',
        step: {
          pvm_step: '00',
          extra: true,
          input_proof: {
            input_proof_kind: 'reveal_proof',
            reveal_proof: {
              reveal_proof_kind: 'dal_page_proof',
              dal_page_id: { published_level: 1, slot_index: 0, page_index: 0 },
              dal_proof: '00'
            }
          }
        }
      }
    }
    const result = sanitizePartialTezosOperations([operation])
    expect(JSON.stringify(result)).not.toContain('extra')
    expect(isPartialTezosOperation(result[0])).toBe(true)
  })
})

describe('signing payload inspection', () => {
  it('preserves BOM-leading text and recognizes packed previews for explicit RAW requests', () => {
    expect(encodeTzip10RawPayload('\uFEFFa')).toBe('050100000004efbbbf61')
    expect(inspectSignPayload('050100000004efbbbf61', SigningType.MICHELINE)).toMatchObject({
      valid: true,
      decodedText: '\uFEFFa'
    })
    expect(() => encodeTzip10RawPayload('\ud800')).toThrow(/Unicode/)
    expect(
      inspectSignPayload(encodeTzip10RawPayload('Tezos Signed Message: hello'), SigningType.RAW)
    ).toMatchObject({ valid: true, kind: 'tzip10_message' })
    expect(inspectSignPayload('0300', SigningType.RAW)).toMatchObject({
      valid: true,
      kind: 'operation',
      validation: 'watermark_only'
    })
    expect(inspectSignPayload('05ff', SigningType.RAW)).toMatchObject({
      valid: true,
      kind: 'raw_bytes',
      validation: 'hex'
    })
  })

  it('encodes UTF-8 byte length and only labels the signed-message convention when present', () => {
    expect(encodeTzip10RawPayload('é')).toBe('050100000002c3a9')
    expect(inspectSignPayload(encodeTzip10RawPayload('é'), SigningType.MICHELINE)).toMatchObject({
      valid: true,
      kind: 'micheline',
      decodedText: 'é',
      validation: 'canonical_micheline'
    })
    const text = 'Tezos Signed Message: example.org hello 🌍'
    const encoded = encodeTzip10RawPayload(text)
    expect(inspectSignPayload('0x' + encoded.toUpperCase())).toMatchObject({
      valid: true,
      kind: 'tzip10_message',
      decodedText: text,
      normalizedHex: encoded
    })
  })
  it('reports a valid nested BOM string as unsupported by the current canonical decoder', () => {
    expect(inspectSignPayload('0502000000090100000004efbbbf61', SigningType.MICHELINE)).toEqual({
      valid: false,
      reason: 'Unsupported or noncanonical packed Micheline encoding'
    })
  })
  it('accepts complete canonical packed data and rejects malformed/trailing/noncanonical bytes', () => {
    expect(inspectSignPayload('050007', SigningType.MICHELINE)).toMatchObject({
      valid: true,
      kind: 'micheline'
    })
    for (const payload of ['05', '05010000000261', '050100000001ff', '05000700', '05008000']) {
      expect(inspectSignPayload(payload, SigningType.MICHELINE)).toMatchObject({ valid: false })
    }
  })
  it('keeps raw input hex-only and explicitly limits operation inspection to its watermark', () => {
    expect(inspectSignPayload('hello', SigningType.RAW)).toMatchObject({ valid: false })
    expect(inspectSignPayload('a', SigningType.RAW)).toMatchObject({ valid: false })
    expect(inspectSignPayload(' 00', SigningType.RAW)).toMatchObject({ valid: false })
    expect(inspectSignPayload('0xABCD', SigningType.RAW)).toEqual({
      valid: true,
      normalizedHex: 'abcd',
      kind: 'raw_bytes',
      validation: 'hex'
    })
    expect(inspectSignPayload('0300', SigningType.OPERATION)).toEqual({
      valid: true,
      normalizedHex: '0300',
      kind: 'operation',
      validation: 'watermark_only'
    })
    expect(inspectSignPayload('050007', SigningType.OPERATION)).toMatchObject({ valid: false })
    expect(inspectSignPayload('03', SigningType.OPERATION)).toMatchObject({ valid: false })
    expect(inspectSignPayload('03', SigningType.RAW)).toEqual({
      valid: true,
      normalizedHex: '03',
      kind: 'raw_bytes',
      validation: 'hex'
    })
  })
})
