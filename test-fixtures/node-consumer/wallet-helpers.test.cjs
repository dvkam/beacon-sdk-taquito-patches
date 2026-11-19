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
