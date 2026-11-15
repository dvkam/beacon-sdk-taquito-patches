'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

test('README regeneration updates scaffolds and preserves authored documentation on repeated runs', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-readmes-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const packages = fs
    .readdirSync(path.resolve(__dirname, '../../packages'))
    .filter((dir) => fs.existsSync(path.resolve(__dirname, '../../packages', dir, 'package.json')))
  for (const dir of packages) {
    const packageDir = path.join(root, 'packages', dir)
    fs.mkdirSync(packageDir, { recursive: true })
    fs.writeFileSync(
      path.join(packageDir, 'package.json'),
      JSON.stringify({
        name: `@fixture/${dir}`,
        description: 'Current package description.'
      })
    )
  }

  const marker = '<!-- Package-specific documentation -->'
  const authored = `${marker}

## Restoring a session

Keep this authored text and its trailing blank lines.

\`\`\`ts
await client.getActiveAccount()
\`\`\`

`
  const dappReadme = path.join(root, 'packages/beacon-dapp/README.md')
  fs.writeFileSync(dappReadme, `# Stale generated title\n\nOld description.\n\n${authored}`)
  const run = () =>
    execFileSync(process.execPath, [path.resolve(__dirname, '../sync-package-readmes.mjs')], {
      cwd: root
    })

  run()

  const updated = fs.readFileSync(dappReadme, 'utf8')
  assert.ok(updated.startsWith('# `@fixture/beacon-dapp`\n\nCurrent package description.\n'))
  assert.ok(!updated.includes('Old description.'))
  assert.ok(updated.endsWith(authored))
  assert.equal(updated.split(marker).length, 2)
  const coreReadme = fs.readFileSync(path.join(root, 'packages/beacon-core/README.md'), 'utf8')
  assert.ok(coreReadme.startsWith('# `@fixture/beacon-core`\n'))
  assert.ok(!coreReadme.includes(marker))

  const before = packages.map((dir) =>
    fs.readFileSync(path.join(root, 'packages', dir, 'README.md'), 'utf8')
  )
  run()
  assert.deepEqual(
    packages.map((dir) => fs.readFileSync(path.join(root, 'packages', dir, 'README.md'), 'utf8')),
    before
  )
})
