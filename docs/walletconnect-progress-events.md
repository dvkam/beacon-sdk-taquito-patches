# WalletConnect proposal progress

Subscribe to `BeaconEvent.WALLETCONNECT_SESSION_PENDING` to show custom UI while a WalletConnect session proposal waits for approval. Its payload contains `walletInfo`.

`BeaconEvent.ACKNOWLEDGE_RECEIVED` remains the event for a wallet acknowledgement packet. Session proposal progress no longer emits it with empty `message` and `extraInfo` objects. Custom UI that used those pseudo-acknowledgements should subscribe to the new event. The default awaiting-confirmation toast is unchanged.
