const assert = require('node:assert/strict')
const { lstatSync, readFileSync, realpathSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const packages = require('./packages.json')

test('every published CommonJS entry loads from the isolated installation without a DOM', () => {
  assert.equal(typeof window, 'undefined')
  assert.equal(typeof document, 'undefined')
  for (const { name, version } of packages) {
    const packageRoot = path.join(__dirname, 'node_modules', name)
    assert.equal(lstatSync(packageRoot).isSymbolicLink(), false, name)
    const relativeEntry = path.relative(
      realpathSync(packageRoot),
      realpathSync(require.resolve(name))
    )
    assert.ok(
      relativeEntry !== '..' &&
        !relativeEntry.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativeEntry),
      `${name} must resolve inside its installed tarball`
    )
    const installed = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
    assert.equal(installed.name, name)
    assert.equal(installed.version, version)
    assert.doesNotThrow(() => require(name), name)
  }
  assert.equal(typeof window, 'undefined')
  assert.equal(typeof document, 'undefined')
})

test('the public hash function matches the BLAKE2b-256 empty-input vector', async () => {
  const { getHexHash } = require('@ecadlabs/beacon-utils')
  assert.equal(
    await getHexHash(''),
    '0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8'
  )
})

test('public cryptobox functions round-trip real keys and reject tampered payloads', async () => {
  const {
    getKeypairFromSeed,
    sealCryptobox,
    openCryptobox,
    encryptCryptoboxPayload,
    decryptCryptoboxPayload
  } = require('@ecadlabs/beacon-utils')
  const keys = await getKeypairFromSeed('node consumer compatibility fixture')
  assert.deepEqual(await getKeypairFromSeed('node consumer compatibility fixture'), keys)
  assert.equal(keys.publicKey.length, 32)
  assert.equal(keys.secretKey.length, 64)

  const message = 'Beacon \u2014 Tezos \ud83d\udd10'
  const sealed = Buffer.from(await sealCryptobox(message, keys.publicKey), 'hex')
  assert.equal(await openCryptobox(sealed, keys.publicKey, keys.secretKey), message)
  const tamperedSealed = Buffer.from(sealed)
  tamperedSealed[tamperedSealed.length - 1] ^= 1
  await assert.rejects(
    openCryptobox(tamperedSealed, keys.publicKey, keys.secretKey),
    /Decryption failed/
  )

  const sharedKey = new Uint8Array(32).fill(7)
  const encrypted = Buffer.from(await encryptCryptoboxPayload(message, sharedKey), 'hex')
  assert.equal(await decryptCryptoboxPayload(encrypted, sharedKey), message)
  const tamperedEncrypted = Buffer.from(encrypted)
  tamperedEncrypted[tamperedEncrypted.length - 1] ^= 1
  await assert.rejects(decryptCryptoboxPayload(tamperedEncrypted, sharedKey), /Decryption failed/)
})

test('the public Serializer round-trips messages and rejects invalid encodings', async () => {
  const { Serializer } = require('@ecadlabs/beacon-core')
  const serializer = new Serializer()
  const message = { id: 'node-consumer', version: '2', type: 'acknowledge', text: '\u03bb' }
  assert.deepEqual(await serializer.deserialize(await serializer.serialize(message)), message)
  await assert.rejects(serializer.deserialize('not a base58check payload'))
})

test('browser LocalStorage is unavailable in a headless Node consumer', async () => {
  const { LocalStorage } = require('@ecadlabs/beacon-core')
  assert.equal(typeof window, 'undefined')
  assert.equal(await LocalStorage.isSupported(), false)
})
