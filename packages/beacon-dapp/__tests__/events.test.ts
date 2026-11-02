import { openAlert, openToast } from '@ecadlabs/beacon-ui'
import { BeaconEvent, defaultEventCallbacks } from '../src/events'

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
})
