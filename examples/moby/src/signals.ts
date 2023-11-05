interface Signal<T> {
    _version: number;
    sinks: Set<Subscriber>;
    get(): T;
    _addSubscriber(subscriber: Subscriber): void;
    // TODO: implement removeals similar to https://github.com/angular/angular/blob/main/packages/core/primitives/signals/src/graph.ts#L421
    _removeSubscriber(subscriber: Subscriber): void;
}

type SignalComparison<T> = (/*this: Signal<T>, */ t: T, t2: T) => boolean;

interface SignalOptions<T> {
    // Custom comparison function between old and new value. Default: Object.is.
    equals?: SignalComparison<T>;
}

interface ComputedOptions<T> extends SignalOptions<T> { }

enum DirtyState {
    Clean,
    MaybeDirty,
    Dirty
} // TODO: distinction needed?

interface Subscriber {
    deps: Set<Signal<any>>;
    _dirty: DirtyState;
    _version: number;
    _markStale(): void;
    _markMaybeStale(): void;
}

type EffectReturn = void | (() => void);

let version = 0;

let currentlyTracking: null | {
    subscriber: Subscriber;
    deps: Set<Signal<any>>;
};

let pendingReactions: null | Signal.Effect[] = null;

export namespace Signal {
    // A read-write Signal
    export class State<T> implements Signal<T> {
        sinks = new Set<Subscriber>();
        _version = version;
        _dirty: DirtyState = DirtyState.Clean;

        // Create a state Signal starting with the value t
        constructor(private _value: T, private options?: SignalOptions<T>) { }

        get(): T {
            markObserved(this);
            return this._value;
        }

        // Set the state Signal value to t
        set(t: T): void {
            invariant(
                !(currentlyTracking?.subscriber instanceof Computed),
                "Computed values cannot write as side effect"
            );
            if (!isEqual(this.options, this._value, t)) {
                this._value = t;
                this._version = ++version;
                // propagate changed
                this.sinks.forEach((s) => {
                    // Optimize: no forEach
                    s._markStale();
                });
            }
        }

        _addSubscriber(subscriber: Subscriber): void {
            this.sinks.add(subscriber);
        }
        _removeSubscriber(subscriber: Subscriber): void {
            this.sinks.delete(subscriber);
        }
    }

    // A Signal which is a formula based on other Signals
    export class Computed<T> implements Signal<T>, Subscriber {
        sinks = new Set<Subscriber>();
        deps = new Set<Signal<any>>();

        // By default we mark a computed as dirty!
        _dirty: DirtyState = DirtyState.Dirty;
        _version = -1;
        _value!: T;
        private isTracked = false;

        // Create a Signal which evaluates to the value of cb.call(the Signal)
        constructor(
            private compute: (this: Computed<T>) => T,
            private options?: ComputedOptions<T>
        ) { }

        get(): T {
            markObserved(this);
            if (!this.isTracked) {
                this.isTracked = currentlyTracking !== null;
            }
            // if the world didn't change since last read, we're fine anyway
            if (version !== this._version && shouldRecompute(this)) {
                // if this computed is untracked, we won't have backrefs notifying the state of this thing,
                // so we have to always check whether some dep version has changed!
                this._dirty = this.isTracked ? DirtyState.Clean : DirtyState.MaybeDirty;
                const newValue = track(this, this.compute, this.isTracked);
                if (this._version === -1 || !isEqual(this.options, this._value, newValue)) {
                    this._value = newValue;
                    this._version = version;
                }
            }
            return this._value;
        }

        _markStale() {
            if (this._dirty === DirtyState.Clean) {
                this.sinks.forEach((s) => s._markMaybeStale());
            }
            this._dirty = DirtyState.Dirty;
        }

        _markMaybeStale() {
            if (this._dirty === DirtyState.Clean) {
                this.sinks.forEach((s) => s._markMaybeStale());
                this._dirty = DirtyState.MaybeDirty;
            }
            // else: already Dirty or MaybeDirty
        }

        _addSubscriber(subscriber: Subscriber): void {
            invariant(this.isTracked); // someone should have read the value in a reactive context
            this.sinks.add(subscriber);
        }
        _removeSubscriber(subscriber: Subscriber): void {
            this.sinks.delete(subscriber);
            if (this.sinks.size === 0) {
                this.isTracked = false;
                // From this point onward, we can no longer assume annything
                this._dirty = DirtyState.MaybeDirty;
                // unsubscribe from our deps
                this.deps.forEach((dep) => {
                    dep._removeSubscriber(this);
                });
            }
        }
    }

    export class Effect implements Subscriber {
        _dirty: DirtyState = DirtyState.Dirty;
        _version = version;
        _disposed = false;
        _parent?: Effect;
        _children = new Set<Effect>() // optmization: lazy init
        deps: Set<Signal<any>> = new Set();
        _cleanup :EffectReturn

        // schedule should at some time call check
        // this.hasChangedDeps(), and if true, call directly or later
        // this.track(() => { } ...
        constructor(public onDepsChangedMaybe: (this: Effect) => void) {
            const subscriber = currentlyTracking?.subscriber;
            if (subscriber) {
                invariant(subscriber instanceof Effect, "Only Reactions can create other Reactions");
                subscriber._children.add(this);
                this._parent = subscriber;
            }
            this.onDepsChangedMaybe();
        }

        _markStale() {
            if (this._dirty === DirtyState.Clean) {
                this._scheduleInvalidation();
            }
            this._dirty = DirtyState.Dirty;
        }

        _markMaybeStale() {
            if (this._dirty === DirtyState.Clean) {
                this._scheduleInvalidation();
                this._dirty = DirtyState.MaybeDirty;
            }
            // else: already Dirty or MaybeDirty
        }

        _scheduleInvalidation() {
            if (this._disposed) {
                return;
            }
            if (pendingReactions === null) {
                pendingReactions = [this];
                scheduleInvalidateReactionsInMicrotask();
            } else {
                pendingReactions.push(this);
            }
        }

        hasChangedDeps(): boolean {
            if (this._disposed) {
                return false;
            }
            return shouldRecompute(this);
        }

        track(fn: (this: this) => EffectReturn): void {
            if (this._disposed) return;
            this._runCleanup();
            // TODO: error handling and such
            this._cleanup = track(this, fn, true);
            // store against which state version we did run
            this._version = version;
        }

        _runCleanup() {
            this._children.forEach((r) => {
                r._parent = undefined;
                r[Symbol.dispose]()
            })
            this._children.clear();
            let cleanup = this._cleanup;
            this._cleanup = undefined;
            cleanup?.();
        }

        [Symbol.dispose]() {
            this._disposed = true;
            // TODO: set flag that we have disposed?
            this.deps.forEach((d) => d._removeSubscriber(this));
            this.deps.clear();
            // remove the back reference if any
            this._parent?._children.delete(this);
            // run own cleanup lat
            this._runCleanup();
        }
    }

    export namespace unsafe {
        export function untrack<T>(cb: () => T): T {
            let prevTracking = currentlyTracking;
            currentlyTracking = null;
            try {
                return cb();
            } finally {
                currentlyTracking = prevTracking;
            }
        }
    }
}

function scheduleInvalidateReactionsInMicrotask() {
    queueMicrotask(() => {
        const toInvalidate = pendingReactions;
        pendingReactions = null; // unset first to be able to schedule another microtask if needed
        // In future: build loop protection
        invariant(toInvalidate); // should never be empty!
        toInvalidate.forEach((r) => {
            r.onDepsChangedMaybe();
        });
    });
}

function shouldRecompute(subscriber: Subscriber): boolean {
    if (subscriber._dirty === DirtyState.MaybeDirty) {
        subscriber._dirty = DirtyState.Clean; // Unless proven otherwise
        for (const dep of subscriber.deps) {
            // Optimization: Like MobX store lowestObservableState or loop the collection twice to see first if there is a higher version instead of MaybeDIrty
            if (dep instanceof Signal.Computed) {
                dep.get(); // force a recomputation of the value
            }
            if (dep._version > subscriber._version) {
                subscriber._dirty = DirtyState.Dirty; // cache the result, to avoid pulling another time
                break;
            }
        }
    }
    return !!subscriber._dirty; // clean -> 0 -> false, dirty -> 1 -> true
}

function track<S extends Subscriber, T>(
    subscriber: S,
    fn: (this: S) => T,
    storeBackRefs: boolean
): T {
    // TODO: error handling and such
    const origDeps = subscriber.deps;
    const prevTracking = currentlyTracking;
    const deps = new Set<Signal<any>>();
    currentlyTracking = {
        deps,
        subscriber
    };
    try {
        return fn.call(subscriber);
    } finally {
        subscriber._dirty = DirtyState.Clean;
        subscriber.deps = deps;
        // TODO: more efficient diffing with arrays like in MobX
        if (storeBackRefs) {
            for (const dep of deps) {
                if (!origDeps.has(dep)) dep._addSubscriber(subscriber);
            }
            for (const dep of origDeps) {
                if (!deps.has(dep)) dep._removeSubscriber(subscriber);
            }
        }
        currentlyTracking = prevTracking;
    }
}

function markObserved(signal: Signal<any>): void {
    currentlyTracking?.deps.add(signal); // Optimize: reuse MobX's lastObservedBy strategy
}

function invariant(
    condition: any,
    msg = "Invariant failure"
): asserts condition {
    if (!condition) {
        throw new Error(msg);
    }
}

function isEqual<T>(
    options: undefined | SignalOptions<T>,
    a: T,
    b: T
): boolean {
    return (options?.equals ?? Object.is)(a, b);
}

export function effect(fn: () => EffectReturn) {
    return new Signal.Effect(function () {
        if (this.hasChangedDeps()) {
            this.track(fn);
        }
    });
}
