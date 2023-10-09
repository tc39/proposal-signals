const CLEAN = 0;
const MAYBE_DIRTY = 1;
const DIRTY = 2;
const DESTROYED = 3;

const NO_VALUE = Symbol();

let current_consumer: null | Computed<any> = null;
let current_effectful_consumer: null | Computed<any> = null;
let current_dependencies: null | Signal<any>[] = null;
let current_dependencies_index = 0;
let current_untracking = false;
// Used to prevent over-subscribing dependencies on a consumer
let current_global_access_id = 1;
let current_access_id = 1;

type SignalStatus =
  | typeof DIRTY
  | typeof MAYBE_DIRTY
  | typeof CLEAN
  | typeof DESTROYED;

export type StateOptions<T> = {
  equals?: (a: T, b: T) => boolean;
};

export type ComputedOptions<T> = {
  effect?: (signal: Computed<T>) => void;
  equals?: (a: T, b: T) => boolean;
};

function isComputedDirty<T>(signal: Computed<T>): boolean {
  const status = signal.status;
  if (status === DIRTY) {
    return true;
  } else if (status === MAYBE_DIRTY) {
    const dependencies = signal.dependencies;
    if (dependencies !== null) {
      const length = dependencies.length;
      for (let i = 0; i < length; i++) {
        const dependency = dependencies[i];

        if (
          dependency.status === MAYBE_DIRTY &&
          !isComputedDirty(dependency as Computed<T>)
        ) {
          dependency.status = CLEAN;
          continue;
        }
        if (dependency.status === DIRTY) {
          updateComputed(dependency as Computed<T>);
          // Might have been mutated from above get.
          if (signal.status === DIRTY) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function removeConsumer<T>(signal: Computed<T>, start_index: number): void {
  const dependencies = signal.dependencies;
  if (dependencies !== null) {
    for (let i = start_index; i < dependencies.length; i++) {
      const dependency = dependencies[i];
      const consumers = dependency.consumers;
      let consumers_length = 0;
      if (consumers !== null) {
        consumers_length = consumers.length - 1;
        if (consumers_length === 0) {
          dependency.consumers = null;
        } else {
          const index = consumers.indexOf(signal);
          // Swap with last element and then remove.
          consumers[index] = consumers[consumers_length];
          consumers.pop();
        }
      }
    }
  }
}

function executeComputed<T>(signal: Computed<T>): T {
  const previous_dependencies = current_dependencies;
  const previous_dependencies_index = current_dependencies_index;
  const previous_access_id = current_access_id;
  const previous_consumer = current_consumer;
  const previous_effectful_signal = current_effectful_consumer;
  current_dependencies = null as null | Signal<T>[];
  current_dependencies_index = 0;
  current_global_access_id++;
  if (current_global_access_id === 255) {
    current_global_access_id = 1;
  }
  current_access_id = current_global_access_id;
  current_consumer = signal;
  if (signal.effect !== null) {
    current_effectful_consumer = signal;
  }

  try {
    const value = signal.callback();
    let dependencies = signal.dependencies;

    if (current_dependencies !== null) {
      removeConsumer(signal, current_dependencies_index);

      if (dependencies !== null && current_dependencies_index > 0) {
        dependencies.length =
          current_dependencies_index + current_dependencies.length;
        for (let i = 0; i < current_dependencies.length; i++) {
          dependencies[current_dependencies_index + i] =
            current_dependencies[i];
        }
      } else {
        signal.dependencies = dependencies = current_dependencies;
      }

      for (let i = current_dependencies_index; i < dependencies.length; i++) {
        const dependency = dependencies[i];

        if (dependency.consumers === null) {
          dependency.consumers = [signal];
        } else {
          dependency.consumers.push(signal);
        }
      }
    } else if (
      dependencies !== null &&
      current_dependencies_index < dependencies.length
    ) {
      removeConsumer(signal, current_dependencies_index);
      dependencies.length = current_dependencies_index;
    }

    return value;
  } finally {
    current_dependencies = previous_dependencies;
    current_dependencies_index = previous_dependencies_index;
    current_access_id = previous_access_id;
    current_consumer = previous_consumer;
    current_effectful_consumer = previous_effectful_signal;
  }
}

function updateComputed<T>(signal: Computed<T>): void {
  signal.status = CLEAN;
  const value = executeComputed(signal);
  const equals = signal.equals!;
  if (!equals.call(signal, signal.value, value)) {
    signal.value = value;
    markSignalConsumers(signal, DIRTY);
  }
}

function markSignalConsumers<T>(
  signal: Signal<T>,
  toStatus: SignalStatus
): void {
  const consumers = signal.consumers;
  if (consumers !== null) {
    const length = consumers.length;
    for (let i = 0; i < length; i++) {
      const consumer = consumers[i];
      const status = consumer.status;
      if (status === DIRTY) {
        continue;
      }
      consumer.status = toStatus;
      if (status === CLEAN) {
        const effect = consumer.effect;
        if (effect !== null && consumer.effecting) {
          effect.call(consumer, consumer);
        } else {
          markSignalConsumers(consumer, MAYBE_DIRTY);
        }
      }
    }
  }
}

class Signal<T> {
  #access_id: number;
  consumers: null | Computed<any>[];
  equals: (a: T, b: T) => boolean;
  status: SignalStatus;
  value: T;

  constructor(value: T, options?: StateOptions<T>) {
    this.consumers = null;
    this.equals = options?.equals || Object.is;
    this.status = DIRTY;
    this.value = value;
  }

  #updateDependencies() {
    if (this.status === DESTROYED) {
      return;
    }
    // Register the dependency on the current consumer signal.
    if (current_consumer !== null && !current_untracking) {
      const dependencies = current_consumer.dependencies;
      if (
        current_dependencies === null &&
        dependencies !== null &&
        dependencies[current_dependencies_index] === this
      ) {
        current_dependencies_index++;
      } else if (current_dependencies === null) {
        current_dependencies = [this];
      } else if (this.#access_id !== current_access_id) {
        current_dependencies.push(this);
      }
      this.#access_id = current_access_id;
    }
  }

  get(): T {
    this.#updateDependencies();
    return this.value;
  }
}

export class State<T> extends Signal<T> {
  set(value: T): void {
    if (!this.equals.call(this, this.value, value)) {
      this.value = value;
      if (
        !current_untracking &&
        current_effectful_consumer !== null &&
        current_effectful_consumer.consumers === null &&
        current_effectful_consumer.status === CLEAN
      ) {
        const effect = current_effectful_consumer.effect;
        if (effect !== null) {
          current_effectful_consumer.status = DIRTY;
          effect.call(current_effectful_consumer, current_effectful_consumer);
        }
      }
      markSignalConsumers(this, DIRTY);
    }
  }
}

function untrack<T>(fn: () => T): T {
  const previous_untracking = current_untracking;
  try {
    current_untracking = true;
    return fn();
  } finally {
    current_untracking = previous_untracking;
  }
}

export const unsafe = {
  untrack,
};

export class Computed<T> extends Signal<T> {
  callback: () => T;
  dependencies: null | Signal<any>[];
  effect: null | ((signal: Computed<T>) => void);
  effecting: boolean;

  constructor(callback: () => T, options?: ComputedOptions<T>) {
    super(NO_VALUE as T, options);
    this.callback = callback;
    this.dependencies = null;
    this.effect = options?.effect || null;
    this.effecting = false;
  }

  // TODO: Doesn't implement the GC mechanics
  startEffects(): void {
    this.effecting = true;
  }

  // TODO: Doesn't implement the GC mechanics
  stopEffects(): void {
    this.effecting = false;
  }

  get(): T {
    if (isComputedDirty(this)) {
      updateComputed(this);
    }
    return super.get();
  }
}
