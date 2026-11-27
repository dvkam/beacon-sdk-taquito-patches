const assert = require('node:assert/strict')
const { test } = require('node:test')

test('public wallet helpers inspect and sanitize installed package values', async () => {
  const common = require('@ecadlabs/beacon-utils/wallet')
  const imported = await import('@ecadlabs/beacon-utils/wallet')
  assert.equal(imported.default, common)
  for (const key of Object.keys(common)) {
    if (key === '__esModule') continue
    assert.equal(imported[key], common[key], key)
  }
  for (const name of [
    '@ecadlabs/beacon-utils',
    '@ecadlabs/beacon-wallet',
    '@ecadlabs/beacon-sdk'
  ]) {
    assert.equal(Object.hasOwn(require(name), 'inspectSignPayload'), false)
  }
  const { packMessageText, inspectSignPayload, sanitizePartialTezosOperations } = common
  const { SigningType } = require('@ecadlabs/beacon-types')
  for (const prim of ['UNPAIR', 'PUSH', 'VIEW', 'EMIT', 'Lambda_rec', 'constant', 'Ticket']) {
    const operation = { kind: 'register_global_constant', value: { prim } }
    assert.equal(common.isPartialTezosOperation(operation), true, prim)
    assert.deepEqual(sanitizePartialTezosOperations([operation]), [operation])
  }
  for (const prim of ['NOT_A_PRIMITIVE', '__proto__', 'constructor', 'toString']) {
    assert.equal(
      common.isPartialTezosOperation({ kind: 'register_global_constant', value: { prim } }),
      false,
      prim
    )
  }
  const text = 'Tezos Signed Message: installed consumer é'
  assert.equal(inspectSignPayload(packMessageText(text), SigningType.RAW).decodedText, text)
  assert.equal(packMessageText('\uFEFFa'), '050100000004efbbbf61')
  assert.deepEqual(
    sanitizePartialTezosOperations([
      { kind: 'transaction', source: 'spoof', amount: '1', destination: 'tz1destination' }
    ]),
    [{ kind: 'transaction', amount: '1', destination: 'tz1destination' }]
  )
})

test('the strict operation guard rejects structural extras without mutating inputs', () => {
  const { isPartialTezosOperation } = require('@ecadlabs/beacon-utils/wallet')
  const operation = { kind: 'delegation', metadata: { label: 'untrusted' } }
  assert.equal(isPartialTezosOperation(operation), false)
  assert.deepEqual(operation, { kind: 'delegation', metadata: { label: 'untrusted' } })

  const valid = { kind: 'delegation' }
  assert.equal(isPartialTezosOperation(valid), true)
  assert.deepEqual(Reflect.ownKeys(valid), ['kind'])
})

test('the installed strict guard rejects own undefined optional fields at every depth', () => {
  const {
    isPartialTezosOperation,
    sanitizePartialTezosOperations
  } = require('@ecadlabs/beacon-utils/wallet')
  const delegation = { kind: 'delegation', delegate: undefined }
  const constant = {
    kind: 'register_global_constant',
    value: { prim: 'Some', args: undefined }
  }
  assert.equal(isPartialTezosOperation(delegation), false)
  assert.equal(isPartialTezosOperation(constant), false)
  assert.deepEqual(sanitizePartialTezosOperations([delegation, constant]), [
    { kind: 'delegation' },
    { kind: 'register_global_constant', value: { prim: 'Some' } }
  ])
  assert.equal(isPartialTezosOperation({ kind: 'delegation' }), true)
  assert.equal(isPartialTezosOperation({ kind: 'delegation', delegate: 'tz1delegate' }), true)
})

test('the installed preview bounds repeated codec work and preserves small nested data', () => {
  const { inspectSignPayload } = require('@ecadlabs/beacon-utils/wallet')
  const { SigningType } = require('@ecadlabs/beacon-types')
  for (const payload of ['0505090306', '05050905090a000000020000']) {
    assert.equal(inspectSignPayload(payload, SigningType.MICHELINE).valid, true)
  }
  const codec = require('@taquito/michel-codec')
  const unpack = codec.unpackDataBytes
  let calls = 0
  codec.unpackDataBytes = () => {
    calls++
    throw new Error('Over-budget payload must not reach the decoder')
  }
  try {
    const payload = '05' + '0509'.repeat(18) + '0306'
    assert.equal(inspectSignPayload(payload, SigningType.MICHELINE).valid, false)
    assert.equal(calls, 0)
    assert.equal(inspectSignPayload(payload, SigningType.RAW).kind, 'raw_bytes')
    assert.equal(calls, 0)
  } finally {
    codec.unpackDataBytes = unpack
  }
})

test('installed scalar framing matches the codec and supports the encoded byte limit', () => {
  const { packMessageText, inspectSignPayload } = require('@ecadlabs/beacon-utils/wallet')
  const { packDataBytes } = require('@taquito/michel-codec')
  const { SigningType } = require('@ecadlabs/beacon-types')
  for (const text of ['', 'hello', 'é', '🌍', '\uFEFFa']) {
    assert.equal(packMessageText(text), packDataBytes({ string: text }).bytes)
  }
  for (const bytes of ['', '00', 'ff00ab']) {
    const payload = packDataBytes({ bytes }).bytes
    assert.equal(inspectSignPayload(payload, SigningType.MICHELINE).valid, true)
  }
  const text = 'a'.repeat(1024 * 1024 - 6)
  const payload = packMessageText(text)
  assert.equal(payload.length / 2, 1024 * 1024)
  assert.equal(inspectSignPayload(payload, SigningType.MICHELINE).decodedText, text)
  const bytePayload = '050a000ffffa' + 'ab'.repeat(1024 * 1024 - 6)
  assert.equal(inspectSignPayload(bytePayload, SigningType.MICHELINE).valid, true)
})

test('the preview excludes PUSH instructions encoded by the installed codec', () => {
  const { inspectSignPayload } = require('@ecadlabs/beacon-utils/wallet')
  const { packDataBytes } = require('@taquito/michel-codec')
  const { SigningType } = require('@ecadlabs/beacon-types')
  const push = { prim: 'PUSH', args: [{ prim: 'unit' }, { prim: 'Unit' }] }
  for (const data of [push, [push]]) {
    const payload = packDataBytes(data).bytes
    assert.equal(inspectSignPayload(payload, SigningType.MICHELINE).valid, false)
    assert.equal(inspectSignPayload(payload, SigningType.RAW).kind, 'raw_bytes')
  }
})
