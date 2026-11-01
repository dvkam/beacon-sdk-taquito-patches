import { test, expect } from '@playwright/test'
import { pairWithBeaconWallet } from './utils'

declare const client: {
  disconnect(): Promise<void>
  getActiveAccount(): Promise<{ accountIdentifier: string } | undefined>
  subscribeToEvent(
    event: 'ACTIVE_ACCOUNT_SET',
    callback: (account: { accountIdentifier: string } | undefined) => void
  ): Promise<void>
}

test('a delayed second-tab startup cannot restore an account after disconnect completes', async ({
  browser
}) => {
  const [dapp, dappContext, , walletContext] = await pairWithBeaconWallet(browser)
  const dapp2 = await dappContext.newPage()
  let releaseLogin: () => void = () => undefined
  let reportLogin: () => void = () => undefined
  const loginGate = new Promise<void>((resolve) => {
    releaseLogin = resolve
  })
  const loginEntered = new Promise<void>((resolve) => {
    reportLogin = resolve
  })
  await dapp2.route('**/_matrix/client/r0/login', async (route) => {
    reportLogin()
    await loginGate
    await route.continue()
  })
  try {
    await dapp2.goto('http://localhost:1234/dapp.html')
    await loginEntered
    await dapp2.evaluate(async () => {
      const accountEvents: string[] = []
      await client.subscribeToEvent('ACTIVE_ACCOUNT_SET', (account) => {
        if (account) {
          accountEvents.push(account.accountIdentifier)
        }
      })
      Object.defineProperty(window, '__startupAccountEvents', { value: accountEvents })
    })
    await dapp.evaluate(() => client.disconnect())
    expect(await dapp.evaluate(() => localStorage.getItem('beacon:active-account'))).toBeNull()
    releaseLogin()
    const state = await dapp2.evaluate(async () => {
      const startup: unknown = Reflect.get(client, 'activeAccountLoaded')
      if (!(startup instanceof Promise)) {
        throw new Error('Missing startup completion promise')
      }
      await startup
      const selected: unknown = Reflect.get(client, '_transport')
      if (
        typeof selected !== 'object' ||
        selected === null ||
        !('isResolved' in selected) ||
        typeof selected.isResolved !== 'function'
      ) {
        throw new Error('Missing selected transport state')
      }
      return {
        account: (await client.getActiveAccount())?.accountIdentifier ?? null,
        storedAccount: localStorage.getItem('beacon:active-account'),
        hasSelectedTransport: selected.isResolved(),
        accountEvents: Reflect.get(window, '__startupAccountEvents')
      }
    })
    expect(state).toEqual({
      account: null,
      storedAccount: null,
      hasSelectedTransport: false,
      accountEvents: []
    })
  } finally {
    releaseLogin()
    await Promise.all([dappContext.close(), walletContext.close()])
  }
})
