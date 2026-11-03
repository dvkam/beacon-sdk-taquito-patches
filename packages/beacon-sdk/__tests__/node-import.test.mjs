import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import { DAppClient, Serializer } from '@ecadlabs/beacon-sdk'
import { DAppClient as DirectDAppClient } from '@ecadlabs/beacon-dapp'

const require = createRequire(import.meta.url)

test('Node imports share the SDK runtime with require', () => {
  const sdk = require('@ecadlabs/beacon-sdk')
  assert.equal(typeof DAppClient, 'function')
  assert.equal(typeof Serializer, 'function')
  assert.equal(DAppClient, sdk.DAppClient)
  assert.equal(DAppClient, DirectDAppClient)
  assert.equal(Serializer, sdk.Serializer)
})
