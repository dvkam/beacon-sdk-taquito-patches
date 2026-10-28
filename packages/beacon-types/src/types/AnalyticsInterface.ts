export interface AnalyticsInterface {
  track(trigger: 'click' | 'event', section: string, label: string, data?: object): void
}
