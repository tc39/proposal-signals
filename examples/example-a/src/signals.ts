const CLEAN = 0;
const MAYBE_DIRTY = 1;
const DIRTY = 2;
const DESTROYED = 3;

const UNINITIALIZED = Symbol();
const MAX_SAFE_INT = Number.MAX_SAFE_INTEGER;

let current_sink: null | Computed<any> | Effect<any> = null;
let current_effect: null | Effect<any> = null;
let current_sources: null | Signal<any>[] = null;
let current_sources_index = 0;
let current_untracking = false;
// To prevent leaking when accumulating sinks during computed.get(),
// we can track unowned computed signals and skip their sinks
// accordingly in the cases where there's no current parent effect
// when reading the computed via computed.get().
let current_skip_sink = false;
// Used to prevent over-subscribing dependencies on a sink
let current_sink_read_clock = 1;
let current_read_clock = 1;
let current_write_clock = 1;

type SignalStatus =
  | typeof DIRTY
  | typeof MAYBE_DIRTY
  | typeof CLEAN
  | typeof DESTROYED;

export type StateOptions<T> = {
  equals?: (a: T, b: T) => boolean;
};

export type ComputedOptions<T> = {
  equals?: (a: T, b: T) => boolean;
};

export type EffectOptions<T> = {
  notify?: (signal: Effect<T>) => void;
  cleanup?: (signal: Effect<T>) => void;
};

function markSignalSinks<T>(
  signal: Signal<T>,
  toStatus: SignalStatus,
  forceNotify: boolean
): void {
  const sinks = signal.sinks;
  if (sinks !== null) {
    for (const sink of sinks) {
      const status = sink.status;
      const isEffect = sink instanceof Effect;
      if (
        status === DIRTY ||
        (isEffect && !forceNotify && sink === current_effect)
      ) {
        continue;
      }
      sink.status = toStatus;
      if (status === CLEAN) {
        if (isEffect) {
          notifyEffect(sink);
        } else {
          markSignalSinks(sink, MAYBE_DIRTY, forceNotify);
        }
      }
    }
  }
}

function updateEffectSignal<T>(signal: Effect<T>): void {
  const previous_effect = current_effect;
  current_effect = signal;
  try {
    signal.value = executeSignalCallback(signal);
  } finally {
    current_effect = previous_effect;
  }
}

function isSignalDirty<T>(signal: Computed<T> | Effect<T>): boolean {
  const status = signal.status;
  if (status === DIRTY) {
    return true;
  }
  if (status === MAYBE_DIRTY) {
    const sources = signal.sources;
    if (sources !== null) {
      for (const source of sources) {
        const sourceStatus = source.status;

        if (source instanceof State) {
          if (sourceStatus === DIRTY) {
            source.status = CLEAN;
            return true;
          }
          continue;
        }
        if (
          sourceStatus === MAYBE_DIRTY &&
          !isSignalDirty(source as Computed<T>)
        ) {
          source.status = CLEAN;
          continue;
        }
        if (source.status === DIRTY) {
          updateComputedSignal(source as Computed<T>, true);
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

function removeSink<T>(
  signal: Computed<T> | Effect<T>,
  startIndex: number,
  removeUnowned: boolean
): void {
  const sources = signal.sources;
  if (sources !== null) {
    for (let i = startIndex; i < sources.length; i++) {
      const source = sources[i];
      const sinks = source.sinks;
      let sinksSize = 0;
      if (sinks !== null) {
        sinksSize = sinks.length - 1;
        if (sinksSize === 0) {
          source.sinks = null;
        } else {
          const index = sinks.indexOf(signal);
          // Swap with last element and then remove.
          sinks[index] = sinks[sinksSize];
          sinks.pop();
        }
      }
      if (
        removeUnowned &&
        sinksSize === 0 &&
        source instanceof Computed &&
        source.unowned
      ) {
        removeSink(source, 0, true);
      }
    }
  }
}

function destroySignal<T>(signal: Signal<T>): void {
  const value = signal.value;
  signal.status = DESTROYED;
  signal.value = UNINITIALIZED as T;
  signal.equals = Object.is;
  signal.sinks = null;
  if (signal instanceof Effect) {
    removeSink(signal, 0, true);
    signal.sources = null;
    const cleanup = signal.cleanup;
    if (value !== UNINITIALIZED && typeof cleanup === "function") {
      cleanup.call(signal);
    }
    signal.cleanup = null;
    signal.notify = null;
  } else if (signal instanceof Computed) {
    removeSink(signal, 0, true);
    signal.sources = null;
  }
}

function updateComputedSignal<T>(
  signal: Computed<T>,
  forceNotify: boolean
): void {
  signal.status =
    current_skip_sink || (current_effect === null && signal.unowned)
      ? DIRTY
      : CLEAN;
  const value = executeSignalCallback(signal);
  const equals = signal.equals!;
  if (!equals.call(signal, signal.value, value)) {
    signal.value = value;
    markSignalSinks(signal, DIRTY, forceNotify);
  }
}

function executeSignalCallback<T>(signal: Computed<T> | Effect<T>): T {
  const previous_sources = current_sources;
  const previous_sink = current_sink;
  const previous_sources_index = current_sources_index;
  const previous_skip_sink = current_skip_sink;
  const previous_sink_read_clock = current_sink_read_clock;
  const is_unowned = signal instanceof Computed && signal.unowned;
  current_sources = null as null | Signal<any>[];
  current_sources_index = 0;
  current_sink = signal;
  current_skip_sink = current_effect === null && is_unowned;
  if (current_read_clock === MAX_SAFE_INT) {
    current_read_clock = 1;
  } else {
    current_read_clock++;
  }
  current_sink_read_clock = current_read_clock;

  try {
    const value = signal.callback();
    let sources = signal.sources;

    if (current_sources !== null) {
      removeSink(signal, current_sources_index, false);

      if (sources !== null && current_sources_index > 0) {
        sources.length = current_sources_index + current_sources.length;
        for (let i = 0; i < current_sources.length; i++) {
          sources[current_sources_index + i] = current_sources[i];
        }
      } else {
        signal.sources = sources = current_sources;
      }

      if (!current_skip_sink) {
        for (let i = current_sources_index; i < sources.length; i++) {
          const source = sources[i];

          if (source.sinks === null) {
            source.sinks = [signal];
          } else {
            source.sinks.push(signal);
          }
        }
      }
    } else if (sources !== null && current_sources_index < sources.length) {
      removeSink(signal, current_sources_index, false);
      sources.length = current_sources_index;
    }

    return value as T;
  } finally {
    current_sources = previous_sources;
    current_sources_index = previous_sources_index;
    current_sink = previous_sink;
    current_skip_sink = previous_skip_sink;
    current_sink_read_clock = previous_sink_read_clock;
  }
}

function updateSignalSources<T>(signal: Signal<T>): void {
  if (signal.status === DESTROYED) {
    return;
  }
  // Register the source on the current sink signal.
  if (current_sink !== null && !current_untracking) {
    const sources = current_sink.sources;
    const unowned = current_sink instanceof Computed && current_sink.unowned;
    if (
      current_sources === null &&
      sources !== null &&
      sources[current_sources_index] === signal &&
      !(unowned && current_effect)
    ) {
      current_sources_index++;
    } else if (current_sources === null) {
      current_sources = [signal];
    } else if (signal.readClock !== current_sink_read_clock) {
      current_sources.push(signal);
    }
    if (!unowned) {
      signal.readClock = current_sink_read_clock;
    }
  }
}

function notifyEffect<T>(signal: Effect<T>): void {
  const notify = signal.notify;
  if (notify !== null) {
    notify.call(signal, signal);
  }
}

class Signal<T> {
  sinks: null | Array<Computed<any> | Effect<any>>;
  equals: (a: T, b: T) => boolean;
  status: SignalStatus;
  value: T;
  readClock: number;

  constructor(value: T, options?: StateOptions<T>) {
    this.sinks = null;
    this.equals = options?.equals || Object.is;
    this.status = DIRTY;
    this.value = value;
    this.readClock = 0;
  }

  get(): T {
    updateSignalSources(this);
    return this.value;
  }
}

export class State<T> extends Signal<T> {
  set(value: T): void {
    if (!current_untracking && current_sink instanceof Computed) {
      throw new Error(
        "Writing to state signals during the computation phase (from within computed signals) is not permitted."
      );
    }
    if (!this.equals.call(this, this.value, value)) {
      this.value = value;
      if (current_write_clock === MAX_SAFE_INT) {
        current_write_clock = 1;
      } else {
        current_write_clock++;
      }
      if (
        current_effect !== null &&
        current_effect.sinks === null &&
        current_effect.status === CLEAN &&
        current_sources !== null &&
        current_sources.includes(this)
      ) {
        current_effect.status = DIRTY;
        notifyEffect(current_effect);
      }
      markSignalSinks(this, DIRTY, true);
    }
  }
}

export class Computed<T> extends Signal<T> {
  callback: () => T;
  sources: null | Signal<any>[];
  unowned: boolean;

  constructor(callback: () => T, options?: ComputedOptions<T>) {
    super(UNINITIALIZED as T, options);
    const unowned = current_effect === null;
    this.callback = callback;
    this.sources = null;
    this.unowned = unowned;
  }

  get(): T {
    updateSignalSources(this);
    if (isSignalDirty(this)) {
      updateComputedSignal(this, false);
    }
    return this.value;
  }
}

export class Effect<T> extends Signal<T> {
  callback: () => void;
  sources: null | Signal<any>[];
  notify: null | ((signal: Effect<T>) => void);
  cleanup: null | ((signal: Effect<T>) => void);

  constructor(callback: () => void, options?: EffectOptions<T>) {
    super(UNINITIALIZED as T);
    this.callback = callback;
    this.sources = null;
    this.notify = options?.notify ?? null;
    this.cleanup = options?.cleanup ?? null;
  }

  [Symbol.dispose]() {
    if (this.status !== DESTROYED) {
      destroySignal(this);
    }
  }

  get(): T {
    if (current_sink instanceof Computed) {
      throw new Error(
        "Reading effect signals during the computation phase (from within computed signals) is not permitted."
      );
    }
    if (this.status === DESTROYED) {
      throw new Error(
        "Cannot call get() on effect signals that have already been disposed."
      );
    }
    if (isSignalDirty(this)) {
      this.status = CLEAN;
      updateEffectSignal(this);
    }
    return this.value;
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
