import { getSenderId, windowRef } from '@ecadlabs/beacon-core'
import { KeyPair, openCryptobox } from '@ecadlabs/beacon-utils'
import { ExtensionMessageTarget, Origin } from '@ecadlabs/beacon-types'
import { PostMessageClient } from '../src/PostMessageClient'

jest.mock('@ecadlabs/beacon-core', () => ({
  ...jest.requireActual('@ecadlabs/beacon-core'),
  windowRef: {
    postMessage: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    location: { origin: 'https://dapp.example' }
  },
  getSenderId: jest.fn().mockResolvedValue('beacon-sender-id')
}))

jest.mock('@ecadlabs/beacon-utils', () => ({
  ...jest.requireActual('@ecadlabs/beacon-utils'),
  openCryptobox: jest.fn(),
  secretbox_NONCEBYTES: 8,
  secretbox_MACBYTES: 16
}))

class TestClient extends PostMessageClient {
  readonly decrypt = jest.fn<Promise<string>, [string, string]>().mockResolvedValue('plaintext')

  protected override async decryptMessage(
    senderPublicKey: string,
    payload: string
  ): Promise<string> {
    return this.decrypt(senderPublicKey, payload)
  }
}

const keyPair: KeyPair = {
  publicKey: new Uint8Array(32),
  secretKey: new Uint8Array(64)
}
const pairingPayload = 'aa'.repeat(24)
const pairingResponse = {
  id: 'pairing-id',
  name: 'Wallet',
  publicKey: '00'.repeat(32),
  version: '2'
}

const encryptedEvent = () => ({
  source: windowRef,
  origin: windowRef.location.origin,
  data: {
    message: {
      target: ExtensionMessageTarget.PAGE,
      targetId: 'sdk-instance',
      encryptedPayload: 'ciphertext'
    },
    sender: { id: 'extension-id' }
  }
})

const openingEvent = () => ({
  source: windowRef,
  origin: windowRef.location.origin,
  data: {
    message: {
      target: ExtensionMessageTarget.PAGE,
      targetId: 'sdk-instance',
      payload: pairingPayload
    },
    sender: { id: 'extension-id' }
  }
})

const registeredListener = (): ((event: unknown) => unknown) => {
  const calls = jest.mocked(windowRef.addEventListener).mock.calls
  const registered = calls[calls.length - 1]
  if (!registered) {
    throw new Error('Expected the public API to register a message listener')
  }
  return registered[1]
}

describe('PostMessageClient inbound envelopes', () => {
  let client: TestClient

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(openCryptobox).mockResolvedValue(JSON.stringify(pairingResponse))
    client = new TestClient('Dapp', keyPair)
  })

  it.each([
    { sender: { id: 'extension-id' }, expectedId: 'extension-id' },
    { sender: {}, expectedId: '' }
  ])('forwards encrypted messages with sender $expectedId', async ({ sender, expectedId }) => {
    let delivered!: () => void
    const notification = new Promise<void>((resolve) => {
      delivered = resolve
    })
    const callback = jest.fn(() => delivered())
    await client.listenForEncryptedMessage('peer-public-key', callback)
    const event = {
      ...encryptedEvent(),
      data: { ...encryptedEvent().data, sender }
    }

    await registeredListener()(event)
    await notification

    expect(client.decrypt).toHaveBeenCalledWith('peer-public-key', 'ciphertext')
    expect(callback).toHaveBeenCalledWith('plaintext', {
      origin: Origin.EXTENSION,
      id: expectedId
    })
  })

  it.each([
    { name: 'undefined event', make: () => undefined },
    { name: 'null event', make: () => null },
    {
      name: 'untrusted source',
      make: () => ({ ...encryptedEvent(), source: {} })
    },
    {
      name: 'untrusted origin',
      make: () => ({ ...encryptedEvent(), origin: 'https://other.example' })
    },
    {
      name: 'missing data',
      make: () => ({ ...encryptedEvent(), data: undefined })
    },
    { name: 'array data', make: () => ({ ...encryptedEvent(), data: [] }) },
    {
      name: 'extension target',
      make: () => ({
        ...encryptedEvent(),
        data: {
          ...encryptedEvent().data,
          message: {
            target: ExtensionMessageTarget.EXTENSION,
            encryptedPayload: 'ciphertext'
          }
        }
      })
    },
    {
      name: 'numeric encrypted payload',
      make: () => ({
        ...encryptedEvent(),
        data: {
          ...encryptedEvent().data,
          message: {
            target: ExtensionMessageTarget.PAGE,
            encryptedPayload: 42
          }
        }
      })
    },
    {
      name: 'missing sender',
      make: () => ({
        ...encryptedEvent(),
        data: { ...encryptedEvent().data, sender: undefined }
      })
    },
    {
      name: 'array sender',
      make: () => ({
        ...encryptedEvent(),
        data: { ...encryptedEvent().data, sender: [] }
      })
    },
    {
      name: 'numeric target id',
      make: () => ({
        ...encryptedEvent(),
        data: {
          ...encryptedEvent().data,
          message: { ...encryptedEvent().data.message, targetId: 42 }
        }
      })
    },
    {
      name: 'numeric sender id',
      make: () => ({
        ...encryptedEvent(),
        data: { ...encryptedEvent().data, sender: { id: 42 } }
      })
    }
  ])('ignores encrypted input with $name before decryption', async ({ make }) => {
    const callback = jest.fn()
    await client.listenForEncryptedMessage('peer-public-key', callback)

    await expect(
      Promise.resolve().then(() => registeredListener()(make()))
    ).resolves.toBeUndefined()

    expect(client.decrypt).not.toHaveBeenCalled()
    expect(callback).not.toHaveBeenCalled()
  })

  it('delivers a valid channel opening with its extension identity', async () => {
    const callback = jest.fn()
    await client.listenForChannelOpening(callback)

    await registeredListener()(openingEvent())

    expect(openCryptobox).toHaveBeenCalledWith(
      Buffer.from(pairingPayload, 'hex'),
      keyPair.publicKey,
      keyPair.secretKey
    )
    expect(getSenderId).toHaveBeenCalledWith(pairingResponse.publicKey)
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        ...pairingResponse,
        extensionId: 'extension-id',
        senderId: 'beacon-sender-id'
      })
    )
  })

  it.each([
    { name: 'null event', make: () => null },
    {
      name: 'missing data',
      make: () => ({ ...openingEvent(), data: undefined })
    },
    {
      name: 'untrusted source',
      make: () => ({ ...openingEvent(), source: {} })
    },
    {
      name: 'untrusted origin',
      make: () => ({ ...openingEvent(), origin: 'https://other.example' })
    },
    {
      name: 'extension target',
      make: () => ({
        ...openingEvent(),
        data: {
          ...openingEvent().data,
          message: {
            target: ExtensionMessageTarget.EXTENSION,
            payload: pairingPayload
          }
        }
      })
    },
    {
      name: 'numeric payload',
      make: () => ({
        ...openingEvent(),
        data: {
          ...openingEvent().data,
          message: { target: ExtensionMessageTarget.PAGE, payload: 42 }
        }
      })
    },
    {
      name: 'missing sender',
      make: () => ({
        ...openingEvent(),
        data: { ...openingEvent().data, sender: undefined }
      })
    },
    {
      name: 'missing sender id',
      make: () => ({
        ...openingEvent(),
        data: { ...openingEvent().data, sender: {} }
      })
    },
    {
      name: 'numeric target id',
      make: () => ({
        ...openingEvent(),
        data: {
          ...openingEvent().data,
          message: { ...openingEvent().data.message, targetId: 42 }
        }
      })
    },
    {
      name: 'numeric sender id',
      make: () => ({
        ...openingEvent(),
        data: { ...openingEvent().data, sender: { id: 42 } }
      })
    }
  ])('ignores channel opening input with $name before cryptography', async ({ make }) => {
    const callback = jest.fn()
    await client.listenForChannelOpening(callback)

    await expect(
      Promise.resolve().then(() => registeredListener()(make()))
    ).resolves.toBeUndefined()

    expect(openCryptobox).not.toHaveBeenCalled()
    expect(callback).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'null', value: null, expected: false },
    { name: 'primitive', value: 17, expected: false },
    {
      name: 'shadowed method and numeric payload',
      value: { payload: 17, hasOwnProperty: null },
      expected: true
    },
    {
      name: 'null-prototype own payload',
      value: Object.assign(Object.create(null), { payload: 'ciphertext' }),
      expected: true
    },
    {
      name: 'inherited payload',
      value: Object.create({ payload: 'ciphertext' }),
      expected: false
    },
    {
      name: 'array with own payload',
      value: Object.assign([], { payload: 17 }),
      expected: true
    }
  ])('recognizes only own payload presence for $name', async ({ value, expected }) => {
    await expect(client.isChannelOpenMessage(value)).resolves.toBe(expected)
  })

  it('captures validated pairing payload and identity before the asynchronous recognition step', async () => {
    const callback = jest.fn()
    await client.listenForChannelOpening(callback)
    const event = openingEvent()

    const operation = registeredListener()(event)
    event.data.message.payload = 'bb'.repeat(24)
    event.data.sender.id = 'changed-after-dispatch'
    await operation

    expect(openCryptobox).toHaveBeenCalledWith(
      Buffer.from(pairingPayload, 'hex'),
      keyPair.publicKey,
      keyPair.secretKey
    )
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ extensionId: 'extension-id' }))
  })
})
