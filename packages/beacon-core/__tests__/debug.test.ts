import { windowRef } from '../src/MockWindow'

const cases: { label: string; flag: unknown; enabled: boolean }[] = [
  { label: 'missing', flag: undefined, enabled: false },
  { label: 'false', flag: false, enabled: false },
  { label: 'truthy non-boolean', flag: 'false', enabled: true }
]

describe('debug configuration', () => {
  const original = Object.getOwnPropertyDescriptor(windowRef, 'beaconSdkDebugEnabled')

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    if (original) {
      Object.defineProperty(windowRef, 'beaconSdkDebugEnabled', original)
    } else {
      Reflect.deleteProperty(windowRef, 'beaconSdkDebugEnabled')
    }
    jest.restoreAllMocks()
  })

  it.each(cases)(
    'preserves the existing truthiness of the $label flag',
    async ({ flag, enabled }) => {
      Object.defineProperty(windowRef, 'beaconSdkDebugEnabled', {
        configurable: true,
        writable: true,
        value: flag
      })
      await jest.isolateModulesAsync(async () => {
        const { getDebugEnabled } = await import('../src/debug')
        expect(getDebugEnabled()).toBe(enabled)
      })
    }
  )

  it('uses the explicit setting after initialization', async () => {
    await jest.isolateModulesAsync(async () => {
      const { getDebugEnabled, setDebugEnabled } = await import('../src/debug')
      setDebugEnabled(true)
      expect(getDebugEnabled()).toBe(true)
      setDebugEnabled(false)
      expect(getDebugEnabled()).toBe(false)
    })
  })
})
