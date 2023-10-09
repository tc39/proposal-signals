import type { Computed } from "./signals";
import * as Signal from "./signals";

let queue: null | Computed<any>[] = null;
let flush_count = 0;

function flushQueue() {
  const signals = queue as Computed<any>[];
  queue = null;
  if (flush_count === 0) {
    setTimeout(() => {
      flush_count = 0;
    });
  } else if (flush_count > 1000) {
    throw new Error("Possible infinite loop detected.");
  }
  flush_count++;
  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    signal.get();
  }
}

function enqueueSignal(signal: Computed<any>): void {
  if (queue === null) {
    queue = [];
    queueMicrotask(flushQueue);
  }
  queue.push(signal);
}

export function effect<T>(cb: () => void) {
  // Create a new computed signal which evalutes to cb, which schedules
  // a read of itself on the microtask queue whenever one of its dependencies
  // might change
  let e = new Signal.Computed(cb, { effect: enqueueSignal });
  // Run the effect the first time and collect the dependencies
  e.get();
  // Subscribe to future changes to call effect()
  e.startEffects();
  // Return a callback which can be used for cleaning the effect up
  return () => e.stopEffects();
}
