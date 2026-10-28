import { MatrixMessage, MatrixMessageType } from '../../src/matrix-client/models/MatrixMessage'
import { MatrixRoom, MatrixRoomStatus } from '../../src/matrix-client/models/MatrixRoom'
import { MatrixStateEvent } from '../../src/matrix-client/models/MatrixStateEvent'
import { isTextMessageEvent } from '../../src/matrix-client/utils/events'

const event = (content: unknown, id = '$event'): MatrixStateEvent => ({
  type: 'm.room.message',
  sender: '@peer:relay',
  content,
  event_id: id,
  origin_server_ts: 123
})

const textEvent = (body: unknown, id?: string): MatrixStateEvent =>
  event({ msgtype: MatrixMessageType.TEXT, body }, id)

describe('Matrix text messages', () => {
  it.each(['', 'hello', 'Tezos π 😀'])('preserves a string body and its metadata: %p', (body) => {
    const incoming = textEvent(body)

    expect(isTextMessageEvent(incoming)).toBe(true)
    expect(MatrixMessage.from(incoming)).toEqual({
      type: MatrixMessageType.TEXT,
      sender: '@peer:relay',
      content: body,
      timestamp: 123
    })
  })

  it.each([undefined, null, 42, false, {}, []])('rejects a non-string body: %p', (body) => {
    const incoming = textEvent(body)

    expect(isTextMessageEvent(incoming)).toBe(false)
    expect(MatrixMessage.from(incoming)).toBeUndefined()
  })

  it('rejects a missing body', () => {
    const incoming = event({ msgtype: MatrixMessageType.TEXT })

    expect(isTextMessageEvent(incoming)).toBe(false)
    expect(MatrixMessage.from(incoming)).toBeUndefined()
  })

  it.each(['m.notice', 'm.image'])('keeps unsupported message types rejected: %s', (msgtype) => {
    expect(MatrixMessage.from(event({ msgtype, body: 'text' }))).toBeUndefined()
  })

  it.each(['join', 'leave'] as const)(
    'filters malformed bodies from %s rooms while preserving valid text and deduplication',
    (kind) => {
      const first = textEvent('', '$first')
      const second = textEvent('hello π', '$second')
      const roomSync = {
        state: { events: [first, textEvent(null, '$bad-state')] },
        timeline: { events: [first, second, textEvent({}, '$bad-timeline')] }
      }
      const [room] = MatrixRoom.fromSync(
        kind === 'join'
          ? { join: { '!room:relay': roomSync } }
          : { leave: { '!room:relay': roomSync } }
      )

      expect(room.id).toBe('!room:relay')
      expect(room.status).toBe(kind === 'join' ? MatrixRoomStatus.JOINED : MatrixRoomStatus.LEFT)
      expect(room.messages.map((message) => message.content)).toEqual(['', 'hello π'])
    }
  )
})
