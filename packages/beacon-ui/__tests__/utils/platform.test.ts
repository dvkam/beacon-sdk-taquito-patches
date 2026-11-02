import { isTwBrowser } from '../../src/utils/platform'

describe('Trust Wallet browser detection', () => {
  const originalProvider = Object.getOwnPropertyDescriptor(window, 'ethereum')

  const setProvider = (value: unknown): void => {
    Object.defineProperty(window, 'ethereum', { configurable: true, value })
  }

  afterEach(() => {
    if (originalProvider) {
      Object.defineProperty(window, 'ethereum', originalProvider)
    } else {
      Reflect.deleteProperty(window, 'ethereum')
    }
  })

  it('returns false for missing or malformed provider metadata', () => {
    Reflect.deleteProperty(window, 'ethereum')
    expect(isTwBrowser(window)).toBe(false)
    for (const provider of [undefined, null, 12, 'trust', false, [], {}]) {
      setProvider(provider)
      expect(isTwBrowser(window)).toBe(false)
    }
  })

  it('preserves the existing true-like Trust flag compatibility', () => {
    for (const isTrust of [true, 1, '1']) {
      setProvider({ isTrust })
      expect(isTwBrowser(window)).toBe(true)
    }
    setProvider(Object.assign(() => undefined, { isTrust: true }))
    expect(isTwBrowser(window)).toBe(true)
  })

  it('does not recognize false or unrelated flags as Trust Wallet', () => {
    for (const isTrust of [false, 0, '', 'true', null, undefined, {}]) {
      setProvider({ isTrust })
      expect(isTwBrowser(window)).toBe(false)
    }
  })
})
