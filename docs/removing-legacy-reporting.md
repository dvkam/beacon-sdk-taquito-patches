# Removal of legacy telemetry and bug reporting

The ECAD package line no longer collects performance telemetry or submits bug reports to the retired Papers backend. Pairing, request and connection-error screens no longer offer the built-in report form. Connection error details and normal wallet controls remain available.

Applications should remove the following obsolete configuration and API usage:

- `enableMetrics` in client options.
- `openBugReport`, `AlertConfig.openBugReport` from the UI package.
- `BeaconEvent.OPEN_BUG_REPORT` subscriptions and emissions.
- `BACKEND_URL` from the core package.
- `StorageKey.ENABLE_METRICS`, `StorageKey.USER_ID` and `StorageKey.BEACON_LAST_ERROR`.
- `WCStorage.backup`, which only copied diagnostics for the report form.

Previously stored diagnostic records are left inert. This change does not delete active wallet, account or WalletConnect storage. The SDK no longer creates the reporting database, user identifier or metric payloads. The executable examples also no longer load Sentry or initialize the retired Papers Sentry project.

The optional application-supplied `AnalyticsInterface` hook remains supported. Its default implementation is a no-op and it does not submit data to the retired backend. Wallet notification APIs are separate functionality and remain supported.
