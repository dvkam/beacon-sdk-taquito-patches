import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  getWorkspacePackages,
  readJson,
  repoRoot,
  rootPackagePath,
  writeJson
} from './workspace-utils.mjs'

const packages = getWorkspacePackages().filter(({ manifest }) => !manifest.private)
const npmCli = process.env.npm_execpath
const expectedNpm = readJson(rootPackagePath).packageManager.replace(/^npm@/, '')
const env = { ...process.env }
delete env.NODE_PATH

function run(args, cwd, { capture = false, timeout = 180_000 } = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    env,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout
  })
  if (result.error || result.status !== 0) {
    throw new Error(
      `Child process failed (status ${result.status}, signal ${result.signal ?? 'none'}): ${args.join(' ')}`,
      { cause: result.error }
    )
  }
  return result.stdout
}

if (!npmCli || !existsSync(npmCli)) {
  throw new Error(
    'Run this check through npm run test:node-consumers using the pinned npm version.'
  )
}
const npmVersion = run([npmCli, '--version'], repoRoot, { capture: true }).trim()
if (npmVersion !== expectedNpm) {
  throw new Error(`Expected npm ${expectedNpm}, received ${npmVersion}. Use scripts/npm11.sh.`)
}
if (packages.length === 0) {
  throw new Error('No public workspace packages found.')
}

const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'beacon-node-consumer-'))
try {
  const archiveRoot = path.join(temporaryRoot, 'tarballs')
  const consumerRoot = path.join(temporaryRoot, 'consumer')
  mkdirSync(archiveRoot)
  mkdirSync(consumerRoot)

  const dependencies = {}
  for (const { directory, manifest } of packages) {
    const packed = JSON.parse(
      run(
        [
          npmCli,
          'pack',
          '--json',
          '--ignore-scripts',
          '--workspaces=false',
          '--pack-destination',
          archiveRoot
        ],
        directory,
        { capture: true }
      )
    )
    const archive = packed[0]
    if (
      packed.length !== 1 ||
      archive.name !== manifest.name ||
      archive.version !== manifest.version ||
      typeof archive.filename !== 'string' ||
      path.basename(archive.filename) !== archive.filename
    ) {
      throw new Error(`Unexpected npm pack output for ${manifest.name}.`)
    }
    dependencies[manifest.name] = `file:${path.join(archiveRoot, archive.filename)}`
  }

  writeJson(path.join(consumerRoot, 'package.json'), {
    name: 'beacon-node-consumer',
    version: '1.0.0',
    private: true,
    type: 'commonjs',
    dependencies,
    devDependencies: {
      '@types/node': readJson(rootPackagePath).devDependencies['@types/node']
    }
  })
  writeJson(
    path.join(consumerRoot, 'packages.json'),
    packages.map(({ manifest }) => ({ name: manifest.name, version: manifest.version }))
  )
  copyFileSync(
    path.join(repoRoot, 'test-fixtures', 'node-consumer', 'public-api.test.cjs'),
    path.join(consumerRoot, 'public-api.test.cjs')
  )

  console.log(
    `Testing ${packages.length} installed packages with Node ${process.version}, npm ${npmVersion}.`
  )
  run([npmCli, 'install', '--ignore-scripts', '--no-audit', '--no-fund'], consumerRoot, {
    timeout: 300_000
  })
  run(['--test', 'public-api.test.cjs'], consumerRoot)
  run(
    [
      '-e',
      [
        "const assert = require('node:assert/strict')",
        "for (const name of ['@taquito/michel-codec', '@taquito/core']) {",
        "  assert.throws(() => require.resolve(name), { code: 'MODULE_NOT_FOUND' })",
        '}',
        "assert.throws(() => require('@ecadlabs/beacon-utils/wallet'), (error) =>",
        "  error.code === 'MODULE_NOT_FOUND' && error.message.includes('@taquito/michel-codec'))"
      ].join('\n')
    ],
    consumerRoot
  )

  const typecheck = (file, types = ['chrome']) => {
    for (const [module, moduleResolution] of [
      ['NodeNext', 'NodeNext'],
      ['ESNext', 'Bundler']
    ]) {
      writeJson(path.join(consumerRoot, 'tsconfig.consumer.json'), {
        compilerOptions: {
          noEmit: true,
          strict: true,
          skipLibCheck: false,
          target: 'ES2024',
          lib: ['ES2024', 'DOM'],
          types,
          module,
          moduleResolution
        },
        files: [file]
      })
      console.log('Typechecking ' + file + ' with ' + moduleResolution + ' resolution.')
      run(
        [
          path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
          '--project',
          'tsconfig.consumer.json',
          '--pretty',
          'false'
        ],
        consumerRoot
      )
    }
  }

  writeFileSync(
    path.join(consumerRoot, 'root-import.types.ts'),
    "import { getHexHash } from '@ecadlabs/beacon-utils'\nexport const hash: Promise<string> = getHexHash('')\n"
  )
  typecheck('root-import.types.ts', ['node', 'chrome'])
  for (const file of ['wallet-helpers.types.ts', 'wallet-helpers.test.cjs']) {
    copyFileSync(
      path.join(repoRoot, 'test-fixtures', 'node-consumer', file),
      path.join(consumerRoot, file)
    )
  }
  for (const version of ['25.1.1', '25.2.0-beta3']) {
    console.log('Testing opt-in wallet helpers with @taquito/michel-codec ' + version + '.')
    run(
      [
        npmCli,
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '@taquito/michel-codec@' + version
      ],
      consumerRoot,
      { timeout: 300_000 }
    )
    typecheck('wallet-helpers.types.ts')
    run(['--test', 'wallet-helpers.test.cjs'], consumerRoot)
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
