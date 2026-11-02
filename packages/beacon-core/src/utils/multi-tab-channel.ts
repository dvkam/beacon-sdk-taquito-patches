import { createLeaderElection, BroadcastChannel, LeaderElector } from 'broadcast-channel'

export class MultiTabChannel {
  private readonly channel: BroadcastChannel<unknown>
  private readonly elector: LeaderElector
  private readonly beforeUnloadListener = () => this.onBeforeUnloadHandler()
  private readonly messageListener = (message: unknown) => this.onMessageHandler(message)
  private readonly onBCMessageHandler: (message: unknown) => unknown
  private readonly onElectedLeaderHandler: () => unknown
  // Auxiliary variable needed for handling beforeUnload.
  // Closing a tab causes the elector to be killed immediately
  private wasLeader: boolean = false
  private initialized: boolean = false

  constructor(
    name: string,
    onBCMessageHandler: (message: unknown) => unknown,
    onElectedLeaderHandler: () => unknown
  ) {
    this.onBCMessageHandler = onBCMessageHandler
    this.onElectedLeaderHandler = onElectedLeaderHandler
    this.channel = new BroadcastChannel<unknown>(name)
    this.elector = createLeaderElection(this.channel)
  }

  async init() {
    if (this.initialized) {
      return
    }

    const hasLeader = await this.elector.hasLeader()

    if (!hasLeader) {
      await this.elector.awaitLeadership()
      this.wasLeader = this.isLeader()
    }

    this.channel.onmessage = this.messageListener
    window?.addEventListener('beforeunload', this.beforeUnloadListener)

    this.initialized = true
  }

  public async close() {
    const wasLeader = this.wasLeader
    window?.removeEventListener('beforeunload', this.beforeUnloadListener)
    this.channel.removeEventListener('message', this.messageListener)
    this.channel.onmessage = null
    await this.elector.die()
    if (wasLeader) {
      this.postMessage({ type: 'LEADER_DEAD' })
    }
    await this.channel.close()
    this.initialized = false
    this.wasLeader = false
  }

  private async onBeforeUnloadHandler() {
    if (this.wasLeader) {
      await this.elector.die()
      this.postMessage({ type: 'LEADER_DEAD' })
    }

    window?.removeEventListener('beforeunload', this.beforeUnloadListener)
    this.channel.removeEventListener('message', this.messageListener)
  }

  private async onMessageHandler(message: unknown) {
    if (
      message !== null &&
      (typeof message === 'object' || typeof message === 'function') &&
      'type' in message &&
      message.type === 'LEADER_DEAD'
    ) {
      await this.elector.awaitLeadership()

      this.wasLeader = this.isLeader()

      if (this.isLeader()) {
        this.onElectedLeaderHandler()
      }

      return
    }

    this.onBCMessageHandler(message)
  }

  isLeader(): boolean {
    return this.elector.isLeader
  }

  async getLeadership() {
    return this.elector.awaitLeadership()
  }

  async hasLeader(): Promise<boolean> {
    return this.elector.hasLeader()
  }

  public postMessage(message: unknown): void {
    this.channel.postMessage(message)
  }
}
