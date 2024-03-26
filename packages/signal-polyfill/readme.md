# Signal Polyfill

A "signal" is a proposed first-class JavaScript data type that enables one-way data flow through cells of state or computations derived from other state/computations.

This is a polyfill for the `Signal` API.

# Examples

## Using signals

```js
import { Signal } from "signal-polyfill";
import { effect } from "./effect.js";

const counter = new Signal.State(0);
const isEven = new Signal.Computed(() => (counter.get() & 1) == 0);
const parity = new Signal.Computed(() => isEven.get() ? "even" : "odd");

effect(() => console.log(parity.get()));

setInterval(() => counter.set(counter.get() + 1), 1000);
```

> [!NOTE]
> The signal proposal does not include an `effect` API, since such APIs are often deeply integrated with rendering and batch strategies that are highly framework/library dependent. However, the proposal does seek to define a set of primitives that library authors can use to implement their own effects.

### Creating a simple effect

```js
import { Signal } from "signal-polyfill";

let needsEnqueue = false;

const w = new Signal.subtle.Watcher(() => {
  if (needsEnqueue) {
    needsEnqueue = false;
    queueMicrotask.enqueue(processPending);
  }
});

function processPending() {
  needsEnqueue = true;
    
  for (const s of w.getPending()) {
    s.get();
  }

  w.watch();
}

export function effect(callback) {
  let onUnwatch;
  const computed = new Signal.Computed(() => onUnwatch = callback(), {
    [Signal.subtle.unwatched]() {
      typeof onUnwatch === "function" && onUnwatch();
    }
  });

  w.watch(computed);
  computed.get();

  return () => w.unwatch(computed);
}
```

> [!IMPORTANT]
> The `Signal.subtle` APIs are so named in order to communicate that their correct use requires careful attention to detail. These APIs are not targeted at application-level code, but rather at framework/library authors.