# Built-in notifications

Set uiOptions.enableToasts to false when your dApp presents request progress and results itself.

```ts
const client = new DAppClient({
  name: 'My dApp',
  uiOptions: { enableToasts: false }
})
```

This suppresses built-in prepare, sent, acknowledgement, success, error and late-response toasts, including proof-of-event and blockchain requests. Request results, errors and event subscriptions still work.

Pairing screens and modal error alerts stay enabled. Pairing completion and hideUI still close the appropriate UI. Explicit eventHandlers take precedence, so your handler may still display its own toast.

The default is true. Each client keeps its own setting. The option is read when the client is constructed.

disableDefaultEvents still disables all built-in handlers, including pairing and modal alerts. Explicit eventHandlers continue to run with that option too.
