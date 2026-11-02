import { openAlert, openToast } from '@ecadlabs/beacon-ui'
import { BeaconErrorType, BeaconMessageType } from '@ecadlabs/beacon-types'
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
})

describe('transaction error details', () => {
  beforeEach(() => jest.clearAllMocks())

  const showTransactionError = (errorData: unknown) =>
    defaultEventCallbacks[BeaconEvent.OPERATION_REQUEST_ERROR]({
      errorResponse: {
        id: 'request',
        senderId: 'wallet',
        version: '2',
        type: BeaconMessageType.Error,
        errorType: BeaconErrorType.TRANSACTION_INVALID_ERROR,
        errorData
      },
      walletInfo: { name: 'Wallet' },
      errorMessages: {
        '': { 42: 'An empty handle must keep the generic description' },
        KT1contract: {
          '': 'An empty code must keep the generic description',
          0: 'Contract rejected this operation',
          42: 'Contract rejected this operation'
        }
      }
    })

  it.each([{ int: 0 }, { int: 42 }, { int: '42' }, { string: '42' }])(
    'shows the configured contract message for %p',
    async (detail) => {
      await showTransactionError([{ contract_handle: 'KT1contract' }, { with: detail }])
      expect(openToast).toHaveBeenCalledWith(
        expect.objectContaining({
          actions: expect.arrayContaining([
            { text: 'Contract rejected this operation', isBold: true }
          ])
        })
      )
    }
  )

  it.each([
    { errorData: [{ contract_handle: { toString: null } }, { with: { int: 42 } }] },
    { errorData: [{ contract_handle: 'KT1contract' }, { with: { string: '' } }] },
    { errorData: [{ contract_handle: '' }, { with: { int: 42 } }] }
  ])('keeps unusable contract details opaque and available: $errorData', async ({ errorData }) => {
    await showTransactionError(errorData)
    const toast = jest.mocked(openToast).mock.calls[0]?.[0]
    expect(toast?.actions).toContainEqual({
      text: 'The transaction is invalid and the node did not accept it.'
    })
    const showDetails = toast?.actions?.find((action) => action.actionText === 'Show Details')
    expect(showDetails?.actionCallback).toBeDefined()
    await showDetails?.actionCallback?.()
    expect(openAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        data: JSON.stringify(errorData, undefined, 2)
      })
    )
  })
})
