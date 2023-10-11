import type { Effect } from "./signals";
import * as Signal from "./signals";

let queue: null | Effect<any>[] = null;
let flush_count = 0;

function flushQueue() {
  const effects = queue as Effect<any>[];
  queue = null;
  if (flush_count === 0) {
    setTimeout(() => {
      flush_count = 0;
    });
  } else if (flush_count > 1000) {
    throw new Error("Possible infinite loop detected.");
  }
  flush_count++;
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i];
    const cleanup = e.get();
    if (typeof cleanup === 'function') {
        e.oncleanup = cleanup;
      }    
  }
}

function enqueueSignal(signal: Effect<any>): void {
  if (queue === null) {
    queue = [];
    queueMicrotask(flushQueue);
  }
  queue.push(signal);
}

export function effect<T>(cb: () => void | (() => void)) {
  // Create a new computed signal which evalutes to cb, which schedules
  // a read of itself on the microtask queue whenever one of its dependencies
  // might change
  let e = new Signal.Effect(cb);
  // Run the effect the first time and collect the dependencies
  const cleanup = e.get();
  if (typeof cleanup === 'function') {
    e.oncleanup = cleanup;
  }
  // Subscribe to future changes to call effect()
  e.start(enqueueSignal);
  // Return a callback which can be used for cleaning the effect up
  return () => e.stop();
}
