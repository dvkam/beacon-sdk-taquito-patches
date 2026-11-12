import { enforceOptions } from 'broadcast-channel'
import { MultiTabChannel } from '../../src/utils/multi-tab-channel'

it('forwards opaque application messages without treating them as leader control', async () => {
  enforceOptions({ type: 'simulate' })
  const received: unknown[] = []
  let finish: () => void = () => {
    throw new Error('completion not ready')
  }
  const delivered = new Promise<void>((resolve) => {
    finish = resolve
  })
  const first = new MultiTabChannel(
    'opaque-channel',
    () => {},
    () => {}
  )
  const second = new MultiTabChannel(
    'opaque-channel',
    (message: unknown) => {
      received.push(message)
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'ordinary'
      )
        finish()
    },
    () => {}
  )
  try {
    await first.init()
    await second.init()
    first.postMessage(null)
    first.postMessage({ type: 'ordinary', id: 'request', data: { value: 1 } })
    await delivered
    expect(received).toEqual([null, { type: 'ordinary', id: 'request', data: { value: 1 } }])
  } finally {
    await second.close()
    await first.close()
    enforceOptions(false)
  }
})
