import {
  Storage,
  StorageKey,
  StoredAccountInfo,
  BeaconMessage,
  PermissionScope
} from '@ecadlabs/beacon-types'
import { StorageManager } from './StorageManager'
import { PermissionValidator } from './PermissionValidator'

/**
 * @internalapi
 *
 * The AccountManager provides CRUD functionality for account entities and persists them to the provided storage.
 */
export class AccountManager {
  private readonly storageManager: StorageManager<StorageKey.ACCOUNTS>

  constructor(storage: Storage) {
    this.storageManager = new StorageManager(storage, StorageKey.ACCOUNTS)
  }

  public async getAccounts(): Promise<StoredAccountInfo[]> {
    return (await this.storageManager.getAll()) ?? []
  }

  public async getAccount(accountIdentifier: string): Promise<StoredAccountInfo | undefined> {
    return this.storageManager.getOne((account) => account.accountIdentifier === accountIdentifier)
  }

  public async addAccount(accountInfo: StoredAccountInfo): Promise<void> {
    return this.storageManager.addOne(
      accountInfo,
      (account) => account.accountIdentifier === accountInfo.accountIdentifier
    )
  }

  public async updateAccount(
    accountIdentifier: string,
    accountInfo: Partial<StoredAccountInfo>
  ): Promise<StoredAccountInfo | undefined> {
    const account = await this.getAccount(accountIdentifier)

    if (!account) {
      return undefined
    }

    const updated = { ...account, ...accountInfo }
    const scopeValues = updated.scopes
    if (
      !Array.isArray(scopeValues) ||
      !scopeValues.every((scope: unknown) => typeof scope === 'string')
    ) {
      throw new Error('Account scopes must be strings')
    }
    let newAccount: StoredAccountInfo
    if (account.network !== undefined) {
      const scopes: string[] = scopeValues
      if (
        updated.network === undefined ||
        updated.walletType === undefined ||
        !scopes.every((scope): scope is PermissionScope =>
          Object.values(PermissionScope).some((allowed) => allowed === scope)
        )
      ) {
        throw new Error('Invalid V2 account update')
      }
      newAccount = {
        ...updated,
        network: updated.network,
        walletType: updated.walletType,
        scopes
      }
    } else {
      if (updated.network !== undefined || updated.walletType !== undefined) {
        throw new Error('A V3 account cannot acquire V2 account metadata')
      }
      newAccount = {
        ...updated,
        network: undefined,
        walletType: undefined,
        chainData: 'chainData' in updated ? updated.chainData : undefined
      }
    }
    await this.storageManager.addOne(
      newAccount,
      (account) => account.accountIdentifier === accountIdentifier,
      true
    )

    return newAccount
  }

  public async removeAccount(accountIdentifier: string): Promise<void> {
    return this.storageManager.remove((account) => account.accountIdentifier === accountIdentifier)
  }

  public async removeAccounts(accountIdentifiers: string[]): Promise<void> {
    return this.storageManager.remove((account) =>
      accountIdentifiers.includes(account.accountIdentifier)
    )
  }

  public async removeAllAccounts(): Promise<void> {
    return this.storageManager.removeAll()
  }

  public async hasPermission(message: BeaconMessage): Promise<boolean> {
    return PermissionValidator.hasPermission(
      message,
      this.getAccount.bind(this),
      this.getAccounts.bind(this)
    )
  }
}
