'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { ESLint } = require('eslint')

const eslint = new ESLint({ cwd: path.resolve(__dirname, '../..') })

test('unused suppressions fail while a required console exception remains valid', async () => {
  const config = await eslint.calculateConfigForFile('packages/beacon-core/src/debug.ts')
  const policy = new ESLint({
    overrideConfigFile: true,
    overrideConfig: {
      linterOptions: config.linterOptions,
      rules: { 'no-console': config.rules['no-console'] }
    }
  })
  const [unused] = await policy.lintText(
    '// eslint-disable-next-line no-console\nexport const value = 1\n'
  )
  assert.equal(unused.errorCount, 1)
  assert.equal(unused.messages.length, 1)
  assert.match(unused.messages[0].message, /Unused eslint-disable directive/)
  assert.equal(unused.messages[0].severity, 2)

  const [required] = await policy.lintText(
    '// eslint-disable-next-line no-console\nconsole.warn("required diagnostic")\n'
  )
  assert.deepEqual(required.messages, [])
})

test('only underscore-prefixed arguments are exempt from unused-variable findings', async () => {
  const ruleId = '@typescript-eslint/no-unused-vars'
  const config = await eslint.calculateConfigForFile('packages/beacon-blockchain-tezos/src/blockchain.ts')
  const unusedVariables = new ESLint({
    overrideConfigFile: true,
    overrideConfig: {
      plugins: { '@typescript-eslint': config.plugins['@typescript-eslint'] },
      rules: { [ruleId]: config.rules[ruleId] }
    }
  })
  const source = `
    export function placeholder(_ignored, input) {
      const _local = 1
      return undefined
    }
  `
  const [report] = await unusedVariables.lintText(source)

  assert.deepEqual(
    report.messages.map(({ ruleId, severity, line, column, endColumn }) => ({
      ruleId,
      severity,
      name: source.split('\n')[line - 1].slice(column - 1, endColumn - 1)
    })),
    [
      { ruleId, severity: 2, name: 'input' },
      { ruleId, severity: 2, name: '_local' }
    ]
  )
})


test('tooling imports accept owner and root dependencies without borrowing sibling declarations', async () => {
  const tooling = new ESLint({ cwd: path.resolve(__dirname, '../..'), overrideConfigFile: 'eslint.tooling.config.mjs' })
  const [shared, owned, sibling] = await Promise.all([
    tooling.lintText("import { test } from 'vitest'\n", { filePath: 'packages/beacon-core/__tests__/debug.test.ts' }),
    tooling.lintText("import QRCode from 'qrcode'\n", { filePath: 'packages/beacon-ui/__tests__/components/info.test.tsx' }),
    tooling.lintText("import QRCode from 'qrcode'\n", { filePath: 'packages/beacon-core/__tests__/debug.test.ts' })
  ])
  assert.deepEqual(shared[0].messages, [])
  assert.deepEqual(owned[0].messages, [])
  assert.deepEqual(sibling[0].messages.map(({ ruleId }) => ruleId), ['import/no-extraneous-dependencies'])
})
