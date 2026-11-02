import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import MobilePairing from '../../src/ui/alert/components/pairing-alert/components/mobile-pairing'
import { AlertState } from '../../src/ui/common'
import { MergedWallet } from '../../src/utils/wallets'

const wallet: MergedWallet = {
  id: 'kukai',
  key: 'kukai_ios',
  name: 'Kukai',
  image: '',
  descriptions: ['Mobile'],
  types: ['ios'],
  links: ['https://wallet.example']
}

const callbacks = () => ({
  handleDeepLinking: jest.fn(async (_wallet: MergedWallet): Promise<void> => {}),
  handleUpdateState: jest.fn((_state: AlertState): void => {}),
  handleUpdateQRCode: jest.fn((_code: string): void => {}),
  handleDisplayQRExtra: jest.fn((_display: boolean): void => {}),
  onClose: jest.fn()
})

describe('Mobile pairing actions', () => {
  it('opens the selected wallet and offers the Kukai download on iOS', () => {
    const userAgent = jest.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('iPhone')
    const actions = callbacks()
    try {
      render(
        <MobilePairing
          {...actions}
          wallet={wallet}
          wcPayload={Promise.resolve('wc-code')}
          p2pPayload={Promise.resolve('p2p-code')}
        />
      )
      fireEvent.click(screen.getByRole('button', { name: 'Use App' }))
      expect(actions.handleDeepLinking).toHaveBeenCalledWith(wallet)
      expect(screen.getByRole('link', { name: 'Get Kukai Mobile >' }).getAttribute('href')).toBe(
        'https://ios.kukai.app'
      )
    } finally {
      userAgent.mockRestore()
    }
  })

  it.each([
    { standards: ['wallet_connect'], expected: 'wc-code' },
    { standards: ['beacon'], expected: 'p2p-code' }
  ] satisfies {
    standards: NonNullable<MergedWallet['supportedInteractionStandards']>
    expected: string
  }[])('shows the selected protocol payload for $standards', async ({ standards, expected }) => {
    const actions = callbacks()
    const { container } = render(
      <MobilePairing
        {...actions}
        wallet={{ ...wallet, supportedInteractionStandards: standards }}
        wcPayload={Promise.resolve('wc-code')}
        p2pPayload={Promise.resolve('p2p-code')}
      />
    )
    const qrButton = container.querySelector('button#qr-code-icon')
    if (!qrButton) throw new Error('QR action was not rendered')
    fireEvent.click(qrButton)
    await waitFor(() => expect(actions.handleUpdateQRCode).toHaveBeenCalledWith(expected))
    expect(actions.handleUpdateState).toHaveBeenCalledWith(AlertState.QR)
    expect(actions.handleDisplayQRExtra).toHaveBeenCalledWith(true)
    expect(actions.onClose).not.toHaveBeenCalled()
  })

  it('closes without displaying a QR code when the selected payload is empty', async () => {
    const actions = callbacks()
    const { container } = render(
      <MobilePairing
        {...actions}
        wallet={wallet}
        wcPayload={Promise.resolve('unused')}
        p2pPayload={Promise.resolve('')}
      />
    )
    const qrButton = container.querySelector('button#qr-code-icon')
    if (!qrButton) throw new Error('QR action was not rendered')
    fireEvent.click(qrButton)
    await waitFor(() => expect(actions.onClose).toHaveBeenCalledTimes(1))
    expect(actions.handleUpdateQRCode).not.toHaveBeenCalled()
    expect(actions.handleUpdateState).not.toHaveBeenCalled()
    expect(actions.handleDisplayQRExtra).not.toHaveBeenCalled()
  })
})
