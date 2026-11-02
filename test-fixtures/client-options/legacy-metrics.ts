import { LocalStorage, type ClientOptions } from '@ecadlabs/beacon-core'
import type { DAppClientOptions } from '@ecadlabs/beacon-dapp'

const storage = new LocalStorage()
export const clientOptions: ClientOptions[] = [
  { name: 'legacy-enabled', storage, enableMetrics: true },
  { name: 'legacy-disabled', storage, enableMetrics: false }
]
export const dappOptions: DAppClientOptions[] = [
  { name: 'legacy-enabled', enableMetrics: true },
  { name: 'legacy-disabled', enableMetrics: false }
]
