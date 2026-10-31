import type { MatrixStateEventMessageText } from '../MatrixStateEvent'

export type MatrixEventSendRequest = MatrixStateEventMessageText['content']

export interface MatrixEventSendResponse {
  type?: 'event_send'
  event_id: string
}
