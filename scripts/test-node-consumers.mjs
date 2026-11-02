import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
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
    dependencies
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
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
