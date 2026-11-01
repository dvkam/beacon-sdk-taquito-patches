# Account restoration and disconnect

Startup restores the stored account only while that selection is current. Clearing the account, disconnecting, destroying the client or receiving a newer storage selection cancels older restoration work. A canceled restoration cannot select a peer or transport, write the active-account pointer or emit an active-account event.

Restoration checks that the shared pointer still names the account and that the account still exists. It does not rewrite the pointer. Explicit selections and clears order their active-account writes within each client, so a clear completes after an earlier write already in progress.

`clearActiveAccount()` may keep initialized transports available for pairing. `disconnect()` retires the client's transports and allows a later connection. `destroy()` retires the instance permanently. Stopping a pending Matrix login or sync also cancels its continuation, so it cannot restart polling or clear a newer connection's shared state.

Custom storage must deliver change notifications for writes from other clients. The storage interface has no conditional transaction operation, so it does not provide atomic ordering across clients using arbitrary asynchronous storage backends.
