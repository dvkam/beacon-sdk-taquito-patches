import { CommunicationClient } from '../../src'

class TestCommunicationClient extends CommunicationClient {
  public async sendMessage(_message: string): Promise<void> {}
  public async unsubscribeFromEncryptedMessage(_senderPublicKey: string): Promise<void> {}
  public async unsubscribeFromEncryptedMessages(): Promise<void> {}
}

describe('CommunicationClient public key', () => {
  it('rejects when no key pair is available', async () => {
    const client = new TestCommunicationClient()
    await expect(client.getPublicKey()).rejects.toHaveProperty('name', 'TypeError')
  })
})
