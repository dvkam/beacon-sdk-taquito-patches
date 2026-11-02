import { openAlert, openToast } from '@ecadlabs/beacon-ui'
import { BeaconEvent, BeaconEventType, defaultEventCallbacks } from '../src/events'
import {
  AccountInfo,
  BeaconMessageType,
  NetworkType,
  Origin,
  PermissionScope
} from '@ecadlabs/beacon-types'
import { TzktBlockExplorer } from '../src/utils/tzkt-blockexplorer'

jest.mock('@ecadlabs/beacon-ui', () => ({
  closeAlert: jest.fn(),
  closeToast: jest.fn(),
  isMobile: jest.fn().mockReturnValue(false),
  isMobileOS: jest.fn().mockReturnValue(false),
  openAlert: jest.fn(),
  openBugReport: jest.fn(),
  openToast: jest.fn()
}))

describe('default event callbacks', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('repairs a missing active account silently', async () => {
    await defaultEventCallbacks[BeaconEvent.INVALID_ACCOUNT_DEACTIVATED]({
      reason: 'missing_active_account'
    })

    expect(openAlert).not.toHaveBeenCalled()
  })

  it('shows the expired-session modal for invalid account storage', async () => {
    await defaultEventCallbacks[BeaconEvent.INVALID_ACCOUNT_DEACTIVATED]({
      reason: 'invalid_active_account_storage'
    })

    expect(openAlert).toHaveBeenCalledWith({
      title: 'Error',
      body: 'Your session has expired. Please pair with your wallet again.'
    })
  })

  it('shows blockchain success with only wallet information', async () => {
    const walletInfo = { name: 'Chain Wallet' }
    await defaultEventCallbacks[BeaconEvent.BLOCKCHAIN_REQUEST_SUCCESS]({ walletInfo })

    expect(openToast).toHaveBeenCalledWith({
      body: '{{wallet}}\u00A0 request successfully executed',
      timer: 5000,
      state: 'finished',
      walletInfo
    })
  })

  it.each([false, true])(
    'retains an operation hash and offers an explorer only with a real network: %s',
    async (hasNetwork) => {
      const common = {
        accountIdentifier: 'account',
        senderId: 'wallet',
        address: 'tz1address',
        connectedAt: 1,
        origin: { type: Origin.P2P, id: 'peer' }
      }
      const v2: AccountInfo = {
        ...common,
        network: { type: NetworkType.MAINNET },
        walletType: 'implicit',
        scopes: [PermissionScope.SIGN]
      }
      const account = hasNetwork ? v2 : { ...common, scopes: ['transfer'], chainData: null }
      const open = jest.spyOn(window, 'open').mockImplementation(() => null)
      try {
        await defaultEventCallbacks[BeaconEvent.OPERATION_REQUEST_SUCCESS]({
          account,
          output: {
            id: 'request',
            version: '2',
            senderId: 'wallet',
            type: BeaconMessageType.OperationResponse,
            transactionHash: 'opHash'
          },
          blockExplorer: new TzktBlockExplorer(),
          connectionContext: { id: 'peer', origin: Origin.P2P },
          walletInfo: { name: 'Wallet' }
        })
        const toast = jest.mocked(openToast).mock.calls[0]?.[0]
        expect(toast?.body).toBe('{{wallet}}\u00A0 successfully submitted operation')
        expect(toast?.actions?.[0]?.text).toBe('opHash')
        const action = toast?.actions?.[0]
        if (hasNetwork) {
          expect(action?.actionText).toBe('Open Blockexplorer')
          await action?.actionCallback?.()
          expect(open).toHaveBeenCalledWith('https://tzkt.io/opHash', '_blank', 'noopener')
        } else {
          expect(action).not.toHaveProperty('actionCallback')
          expect(action).not.toHaveProperty('actionText')
          expect(open).not.toHaveBeenCalled()
        }
      } finally {
        open.mockRestore()
      }
    }
  )

  it.each([false, true])(
    'shows actual V2 or V3 permission information without an invented network: %s',
    async (v3) => {
      const common = {
        accountIdentifier: 'chain-account',
        senderId: 'wallet',
        address: 'chain-address',
        connectedAt: 1,
        origin: { type: Origin.P2P, id: 'peer' }
      }
      const v2Account: AccountInfo = {
        ...common,
        network: { type: NetworkType.MAINNET },
        walletType: 'implicit',
        scopes: [PermissionScope.SIGN]
      }
      const chainAccount = { ...common, scopes: ['transfer'], chainData: null }
      const event: BeaconEventType[BeaconEvent.PERMISSION_REQUEST_SUCCESS] = v3
        ? {
            protocol: '3',
            account: chainAccount,
            output: {
              type: BeaconMessageType.PermissionResponse,
              blockchainIdentifier: 'chain-test',
              blockchainData: {
                appMetadata: { senderId: 'wallet', name: 'Wallet' },
                scopes: ['transfer']
              }
            },
            blockExplorer: new TzktBlockExplorer(),
            connectionContext: { id: 'peer', origin: Origin.P2P },
            walletInfo: { name: 'Wallet' }
          }
        : {
            account: v2Account,
            output: {
              id: 'request',
              senderId: 'wallet',
              version: '2',
              type: BeaconMessageType.PermissionResponse,
              walletType: 'implicit',
              appMetadata: { senderId: 'wallet', name: 'Wallet' },
              network: v2Account.network,
              scopes: v2Account.scopes,
              address: common.address,
              accountInfo: v2Account
            },
            blockExplorer: new TzktBlockExplorer(),
            connectionContext: { id: 'peer', origin: Origin.P2P },
            walletInfo: { name: 'Wallet' }
          }
      await defaultEventCallbacks[BeaconEvent.PERMISSION_REQUEST_SUCCESS](event)
      const toast = jest.mocked(openToast).mock.calls[0]?.[0]
      expect(toast?.body).toBe('{{wallet}}\u00A0 has granted permission')
      expect(toast?.actions).toEqual(
        v3
          ? [{ text: 'Address', actionText: 'chain...dress', isBold: true }]
          : [
              { text: 'Address', actionText: 'chain...dress', isBold: true },
              { text: 'Network', actionText: 'mainnet' },
              { text: 'Permissions', actionText: 'sign' }
            ]
      )
    }
  )
})
