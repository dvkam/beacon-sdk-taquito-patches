/** @jest-environment node */

import { clearMockWindowState, windowRef } from '../src/MockWindow'

describe('mock window listeners', () => {
  beforeEach(() => {
    clearMockWindowState()
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    clearMockWindowState()
    jest.restoreAllMocks()
  })

  it('removes the requested listener when it is not the last listener', () => {
    const first = jest.fn()
    const last = jest.fn()
    windowRef.addEventListener('message', first)
    windowRef.addEventListener('message', last)

    windowRef.removeEventListener('message', first)
    windowRef.postMessage('payload', '*')

    expect(first).not.toHaveBeenCalled()
    expect(last).toHaveBeenCalledWith({ data: 'payload' })
  })

  it('leaves registered listeners intact when removing an unknown listener', () => {
    const first = jest.fn()
    const last = jest.fn()
    windowRef.addEventListener('message', first)
    windowRef.addEventListener('message', last)

    windowRef.removeEventListener('message', jest.fn())
    windowRef.postMessage('payload', '*')

    expect(first).toHaveBeenCalledWith({ data: 'payload' })
    expect(last).toHaveBeenCalledWith({ data: 'payload' })
  })

  it('forwards object payloads in the existing data envelope', () => {
    const listener = jest.fn()
    const payload = { target: 'extension', payload: 'ping' }
    windowRef.addEventListener('message', listener)

    windowRef.postMessage(payload)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ data: payload })
    expect(listener.mock.calls[0][0].data).toBe(payload)
  })

  it('still calls other listeners when a listener removes itself during dispatch', () => {
    const other = jest.fn()
    const selfRemoving = (): void => windowRef.removeEventListener('message', selfRemoving)
    windowRef.addEventListener('message', selfRemoving)
    windowRef.addEventListener('message', other)

    windowRef.postMessage('payload')

    expect(other).toHaveBeenCalledWith({ data: 'payload' })
  })

  it('does not call a listener removed by another listener during dispatch', () => {
    const removed = jest.fn()
    const survivor = jest.fn()
    const removeOther = (): void => windowRef.removeEventListener('message', removed)
    windowRef.addEventListener('message', removeOther)
    windowRef.addEventListener('message', removed)
    windowRef.addEventListener('message', survivor)

    windowRef.postMessage('payload')

    expect(removed).not.toHaveBeenCalled()
    expect(survivor).toHaveBeenCalledWith({ data: 'payload' })
  })
})
