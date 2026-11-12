import { test, expect } from '@playwright/test'

test('toast opt-out keeps real pairing UI and other handler instances', async ({ page }) => {
  await page.route('http://localhost:1234/toast-options.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Toast options</title><script src="./walletbeacon.min.js"></script>'
    })
  )
  await page.goto('http://localhost:1234/toast-options.html')
  await page.evaluate(`(async () => {
    window.quietEvents = new beacon.BeaconEventHandler({}, false, { enableToasts: false });
    await quietEvents.emit(beacon.BeaconEvent.SHOW_PREPARE, { walletInfo: { name: 'Wallet' } });
    await quietEvents.emit(beacon.BeaconEvent.PAIR_INIT, {
      p2pPeerInfo: Promise.resolve('p2p'),
      postmessagePeerInfo: Promise.resolve('extension'),
      walletConnectPeerInfo: Promise.resolve('wc'),
      networkType: beacon.NetworkType.MAINNET,
      analytics: { track() {} },
      abortedHandler() {}
    });
  })()`)
  await expect(page.locator('beacon-toast')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Connect Wallet', exact: true })).toBeVisible()

  await page.evaluate(`quietEvents.emit(beacon.BeaconEvent.PAIR_SUCCESS, {
    id: 'peer', name: 'Wallet', publicKey: 'key', version: '2',
    type: 'p2p-pairing-response', senderId: 'wallet', relayServer: 'relay'
  })`)
  await expect(page.locator('div.alert-wrapper-show')).toHaveCount(0)
  await expect(page.locator('beacon-toast')).toHaveCount(0)

  await page.evaluate(`new beacon.BeaconEventHandler().emit(
    beacon.BeaconEvent.SHOW_PREPARE, { walletInfo: { name: 'Wallet' } }
  )`)
  await expect(page.locator('beacon-toast')).toHaveCount(1)
  await expect(page.locator('beacon-toast').getByText(/Preparing Request/)).toBeVisible()
})
