import { LocalStorage, Logger } from '@ecadlabs/beacon-core'
import { StorageKey } from '@ecadlabs/beacon-types'
import { MatrixClientStore } from '../../src/matrix-client/MatrixClientStore'
import { MatrixRoom, MatrixRoomStatus } from '../../src/matrix-client/models/MatrixRoom'
import { MatrixMessageType } from '../../src/matrix-client/models/MatrixMessage'

describe('Matrix preserved room state', () => {
  beforeEach(() => localStorage.clear())

  afterEach(() => {
    localStorage.clear()
    jest.restoreAllMocks()
  })

  it('persists only sync and room state without storing messages or mutating live rooms', async () => {
    const storage = new LocalStorage()
    const store = new MatrixClientStore(storage)
    const [room] = MatrixRoom.fromSync({
      join: {
        '!room:relay': {
          state: { events: [] },
          timeline: {
            events: [
              {
                type: 'm.room.message',
                sender: '@peer:relay',
                content: { msgtype: MatrixMessageType.TEXT, body: 'private message' },
                event_id: '$event',
                origin_server_ts: 123
              }
            ]
          }
        }
      }
    })

    await store.update({
      accessToken: 'do-not-persist',
      userId: '@user:relay',
      syncToken: 'next-sync',
      rooms: [room]
    })

    const persisted = await storage.get(StorageKey.MATRIX_PRESERVED_STATE)
    expect(Object.keys(persisted).sort()).toEqual(['rooms', 'syncToken'])
    expect(persisted).toEqual({
      syncToken: 'next-sync',
      rooms: {
        '!room:relay': {
          id: '!room:relay',
          status: MatrixRoomStatus.JOINED,
          members: [],
          messages: []
        }
      }
    })
    expect(store.get('rooms')['!room:relay'].messages).toHaveLength(1)
    expect(room.messages).toHaveLength(1)
  })

  it('keeps non-preserved fields and empty sync updates from triggering a write', async () => {
    const storage = new LocalStorage()
    const write = jest.spyOn(storage, 'set')
    const store = new MatrixClientStore(storage)

    await store.update({ accessToken: 'access-token', userId: '@user:relay' })
    await store.update({ syncToken: '' })

    expect(write).not.toHaveBeenCalled()

    await store.update({ syncToken: 'next-sync' })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('logs storage-write failures while retaining the updated in-memory state', async () => {
    const storage = new LocalStorage()
    const failure = new Error('Storage write failed')
    jest.spyOn(storage, 'set').mockRejectedValue(failure)
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    const store = new MatrixClientStore(storage)

    await expect(store.update({ syncToken: 'next-sync' })).resolves.toBeUndefined()

    expect(store.get('syncToken')).toBe('next-sync')
    expect(error).toHaveBeenCalledWith('updateStorage', 'failed to persist matrix state', failure)
  })
})
