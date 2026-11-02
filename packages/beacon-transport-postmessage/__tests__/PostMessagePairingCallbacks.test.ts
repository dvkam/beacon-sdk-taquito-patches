import { Logger, windowRef } from '@ecadlabs/beacon-core'
import {
  ExposedPromise,
  KeyPair,
  openCryptobox,
  secretbox_NONCEBYTES,
  secretbox_MACBYTES
} from '@ecadlabs/beacon-utils'
import { ExtensionMessageTarget } from '@ecadlabs/beacon-types'
import { PostMessageClient } from '../src/PostMessageClient'

jest.mock('@ecadlabs/beacon-core', () => ({
  ...jest.requireActual('@ecadlabs/beacon-core'),
  windowRef: {
    addEventListener: jest.fn(),
    location: { origin: 'https://dapp.example' }
  },
  getSenderId: jest.fn().mockResolvedValue('beacon-sender-id')
}))

jest.mock('@ecadlabs/beacon-utils', () => ({
  ...jest.requireActual('@ecadlabs/beacon-utils'),
  openCryptobox: jest.fn()
}))

const keyPair: KeyPair = {
  publicKey: new Uint8Array(32),
  secretKey: new Uint8Array(64)
}
const pairingResponse = {
  id: 'pairing-id',
  name: 'Wallet',
  publicKey: '00'.repeat(32),
  version: '2'
}
const openingEvent = () => ({
  source: windowRef,
  origin: windowRef.location.origin,
  data: {
    message: {
      target: ExtensionMessageTarget.PAGE,
      payload: 'aa'.repeat(secretbox_NONCEBYTES + secretbox_MACBYTES)
    },
    sender: { id: 'extension-id' }
  }
})

const dispatchMessage = async (): Promise<void> => {
  const listeners = jest
    .mocked(windowRef.addEventListener)
    .mock.calls.filter(([type]) => type === 'message')
    .map(([, listener]) => listener)
  expect(listeners).toHaveLength(2)
  const event = openingEvent()
  await Promise.all(listeners.map((listener) => listener(event)))
}

describe('PostMessageClient pairing callback failures', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(openCryptobox).mockResolvedValue(JSON.stringify(pairingResponse))
  })

  afterEach(() => jest.restoreAllMocks())

  it.each(['throw', 'reject'])(
    'logs a callback that fails by %s and handles the next message',
    async (mode) => {
      const client = new PostMessageClient('Dapp', keyPair)
      const error = new Error('Cannot save pairing peer')
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
      const callback = jest.fn()
      if (mode === 'throw') {
        callback.mockImplementationOnce(() => {
          throw error
        })
      } else {
        callback.mockRejectedValueOnce(error)
      }
      await client.listenForChannelOpening(callback)

      await expect(dispatchMessage()).resolves.toBeUndefined()

      expect(callback).toHaveBeenCalledTimes(1)
      expect(logged).toHaveBeenCalledTimes(1)
      expect(logged).toHaveBeenCalledWith('listenForChannelOpening', error)

      await dispatchMessage()

      expect(callback).toHaveBeenCalledTimes(2)
      expect(logged).toHaveBeenCalledTimes(1)
    }
  )

  it('logs a callback rejection after asynchronous work before its handler settles', async () => {
    const client = new PostMessageClient('Dapp', keyPair)
    const entered = new ExposedPromise<void>()
    const completion = new ExposedPromise<void>()
    const error = new Error('Cannot finish saving pairing peer')
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const callback = jest.fn(async () => {
      entered.resolve()
      await completion.promise
      throw error
    })
    await client.listenForChannelOpening(callback)

    const dispatched = dispatchMessage()
    await entered.promise
    completion.resolve()
    await expect(dispatched).resolves.toBeUndefined()

    expect(logged).toHaveBeenCalledTimes(1)
    expect(logged).toHaveBeenCalledWith('listenForChannelOpening', error)
  })

  it.each(['cryptobox rejection', 'invalid JSON'])(
    'ignores %s without calling or blaming the callback',
    async (mode) => {
      const client = new PostMessageClient('Dapp', keyPair)
      const callback = jest.fn()
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
      if (mode === 'cryptobox rejection') {
        jest.mocked(openCryptobox).mockRejectedValueOnce(new Error('Other recipient'))
      } else {
        jest.mocked(openCryptobox).mockResolvedValueOnce('invalid JSON')
      }
      await client.listenForChannelOpening(callback)

      await expect(dispatchMessage()).resolves.toBeUndefined()

      expect(callback).not.toHaveBeenCalled()
      expect(logged).not.toHaveBeenCalled()
    }
  )
})
