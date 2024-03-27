# Signal Polyfill

A "signal" is a proposed first-class JavaScript data type that enables one-way data flow through cells of state or computations derived from other state/computations.

This is a polyfill for the `Signal` API.

## Examples

### Using signals

* Use `Signal.State(value)` to create a single "cell" of data that can flow through the unidirectional state graph.
* Use `Signal.Computed(callback)` to define a computation based on state or other computations flowing through the graph.

```js
import { Signal } from "signal-polyfill";
import { effect } from "./effect.js";

const counter = new Signal.State(0);
const isEven = new Signal.Computed(() => (counter.get() & 1) == 0);
const parity = new Signal.Computed(() => isEven.get() ? "even" : "odd");

effect(() => console.log(parity.get())); // Console logs "even" immediately.
setInterval(() => counter.set(counter.get() + 1), 1000); // Changes the counter every 1000ms.

// effect triggers console log "odd"
// effect triggers console log "even"
// effect triggers console log "odd"
// ...
```

The signal proposal does not include an `effect` API, since such APIs are often deeply integrated with rendering and batch strategies that are highly framework/library dependent. However, the proposal does seek to define a set of primitives that library authors can use to implement their own effects.

When working directly with library effect APIs, always be sure to understand the behavior of the `effect` implementation. While the signal algorithm is standardized, effects are not and may vary. To illustrate this, have a look at this code:

```js
counter.get(); // 0
effect(() => counter.set(counter.get() + 1)); // Infinite loop???
counter.get(); // 1
```

Depending on how the effect is implemented, the above code could result in an infinite loop. It's also important to note that running the effect, in this case, causes an immediate invocation of the callback, changing the value of the counter.

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
  let cleanup;
  
  const computed = new Signal.Computed(() => {
    typeof cleanup === "function" && cleanup();
    cleanup = callback();
  });
  
  w.watch(computed);
  computed.get();
  
  return () => {
    w.unwatch(computed);
    typeof cleanup === "function" && cleanup();
  };
}
```

> [!IMPORTANT]
> The `Signal.subtle` APIs are so named in order to communicate that their correct use requires careful attention to detail. These APIs are not targeted at application-level code, but rather at framework/library authors.

### Combining signals and decorators

A class accessor decorator can be combined with the `Signal.State()` API to enable improved DX.

```js
import { Signal } from "signal-polyfill";

export function signal(target) {
  const { get } = target;

  return {
    get() {
      return get.call(this).get();
    },

    set(value) {
      get.call(this).set(value);
    },
    
    init(value) {
      return new Signal.State(value);
    },
  };
}
```

The above decorator can be used on public or **private** accessors, enabling reactivity while carefully controlling state mutations.

```js
export class Counter {
  @signal accessor #value = 0;

  get value() {
    return this.#value;
  }

  increment() {
    this.#value++;
  }

  decrement() {
    if (this.#value > 0) {
      this.#value--;
    }
  }
}
```