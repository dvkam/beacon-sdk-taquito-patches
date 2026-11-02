export interface Extension {
  id: string
  name: string
  shortName?: string
  iconUrl?: string
  color?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Checks the metadata shared by UI and transport extension discovery. */
export const isExtension = (sender: unknown): sender is Extension =>
  isRecord(sender) &&
  typeof sender.id === 'string' &&
  typeof sender.name === 'string' &&
  (sender.shortName === undefined || typeof sender.shortName === 'string') &&
  (sender.iconUrl === undefined || typeof sender.iconUrl === 'string') &&
  (sender.color === undefined || typeof sender.color === 'string')
