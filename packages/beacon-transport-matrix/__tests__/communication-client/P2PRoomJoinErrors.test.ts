import { LocalStorage } from '@ecadlabs/beacon-core'
import { ExposedPromise, getKeypairFromSeed } from '@ecadlabs/beacon-utils'
import { StorageKey } from '@ecadlabs/beacon-types'
import { P2PCommunicationClient } from '../../src/communication-client/P2PCommunicationClient'
import { MatrixUserService } from '../../src/matrix-client/services/MatrixUserService'
import { MatrixEventService } from '../../src/matrix-client/services/MatrixEventService'
import { MatrixRoomService } from '../../src/matrix-client/services/MatrixRoomService'

const roomId = '!room:matrix.example'

describe('P2P room join errors', () => {
  let client: P2PCommunicationClient

  beforeEach(async () => {
    jest.useFakeTimers()
    localStorage.clear()
    const storage = new LocalStorage('room-join-errors')
    await storage.set(StorageKey.MATRIX_SELECTED_NODE, 'matrix.example')
    const keyPair = await getKeypairFromSeed('room-join-errors')
    client = new P2PCommunicationClient('Room join', keyPair, 1, storage)
    jest.spyOn(client, 'getBeaconInfo').mockResolvedValue({
      region: 'europe-west',
      known_servers: [],
      timestamp: 12345
    })
    jest.spyOn(MatrixUserService.prototype, 'login').mockResolvedValue({
      user_id: '@sdk:matrix.example',
      device_id: 'sdk',
      access_token: 'access-token'
    })
    const longPoll = new ExposedPromise<Awaited<ReturnType<MatrixEventService['sync']>>>()
    jest
      .spyOn(MatrixEventService.prototype, 'sync')
      .mockResolvedValueOnce({ next_batch: 'initial-sync', rooms: {} })
      .mockResolvedValueOnce({ next_batch: 'next-sync', rooms: {} })
      .mockReturnValue(longPoll.promise)
    await client.start()
  })

  afterEach(async () => {
    await client.stop()
    jest.clearAllTimers()
    jest.restoreAllMocks()
    jest.useRealTimers()
    localStorage.clear()
  })

  it.each([null, undefined])(
    'contains a %s room-join rejection without retrying',
    async (error) => {
      const join = jest.spyOn(MatrixRoomService.prototype, 'joinRoom').mockRejectedValue(error)

      await expect(client.tryJoinRooms(roomId)).resolves.toBeUndefined()
      await jest.advanceTimersByTimeAsync(200)

      expect(join).toHaveBeenCalledTimes(1)
    }
  )
  it('retries a forbidden join after 200ms and then succeeds', async () => {
    const join = jest
      .spyOn(MatrixRoomService.prototype, 'joinRoom')
      .mockRejectedValueOnce({ errcode: 'M_FORBIDDEN' })
      .mockResolvedValue({ room_id: roomId })

    await client.tryJoinRooms(roomId)
    await jest.advanceTimersByTimeAsync(199)
    expect(join).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(1)

    expect(join).toHaveBeenCalledTimes(2)
    expect(join.mock.calls.map(([, room]) => room.id)).toEqual([roomId, roomId])
  })

  it('does not retry a forbidden join after the retry budget is exhausted', async () => {
    const join = jest
      .spyOn(MatrixRoomService.prototype, 'joinRoom')
      .mockRejectedValue({ errcode: 'M_FORBIDDEN' })

    await client.tryJoinRooms(roomId, 11)
    await jest.advanceTimersByTimeAsync(200)

    expect(join).toHaveBeenCalledTimes(1)
  })

  it('does not retry an unrelated Matrix error', async () => {
    const join = jest
      .spyOn(MatrixRoomService.prototype, 'joinRoom')
      .mockRejectedValue({ errcode: 'M_UNKNOWN' })

    await client.tryJoinRooms(roomId)
    await jest.advanceTimersByTimeAsync(200)

    expect(join).toHaveBeenCalledTimes(1)
  })

  it('does not apply an old join retry to a new connection after stop', async () => {
    const join = jest
      .spyOn(MatrixRoomService.prototype, 'joinRoom')
      .mockRejectedValueOnce({ errcode: 'M_FORBIDDEN' })
      .mockResolvedValue({ room_id: roomId })

    await client.tryJoinRooms(roomId)
    await client.stop()
    await client.start()
    await jest.advanceTimersByTimeAsync(200)

    expect(join).toHaveBeenCalledTimes(1)
  })
})
