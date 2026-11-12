import { test, expect } from '@playwright/test'
import type { StorageChangeEvent } from '@ecadlabs/beacon-types'

declare const beacon: typeof import('@ecadlabs/beacon-sdk')
declare global {
  interface Window {
    recordStorageChange(event: StorageChangeEvent): Promise<void>
  }
}

test('delivers prefixed LocalStorage changes from another document with physical keys', async ({
  page,
  context
}) => {
  await page.goto('http://localhost:1234/dapp.html')
  const changes: StorageChangeEvent[] = []
  await page.exposeFunction('recordStorageChange', (event: StorageChangeEvent) => {
    changes.push(event)
  })
  await page.evaluate(async () => {
    await new beacon.LocalStorage('notifications').subscribeToStorageChanged((event) =>
      window.recordStorageChange(event)
    )
  })
  const writer = await context.newPage()
  try {
    await writer.goto('http://localhost:1234/dapp.html')
    await writer.evaluate(() => {
      localStorage.setItem(`notifications-nested-${beacon.StorageKey.ACTIVE_ACCOUNT}`, 'foreign')
      localStorage.setItem(`notifications-${beacon.StorageKey.ACTIVE_ACCOUNT}`, 'selected-account')
    })
    await expect
      .poll(() => changes)
      .toEqual([
        {
          eventType: 'entryModified',
          key: 'notifications-beacon:active-account',
          oldValue: null,
          newValue: 'selected-account'
        }
      ])
    await writer.evaluate(() => {
      localStorage.removeItem(`notifications-${beacon.StorageKey.ACTIVE_ACCOUNT}`)
    })
    await expect
      .poll(() => changes)
      .toEqual([
        {
          eventType: 'entryModified',
          key: 'notifications-beacon:active-account',
          oldValue: null,
          newValue: 'selected-account'
        },
        {
          eventType: 'entryModified',
          key: 'notifications-beacon:active-account',
          oldValue: 'selected-account',
          newValue: null
        }
      ])
  } finally {
    await writer.close()
  }
})
