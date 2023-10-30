import type { Effect } from "./signals";
import * as Signal from "./signals";

let queue: null | Effect<any>[] = null;
let flush_count = 0;

function pushChild<T>(
  target: ExampleFrameworkEffect<T>,
  child: ExampleFrameworkEffect<T>
): void {
  const children = target.children;
  if (children === null) {
    target.children = [child];
  } else {
    children.push(child);
  }
}

function destroyEffectChildren<V>(signal: ExampleFrameworkEffect<V>): void {
  const children = signal.children;
  signal.children = null;
  if (children !== null) {
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      child[Symbol.dispose]();
    }
  }
}

export class ExampleFrameworkEffect<T> extends Signal.Effect<T> {
  dispose: void | (() => void);
  children: null | ExampleFrameworkEffect<T>[];

  constructor(callback: () => void, notify: (effect: Effect<any>) => void) {
    super(
      () => {
        destroyEffectChildren(this);
        if (typeof this.dispose === "function") {
          this.dispose();
        }
        this.dispose = callback();
      },
      {
        cleanup: () => {
          if (typeof this.dispose === "function") {
            this.dispose();
          }
        },
        notify,
      }
    );
    this.dispose = undefined;
    this.children = null;
    const current_effect =
      Signal.getActiveEffect() as null | ExampleFrameworkEffect<T>;
    if (current_effect !== null) {
      pushChild(current_effect, this);
    }
  }

  [Symbol.dispose]() {
    destroyEffectChildren(this);
    super[Symbol.dispose]();
  }
}

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
    e.get();
  }
}

function enqueueSignal(signal: Effect<any>): void {
  if (queue === null) {
    queue = [];
    queueMicrotask(flushQueue);
  }
  queue.push(signal);
}

export function effect(cb: () => void | (() => void)) {
  let e = new ExampleFrameworkEffect(cb, enqueueSignal);
  e.get();
  return () => e[Symbol.dispose]();
}
