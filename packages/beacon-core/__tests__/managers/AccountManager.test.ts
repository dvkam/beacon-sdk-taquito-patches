import { AccountInfo, NetworkType, Origin, PermissionScope } from '@ecadlabs/beacon-types'
import { AccountManager } from '../../src/managers/AccountManager'
import { LocalStorage } from '../../src/storage/LocalStorage'

const common = {
  accountIdentifier: 'account',
  senderId: 'wallet',
  origin: { type: Origin.P2P, id: 'peer' },
  address: 'tz1address',
  connectedAt: 1
}
const v2: AccountInfo = {
  ...common,
  network: { type: NetworkType.MAINNET },
  walletType: 'implicit',
  scopes: [PermissionScope.SIGN]
}
const v3 = { ...common, scopes: ['transfer'], chainData: { opaque: true } }

describe('stored account variants', () => {
  beforeEach(() => localStorage.clear())
  function manager() {
    return new AccountManager(new LocalStorage('account-variants'))
  }

  it.each([
    { name: 'V2', account: v2 },
    { name: 'V3', account: v3 }
  ])(
    'updates common $name fields without fabricating or losing variant metadata',
    async ({ account }) => {
      const accounts = manager()
      await accounts.addAccount(account)
      await expect(
        accounts.updateAccount('account', { walletKey: 'selected', connectedAt: 2 })
      ).resolves.toEqual({ ...account, walletKey: 'selected', connectedAt: 2 })
      await expect(accounts.getAccount('account')).resolves.toEqual({
        ...account,
        walletKey: 'selected',
        connectedAt: 2
      })
    }
  )

  it('rejects chain-only scopes on V2 without changing the stored account', async () => {
    const accounts = manager()
    await accounts.addAccount(v2)
    await expect(accounts.updateAccount('account', { scopes: ['transfer'] })).rejects.toThrow()
    await expect(accounts.getAccount('account')).resolves.toEqual(v2)
    await expect(
      accounts.updateAccount('account', { scopes: [PermissionScope.OPERATION_REQUEST] })
    ).resolves.toEqual({ ...v2, scopes: [PermissionScope.OPERATION_REQUEST] })
  })

  it.each([
    { name: 'network', update: { network: { type: NetworkType.MAINNET } } },
    { name: 'wallet type', update: { walletType: 'implicit' } }
  ] satisfies { name: string; update: Partial<AccountInfo> }[])(
    'rejects a V2 $name on V3 without changing the stored account',
    async ({ update }) => {
      const accounts = manager()
      await accounts.addAccount(v3)
      await expect(accounts.updateAccount('account', update)).rejects.toThrow()
      await expect(accounts.getAccount('account')).resolves.toEqual(v3)
    }
  )

  it('captures a chain-data update getter once before persisting the snapshot', async () => {
    const accounts = manager()
    await accounts.addAccount(v3)
    let reads = 0
    const chainData = { next: 'snapshot' }
    const update = {
      get chainData(): unknown {
        reads += 1
        if (reads > 1) throw new Error('chainData was read again')
        return chainData
      }
    }
    await expect(accounts.updateAccount('account', update)).resolves.toEqual({ ...v3, chainData })
    expect(reads).toBe(1)
    await expect(accounts.getAccount('account')).resolves.toEqual({ ...v3, chainData })
  })
})
