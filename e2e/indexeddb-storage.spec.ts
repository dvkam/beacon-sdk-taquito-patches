import { test, expect } from '@playwright/test'

declare const beacon: typeof import('@ecadlabs/beacon-sdk')

test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:1234/dapp.html')
})

test('opens a fresh IndexedDB database with all requested stores', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const storage = new beacon.IndexedDBStorage('fresh-storage-test', ['first', 'second'])
    const deadline = Date.now() + 10_000
    for (;;) {
      try {
        await storage.set('key', 'first-value', 'first')
        break
      } catch (error) {
        if (Date.now() >= deadline) throw error
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }
    await storage.set('key', 'second-value', 'second')
    return [await storage.get('key', 'first'), await storage.get('key', 'second')]
  })
  expect(result).toEqual(['first-value', 'second-value'])
})

test('upgrades an existing IndexedDB database to add a missing store', async ({ page }) => {
  const result = await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('upgrade-storage-test', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('existing')
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
    const storage = new beacon.IndexedDBStorage('upgrade-storage-test', ['existing', 'added'])
    const deadline = Date.now() + 10_000
    for (;;) {
      try {
        await storage.set('key', 'upgraded-value', 'added')
        break
      } catch (error) {
        if (Date.now() >= deadline) throw error
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }
    return storage.get('key', 'added')
  })
  expect(result).toBe('upgraded-value')
})

test('rejects fillStore when opening the target database fails', async ({ page }) => {
  const errorName = await page.evaluate(async () => {
    const originalOpen = indexedDB.open.bind(indexedDB)
    indexedDB.open = (name: string, version?: number): IDBOpenDBRequest => {
      const request = originalOpen(name, version)
      if (name === 'aborted-target-test') {
        request.addEventListener('upgradeneeded', () => request.transaction?.abort())
      }
      return request
    }
    try {
      const storage = new beacon.IndexedDBStorage('source-storage-test')
      await storage.fillStore('aborted-target-test', 'keyvaluestorage')
      return 'resolved'
    } catch (error) {
      return error instanceof DOMException ? error.name : String(error)
    } finally {
      indexedDB.open = originalOpen
    }
  })
  expect(errorName).toBe('AbortError')
})

test('preserves arbitrary structured records and every mixed bulk value', async ({ page }) => {
  const values = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('mixed-values-test', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('records')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('records', 'readwrite')
      const store = transaction.objectStore('records')
      store.put('text', 'a')
      store.put({ nested: ['record', 42] }, 'b')
      store.put(42, 'c')
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
    db.close()
    const storage = new beacon.IndexedDBStorage('mixed-values-test', ['records'])
    const deadline = Date.now() + 10_000
    for (;;) {
      try {
        await storage.get('readiness', 'records')
        break
      } catch (error) {
        if (Date.now() >= deadline) throw error
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }
    return {
      record: await storage.get('b', 'records'),
      all: await storage.getAll('records')
    }
  })
  expect(values).toEqual({
    record: { nested: ['record', 42] },
    all: ['text', { nested: ['record', 42] }, 42]
  })
})

test('keeps SDK-key normalization and missing-key behavior', async ({ page }) => {
  const values = await page.evaluate(async () => {
    const storage = new beacon.IndexedDBStorage('normalized-values-test')
    const deadline = Date.now() + 10_000
    for (;;) {
      try {
        await storage.get('readiness')
        break
      } catch (error) {
        if (Date.now() >= deadline) throw error
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }
    await storage.set(beacon.StorageKey.APP_METADATA_LIST, [{ senderId: 'sender', name: 'App' }])
    await storage.set(beacon.StorageKey.MULTI_NODE_SETUP_DONE, false)
    await storage.set(beacon.StorageKey.ACTIVE_ACCOUNT, 'undefined')
    const metadata = await storage.get(beacon.StorageKey.APP_METADATA_LIST)
    await storage.delete(beacon.StorageKey.APP_METADATA_LIST)
    return {
      metadata,
      empty: await storage.get(beacon.StorageKey.APP_METADATA_LIST),
      enabled: await storage.get(beacon.StorageKey.MULTI_NODE_SETUP_DONE),
      active: (await storage.get(beacon.StorageKey.ACTIVE_ACCOUNT)) ?? null,
      missing: (await storage.get('missing')) ?? null
    }
  })
  expect(values).toEqual({
    metadata: [{ senderId: 'sender', name: 'App' }],
    empty: [],
    enabled: false,
    active: null,
    missing: null
  })
})
