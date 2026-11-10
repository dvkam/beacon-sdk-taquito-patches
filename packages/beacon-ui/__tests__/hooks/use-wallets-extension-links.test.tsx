import { vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import useWallets from '../../src/ui/alert/hooks/useWallets'
import { getAvailableExtensions } from '../../src/utils/extensions'
import { OSLink } from '../../src/utils/wallets'

vi.mock('../../src/utils/extensions', () => ({
  getAvailableExtensions: vi.fn()
}))

describe('discovered extension wallet links', () => {
  it.each([
    {
      name: 'a string link',
      metadata: { link: 'https://extension.example' },
      expected: 'https://extension.example'
    },
    { name: 'no link', metadata: {}, expected: '' },
    {
      name: 'a malformed link',
      metadata: { link: { url: 'https://extension.example' } },
      expected: ''
    }
  ])('maps $name to the extension wallet link', async ({ metadata, expected }) => {
    const extension = new Proxy(
      { id: 'custom-extension-issue35', name: 'Custom Wallet', ...metadata },
      {
        has() {
          throw new Error('Extension metadata does not support property checks')
        }
      }
    )
    vi.mocked(getAvailableExtensions).mockResolvedValue([extension])

    const { result } = renderHook(() => useWallets())

    await waitFor(() => {
      expect(result.current.wallets.get(extension.id)?.links[OSLink.EXTENSION]).toBe(expected)
    })
  })
})
