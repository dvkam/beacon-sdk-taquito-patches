import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('keeps sanitized operations compatible with existing public operation requests', () => {
  const require = createRequire(import.meta.url)
  const target = fileURLToPath(
    new URL('./type-fixtures/tsconfig.wallet-helpers.json', import.meta.url)
  )
  const result = spawnSync(
    process.execPath,
    [require.resolve('typescript/bin/tsc'), '--project', target, '--pretty', 'false'],
    { encoding: 'utf8', timeout: 30000 }
  )
  expect(result.error, String(result.error)).toBeUndefined()
  expect(result.status, result.stdout + result.stderr).toBe(0)
}, 35000)
