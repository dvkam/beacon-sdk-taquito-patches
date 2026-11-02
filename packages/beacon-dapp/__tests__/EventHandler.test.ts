import { Logger } from '@ecadlabs/beacon-core'
import { BeaconEvent, BeaconEventHandler } from '../src/events'

jest.mock('@ecadlabs/beacon-ui', () => ({
  closeAlert: jest.fn(),
  closeToast: jest.fn(),
  isMobile: () => false,
  isMobileOS: () => false,
  openAlert: jest.fn(),
  openToast: jest.fn()
}))

describe('BeaconEventHandler', () => {
  afterEach(() => jest.restoreAllMocks())
  it('isolates event subscriptions and passes through payload and buttons', async () => {
    const logged = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    const handler = new BeaconEventHandler({}, true)
    const selected = jest.fn()
    const unrelated = jest.fn()
    await handler.on(BeaconEvent.HIDE_UI, selected)
    await handler.on(BeaconEvent.SHOW_PREPARE, unrelated)
    const payload: ('alert' | 'toast')[] = ['alert']
    const buttons = [{ text: 'Continue' }]
    await handler.emit(BeaconEvent.HIDE_UI, payload, buttons)
    expect(selected).toHaveBeenCalledWith(payload, buttons)
    expect(logged).toHaveBeenCalledWith(BeaconEvent.HIDE_UI, payload, buttons)
    expect(unrelated).not.toHaveBeenCalled()
  })

  it('applies a keyed override after overriding all defaults and retains later subscribers', async () => {
    const overridden = jest.fn()
    const later = jest.fn()
    const handler = new BeaconEventHandler(
      {
        [BeaconEvent.HIDE_UI]: { handler: overridden }
      },
      true
    )
    await handler.on(BeaconEvent.HIDE_UI, later)
    const payload: ('alert' | 'toast')[] = ['toast']
    await handler.emit(BeaconEvent.HIDE_UI, payload)
    expect(overridden).toHaveBeenCalledWith(payload, undefined)
    expect(later).toHaveBeenCalledWith(payload, undefined)
  })

  it('reports asynchronous listener failure without delaying emit or skipping other listeners', async () => {
    const diagnostic = jest.fn()
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(diagnostic)
    const later = jest.fn()
    let reject: (reason: unknown) => void = () => {
      throw new Error('listener not started')
    }
    const failure = new Error('listener failed')
    const handler = new BeaconEventHandler({}, true)
    await handler.on(
      BeaconEvent.LOCAL_RATE_LIMIT_REACHED,
      () =>
        new Promise<void>((_resolve, rejectPromise) => {
          reject = rejectPromise
        })
    )
    await handler.on(BeaconEvent.LOCAL_RATE_LIMIT_REACHED, later)
    await handler.emit(BeaconEvent.LOCAL_RATE_LIMIT_REACHED)
    expect(later).toHaveBeenCalledWith(undefined, undefined)
    reject(failure)
    await Promise.resolve()
    expect(diagnostic).toHaveBeenCalledWith(
      'error handling event LOCAL_RATE_LIMIT_REACHED',
      failure
    )
    errorSpy.mockRestore()
  })
})
