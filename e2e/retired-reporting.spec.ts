import { test, expect } from '@playwright/test'

for (const stalePreference of [false, true]) {
  test(`pairing and errors have no legacy reporting path, stale preference ${stalePreference}`, async ({
    page
  }) => {
    const retiredRequests: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (
        url.hostname === 'beacon-backend.prod.gke.papers.tech' ||
        url.hostname === 'sentry.papers.tech' ||
        url.hostname === 'browser.sentry-cdn.com' ||
        url.pathname.includes('/bug-report/') ||
        url.pathname.includes('/performance-metrics/')
      ) {
        retiredRequests.push(request.url())
      }
    })
    await page.route('**/beacon-backend.prod.gke.papers.tech/**', (route) => route.abort())
    await page.route('**/sentry.papers.tech/**', (route) => route.abort())
    await page.route('**/browser.sentry-cdn.com/**', (route) => route.abort())
    if (stalePreference) {
      await page.addInitScript(() => localStorage.setItem('beacon:enable_metrics', 'true'))
    }
    await page.goto('http://localhost:1234/dapp.html')
    expect(await page.evaluate(() => 'Sentry' in window)).toBe(false)
    await page.click('#requestPermission')
    const alert = page.locator('div.alert-wrapper-show')
    await expect(alert).toBeVisible()
    await expect(alert.getByText(/report a bug|Send Report|Beacon team/i)).toHaveCount(0)
    await expect(alert.locator('form')).toHaveCount(0)
    await expect(alert.getByRole('heading', { name: 'Connect Wallet' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('beacon:user-id'))).toBeNull()
    expect(
      await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name))
    ).not.toContain('beacon')

    await page.locator('div.button-icon').first().click()
    await expect(alert).toHaveCount(0)
    await page.click('#sendToSelf')
    await expect(page.locator('div.alert-wrapper-show div.info-description')).toContainText(
      'No active account'
    )
    await expect(
      page.locator('div.alert-wrapper-show').getByText(/report a bug|Send Report|Beacon team/i)
    ).toHaveCount(0)
    expect(retiredRequests).toEqual([])
  })
}
