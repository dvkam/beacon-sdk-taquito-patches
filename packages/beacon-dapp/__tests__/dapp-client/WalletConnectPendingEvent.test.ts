import { BroadcastChannel as NativeBroadcastChannel } from 'node:worker_threads'
import { ClientEvents, LocalStorage, windowRef } from '@ecadlabs/beacon-core'
import { NetworkType } from '@ecadlabs/beacon-types'
import { WalletConnectCommunicationClient } from '@ecadlabs/beacon-transport-walletconnect'
import { DAppClient } from '../../src/dapp-client/DAppClient'
import { BeaconEvent } from '../../src/events'

// Babel erases the SDK's const enum; retain real core behavior and supply its emitted values.
jest.mock('@ecadlabs/beacon-core', () => ({
  ...jest.requireActual('@ecadlabs/beacon-core'),
  ClientEvents: {
    CLOSE_ALERT: 'CLOSE_ALERT',
    RESET_STATE: 'RESET_STATE',
    WC_ACK_NOTIFICATION: 'WC_ACK_NOTIFICATION',
    ON_RELAYER_ERROR: 'ON_RELAYER_ERROR'
  }
}))

jest.mock('@walletconnect/sign-client', () => ({ init: jest.fn() }))
jest.mock('@walletconnect/utils', () => ({
  getSdkError: () => ({ code: 6000, message: 'User disconnected.' })
}))

it('reports WalletConnect proposal progress without fabricating a wallet acknowledgement', async () => {
  const originalChannel = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel')
  const channels: NativeBroadcastChannel[] = []
  class TrackedBroadcastChannel extends NativeBroadcastChannel {
    constructor(name: string) {
      super(name)
      channels.push(this)
    }
  }
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    configurable: true,
    value: TrackedBroadcastChannel
  })
  localStorage.clear()
  windowRef.beaconCreatedClientInstance = false
  const client = new DAppClient({
    name: 'WalletConnect progress',
    storage: new LocalStorage('wc-pending'),
    disableDefaultEvents: true
  })
  const pending = jest.fn()
  const acknowledged = jest.fn()
  await client.subscribeToEvent(BeaconEvent.WALLETCONNECT_SESSION_PENDING, pending)
  await client.subscribeToEvent(BeaconEvent.ACKNOWLEDGE_RECEIVED, acknowledged)
  try {
    await client.initInternalTransports()
    const communication = WalletConnectCommunicationClient.getInstance(
      { network: NetworkType.MAINNET, opts: {} },
      () => true
    )
    const callback = communication.eventHandlers.get(ClientEvents.WC_ACK_NOTIFICATION)
    expect(callback).toBeDefined()
    if (!callback) throw new Error('WalletConnect progress callback not registered')
    const result: unknown = callback('pending')
    await result
    expect(acknowledged).not.toHaveBeenCalled()
    expect(pending).toHaveBeenCalledWith(
      { walletInfo: expect.objectContaining({ name: expect.any(String) }) },
      undefined
    )
  } finally {
    await client.destroy()
    channels.forEach((channel) => channel.close())
    if (originalChannel) Object.defineProperty(globalThis, 'BroadcastChannel', originalChannel)
    else Reflect.deleteProperty(globalThis, 'BroadcastChannel')
    windowRef.beaconCreatedClientInstance = false
    localStorage.clear()
  }
})
