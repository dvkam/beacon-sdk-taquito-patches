import { AnalyticsInterface } from '@ecadlabs/beacon-types'

export class MockAnalytics implements AnalyticsInterface {
  public track(..._args: Parameters<AnalyticsInterface['track']>): void
  public track(): void {
    // No analytics backend is configured.
  }
}
