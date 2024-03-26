/*
 ** Copyright 2024 Bloomberg Finance L.P.
 **
 ** Licensed under the Apache License, Version 2.0 (the "License");
 ** you may not use this file except in compliance with the License.
 ** You may obtain a copy of the License at
 **
 **     http://www.apache.org/licenses/LICENSE-2.0
 **
 ** Unless required by applicable law or agreed to in writing, software
 ** distributed under the License is distributed on an "AS IS" BASIS,
 ** WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 ** See the License for the specific language governing permissions and
 ** limitations under the License.
 */

/* eslint-disable @typescript-eslint/no-this-alias */
import { Signal } from './wrapper.js';

describe("Signal.State", () => {
  it("should work", () => {
    const stateSignal = new Signal.State(0);
    expect(stateSignal.get()).toEqual(0);

    stateSignal.set(10);

    expect(stateSignal.get()).toEqual(10);
  });
});

describe("Computed", () => {
  it("should work", () => {
    const stateSignal = new Signal.State(1);

    const computedSignal = new Signal.Computed(() => {
      const f = stateSignal.get() * 2;
      return f;
    });

    expect(computedSignal.get()).toEqual(2);

    stateSignal.set(5);

    expect(stateSignal.get()).toEqual(5);
    expect(computedSignal.get()).toEqual(10);
  });
});

describe("Watcher", () => {
  type Destructor = () => void;
  const notifySpy = jasmine.createSpy();

  const watcher = new Signal.subtle.Watcher(() => {
    notifySpy();
  });

  function effect(cb: () => Destructor | void): () => void {
    let destructor: Destructor | void;
    const c = new Signal.Computed(() => (destructor = cb()));
    watcher.watch(c);
    c.get();
    return () => {
      destructor?.();
      watcher.unwatch(c);
    };
  }

  function flushPending() {
    for (const signal of watcher.getPending()) {
      signal.get();
    }
    expect(watcher.getPending()).toEqual([]);
  }

  afterEach(() => watcher.unwatch(...Signal.subtle.introspectSources(watcher)));

  it("should work", () => {
    const watchedSpy = jasmine.createSpy();
    const unwatchedSpy = jasmine.createSpy();
    const stateSignal = new Signal.State(1, {
      [Signal.subtle.watched]: watchedSpy,
      [Signal.subtle.unwatched]: unwatchedSpy,
    });

    stateSignal.set(100);
    stateSignal.set(5);

    const computedSignal = new Signal.Computed(() => stateSignal.get() * 2);

    let calls = 0;
    let output = 0;
    let computedOutput = 0;

    // Ensure the call backs are not called yet
    expect(watchedSpy.calls.count()).toBe(0);
    expect(unwatchedSpy.calls.count()).toBe(0);

    // Expect the watcher to not have any sources as nothing has been connected yet
    expect(Signal.subtle.introspectSources(watcher)).toHaveSize(0);
    expect(Signal.subtle.introspectSinks(computedSignal)).toHaveSize(0);
    expect(Signal.subtle.introspectSinks(stateSignal)).toHaveSize(0);

    expect(Signal.subtle.isWatched(stateSignal)).toEqual(false);

    const destructor = effect(() => {
      output = stateSignal.get();
      computedOutput = computedSignal.get();
      calls++;
      return () => {};
    });

    // The signal is now watched
    expect(Signal.subtle.isWatched(stateSignal)).toEqual(true);

    // Now that the effect is created, there will be a source
    expect(Signal.subtle.introspectSources(watcher)).toHaveSize(1);
    expect(Signal.subtle.introspectSinks(computedSignal)).toHaveSize(1);

    // Note: stateSignal has more sinks because one is for the computed signal and one is the effect.
    expect(Signal.subtle.introspectSinks(stateSignal)).toHaveSize(2);

    // Now the watched callback should be called
    expect(watchedSpy.calls.count()).toBe(1);
    expect(unwatchedSpy.calls.count()).toBe(0);

    // It should not have notified yet
    expect(notifySpy.calls.count()).toBe(0);

    stateSignal.set(10);

    // After a signal has been set, it should notify
    expect(notifySpy.calls.count()).toBe(1);

    // Initially, the effect should not have run
    expect(calls).toEqual(1);
    expect(output).toEqual(5);
    expect(computedOutput).toEqual(10);

    flushPending();

    // The effect should run, and thus increment the value
    expect(calls).toEqual(2);
    expect(output).toEqual(10);
    expect(computedOutput).toEqual(20);

    // Kicking it off again, the effect should run again
    watcher.watch();
    stateSignal.set(20);
    expect(watcher.getPending()).toHaveSize(1);
    flushPending();

    // After a signal has been set, it should notify again
    expect(notifySpy.calls.count()).toBe(2);

    expect(calls).toEqual(3);
    expect(output).toEqual(20);
    expect(computedOutput).toEqual(40);

    Signal.subtle.untrack(() => {
      // Untrack doesn't affect set, only get
      stateSignal.set(999);
      expect(calls).toEqual(3);
      flushPending();
      expect(calls).toEqual(4);
    });

    // Destroy and un-subscribe
    destructor();

    // Since now it is un-subscribed, it should now be called
    expect(unwatchedSpy.calls.count()).toBe(1);
    // We can confirm that it is un-watched by checking it
    expect(Signal.subtle.isWatched(stateSignal)).toEqual(false);

    // Since now it is un-subscribed, this should have no effect now
    stateSignal.set(200);
    flushPending();

    // Make sure that effect is no longer running
    // Everything should stay the same
    expect(calls).toEqual(4);
    expect(output).toEqual(999);
    expect(computedOutput).toEqual(1998);

    expect(watcher.getPending()).toHaveSize(0);

    // Adding any other effect after an unwatch should work as expected
    effect(() => {
       output = stateSignal.get();
       return () => {};
    });

    stateSignal.set(300);
    flushPending();
  });
});

describe("Expected class shape", () => {
  it("should be on the prototype", () => {
    expect(typeof Signal.State.prototype.get).toBe("function");
    expect(typeof Signal.State.prototype.set).toBe("function");
    expect(typeof Signal.Computed.prototype.get).toBe("function");
    expect(typeof Signal.subtle.Watcher.prototype.watch).toBe("function");
    expect(typeof Signal.subtle.Watcher.prototype.unwatch).toBe("function");
    expect(typeof Signal.subtle.Watcher.prototype.getPending).toBe("function");
  });
});

describe("Comparison semantics", () => {
  it("should cache State by Object.is", () => {
    const state = new Signal.State(NaN);
    let calls = 0;
    const computed = new Signal.Computed(() => {
      calls++;
      return state.get();
    });
    expect(calls).toBe(0);
    expect(Object.is(computed.get(), NaN)).toBeTrue();
    expect(calls).toBe(1);
    state.set(NaN);
    expect(Object.is(computed.get(), NaN)).toBeTrue();
    expect(calls).toBe(1);
  });

  it("should track Computed by Object.is", () => {
    const state = new Signal.State(1);
    let value = 5;
    let calls = 0;
    const computed = new Signal.Computed(() => (state.get(), value));
    const c2 = new Signal.Computed(() => (calls++, computed.get()));

    expect(calls).toBe(0);
    expect(c2.get()).toBe(5);
    expect(calls).toBe(1);
    state.set(2);
    expect(c2.get()).toBe(5);
    expect(calls).toBe(1);
    value = NaN;
    expect(c2.get()).toBe(5);
    expect(calls).toBe(1);
    state.set(3);
    expect(Object.is(c2.get(), NaN)).toBeTrue();
    expect(calls).toBe(2);
    state.set(4);
    expect(Object.is(c2.get(), NaN)).toBeTrue();
    expect(calls).toBe(2);
  });

  it("applies custom equality in State", () => {
    let ecalls = 0;
    const state = new Signal.State(1, {
      equals() {
        ecalls++;
        return false;
      },
    });
    let calls = 0;
    const computed = new Signal.Computed(() => {
      calls++;
      return state.get();
    });

    expect(calls).toBe(0);
    expect(ecalls).toBe(0);

    expect(computed.get()).toBe(1);
    expect(ecalls).toBe(0);
    expect(calls).toBe(1);

    state.set(1);
    expect(computed.get()).toBe(1);
    expect(ecalls).toBe(1);
    expect(calls).toBe(2);
  });

  it("applies custom equality in Computed", () => {
    const s = new Signal.State(5);
    let ecalls = 0;
    const c1 = new Signal.Computed(() => (s.get(), 1), {
      equals() {
        ecalls++;
        return false;
      },
    });
    let calls = 0;
    const c2 = new Signal.Computed(() => {
      calls++;
      return c1.get();
    });

    expect(calls).toBe(0);
    expect(ecalls).toBe(0);

    expect(c2.get()).toBe(1);
    expect(ecalls).toBe(0);
    expect(calls).toBe(1);

    s.set(10);
    expect(c2.get()).toBe(1);
    expect(ecalls).toBe(1);
    expect(calls).toBe(2);
  });
});

describe("Untrack", () => {
  it("works", () => {
    const state = new Signal.State(1);
    const computed = new Signal.Computed(() =>
      Signal.subtle.untrack(() => state.get()),
    );
    expect(computed.get()).toBe(1);
    state.set(2);
    expect(computed.get()).toBe(1);
  });
  it("works differently without untrack", () => {
    const state = new Signal.State(1);
    const computed = new Signal.Computed(() => state.get());
    expect(computed.get()).toBe(1);
    state.set(2);
    expect(computed.get()).toBe(2);
  });
});

describe("liveness", () => {
  it("only changes on first and last descendant", () => {
    const watchedSpy = jasmine.createSpy();
    const unwatchedSpy = jasmine.createSpy();
    const state = new Signal.State(1, {
      [Signal.subtle.watched]: watchedSpy,
      [Signal.subtle.unwatched]: unwatchedSpy,
    });
    const computed = new Signal.Computed(() => state.get());
    computed.get();
    expect(watchedSpy.calls.count()).toBe(0);
    expect(unwatchedSpy.calls.count()).toBe(0);

    const w = new Signal.subtle.Watcher(() => {});
    const w2 = new Signal.subtle.Watcher(() => {});

    w.watch(computed);
    expect(watchedSpy.calls.count()).toBe(1);
    expect(unwatchedSpy.calls.count()).toBe(0);

    w2.watch(computed);
    expect(watchedSpy.calls.count()).toBe(1);
    expect(unwatchedSpy.calls.count()).toBe(0);

    w2.unwatch(computed);
    expect(watchedSpy.calls.count()).toBe(1);
    expect(unwatchedSpy.calls.count()).toBe(0);

    w.unwatch(computed);
    expect(watchedSpy.calls.count()).toBe(1);
    expect(unwatchedSpy.calls.count()).toBe(1);
  });

  it("is tracked well on computed signals", () => {
    const watchedSpy = jasmine.createSpy();
    const unwatchedSpy = jasmine.createSpy();
    const s = new Signal.State(1);
    const c = new Signal.Computed(() => s.get(), {
      [Signal.subtle.watched]: watchedSpy,
      [Signal.subtle.unwatched]: unwatchedSpy,
    });

    c.get();
    expect(watchedSpy.calls.count()).toBe(0);
    expect(unwatchedSpy.calls.count()).toBe(0);

    const w = new Signal.subtle.Watcher(() => {});
    w.watch(c);
    expect(watchedSpy.calls.count()).toBe(1);
    expect(unwatchedSpy.calls.count()).toBe(0);

    w.unwatch(c);
    expect(watchedSpy.calls.count()).toBe(1);
    expect(unwatchedSpy.calls.count()).toBe(1);
  });
});

describe("Errors", () => {
  it("are cached by computed signals", () => {
    const s = new Signal.State("first");
    let n = 0;
    const c = new Signal.Computed(() => {
      n++;
      throw s.get();
    });
    let n2 = 0;
    const c2 = new Signal.Computed(() => {
      n2++;
      return c.get();
    });
    expect(n).toBe(0);
    expect(() => c.get()).toThrow("first");
    expect(() => c2.get()).toThrow("first");
    expect(n).toBe(1);
    expect(n2).toBe(1);
    expect(() => c.get()).toThrow("first");
    expect(() => c2.get()).toThrow("first");
    expect(n).toBe(1);
    expect(n2).toBe(1);
    s.set("second");
    expect(() => c.get()).toThrow("second");
    expect(() => c2.get()).toThrow("second");
    expect(n).toBe(2);
    expect(n2).toBe(2);

    // Doesn't retrigger on setting state to the same value
    s.set("second");
    expect(n).toBe(2);
  });
  it("are cached by computed signals when watched", () => {
    const s = new Signal.State("first");
    let n = 0;
    const c = new Signal.Computed<unknown>(() => {
      n++;
      throw s.get();
    });
    const w = new Signal.subtle.Watcher(() => {});
    w.watch(c);

    expect(n).toBe(0);
    expect(() => c.get()).toThrow("first");
    expect(n).toBe(1);
    expect(() => c.get()).toThrow("first");
    expect(n).toBe(1);
    s.set("second");
    expect(() => c.get()).toThrow("second");
    expect(n).toBe(2);

    s.set("second");
    expect(n).toBe(2);
  });
});

describe("Cycles", () => {
  it("detects trivial cycles", () => {
    const c: Signal.Computed<never> = new Signal.Computed(() => c.get());
    expect(() => c.get()).toThrow();
  });
  it("detects slightly larger cycles", () => {
    const c: Signal.Computed<never> = new Signal.Computed(() => c2.get());
    const c2 = new Signal.Computed(() => c.get());
    const c3 = new Signal.Computed(() => c2.get());
    expect(() => c3.get()).toThrow();
  });
});

describe("Pruning", () => {
  it("only recalculates until things are equal", () => {
    const s = new Signal.State(0);
    let n = 0;
    const c = new Signal.Computed(() => (n++, s.get()));
    let n2 = 0;
    const c2 = new Signal.Computed(() => (n2++, c.get(), 5));
    let n3 = 0;
    const c3 = new Signal.Computed(() => (n3++, c2.get()));

    expect(n).toBe(0);
    expect(n2).toBe(0);
    expect(n3).toBe(0);

    expect(c3.get()).toBe(5);
    expect(n).toBe(1);
    expect(n2).toBe(1);
    expect(n3).toBe(1);

    s.set(1);
    expect(n).toBe(1);
    expect(n2).toBe(1);
    expect(n3).toBe(1);

    expect(c3.get()).toBe(5);
    expect(n).toBe(2);
    expect(n2).toBe(2);
    expect(n3).toBe(1);
  });
  it("does similar pruning for live signals", () => {
    const s = new Signal.State(0);
    let n = 0;
    const c = new Signal.Computed(() => (n++, s.get()));
    let n2 = 0;
    const c2 = new Signal.Computed(() => (n2++, c.get(), 5));
    let n3 = 0;
    const c3 = new Signal.Computed(() => (n3++, c2.get()));
    const w = new Signal.subtle.Watcher(() => {});
    w.watch(c3);

    expect(n).toBe(0);
    expect(n2).toBe(0);
    expect(n3).toBe(0);

    expect(c3.get()).toBe(5);
    expect(n).toBe(1);
    expect(n2).toBe(1);
    expect(n3).toBe(1);

    s.set(1);
    expect(n).toBe(1);
    expect(n2).toBe(1);
    expect(n3).toBe(1);

    expect(w.getPending().length).toBe(1);

    expect(c3.get()).toBe(5);
    expect(n).toBe(2);
    expect(n2).toBe(2);
    expect(n3).toBe(1);

    expect(w.getPending().length).toBe(0);
  });
});

describe("Prohibited contexts", () => {
  it("allows writes during computed", () => {
    const s = new Signal.State(1);
    const c = new Signal.Computed(() => (s.set(s.get() + 1), s.get()));
    expect(c.get()).toBe(2);
    expect(s.get()).toBe(2);

    // Note: c is marked clean in this case, even though re-evaluating it
    // would cause it to change value (due to the set inside of it).
    expect(c.get()).toBe(2);
    expect(s.get()).toBe(2);

    s.set(3);

    expect(c.get()).toBe(4);
    expect(s.get()).toBe(4);
  });
  it("disallows reads and writes during watcher notify", () => {
    const s = new Signal.State(1);
    const w = new Signal.subtle.Watcher(() => {
      s.get();
    });
    w.watch(s);
    expect(() => s.set(2)).toThrow();
    w.unwatch(s);
    expect(() => s.set(3)).not.toThrow();

    const w2 = new Signal.subtle.Watcher(() => {
      s.set(4);
    });
    w2.watch(s);
    expect(() => s.set(5)).toThrow();
    w2.unwatch(s);
    expect(() => s.set(3)).not.toThrow();
  });
});

describe("Custom equality", () => {
  it("works for State", () => {
    let answer = true;
    const s = new Signal.State(1, {
      equals() {
        return answer;
      },
    });
    let n = 0;
    const c = new Signal.Computed(() => (n++, s.get()));

    expect(c.get()).toBe(1);
    expect(n).toBe(1);

    s.set(2);
    expect(s.get()).toBe(1);
    expect(c.get()).toBe(1);
    expect(n).toBe(1);

    answer = false;
    s.set(2);
    expect(s.get()).toBe(2);
    expect(c.get()).toBe(2);
    expect(n).toBe(2);

    s.set(2);
    expect(s.get()).toBe(2);
    expect(c.get()).toBe(2);
    expect(n).toBe(3);
  });
  it("works for Computed", () => {
    let answer = true;
    let value = 1;
    const u = new Signal.State(1);
    const s = new Signal.Computed(() => (u.get(), value), {
      equals() {
        return answer;
      },
    });
    let n = 0;
    const c = new Signal.Computed(() => (n++, s.get()));

    expect(c.get()).toBe(1);
    expect(n).toBe(1);

    u.set(2);
    value = 2;
    expect(s.get()).toBe(1);
    expect(c.get()).toBe(1);
    expect(n).toBe(1);

    answer = false;
    u.set(3);
    expect(s.get()).toBe(2);
    expect(c.get()).toBe(2);
    expect(n).toBe(2);

    u.set(4);
    expect(s.get()).toBe(2);
    expect(c.get()).toBe(2);
    expect(n).toBe(3);
  });
});

describe("Receivers", () => {
  it("is this for computed", () => {
    let receiver!: Signal.Computed<void>;
    const c: Signal.Computed<void> = new Signal.Computed(function (this: Signal.Computed<void>) {
      receiver = this;
    });
    expect(c.get()).toBe(undefined);
    expect(receiver).toBe(c);
  });
  it("is this for watched/unwatched", () => {
    let r1: Signal.State<number> | undefined, r2: Signal.State<number> | undefined;
    const s = new Signal.State<number>(1, {
      [Signal.subtle.watched]() {
        // TODO: Improve types to avoid this
        // @ts-expect-error
        r1 = this;
      },
      [Signal.subtle.unwatched]() {
        // TODO: Improve types to avoid this
        // @ts-expect-error
        r2 = this;
      },
    });
    expect(r1).toBe(undefined);
    expect(r2).toBe(undefined);
    const w = new Signal.subtle.Watcher(() => {});
    w.watch(s);
    expect(r1).toBe(s);
    expect(r2).toBe(undefined);
    w.unwatch(s);
    expect(r2).toBe(s);
  });
  it("is this for equals", () => {
    let receiver!: Signal.State<number> | Signal.Computed<number>;
    const options = {
      equals(this: Signal.State<number> | Signal.Computed<number>, t1: number, t2: number) {
        receiver = this;
        return false;
      },
    };
    const s: Signal.State<number> = new Signal.State<number>(1, options);
    s.set(2);
    expect(receiver).toBe(s);

    const c: Signal.Computed<number> = new Signal.Computed(() => s.get(), options);
    expect(c.get()).toBe(2);
    s.set(4);
    expect(c.get()).toBe(4);
    expect(receiver).toBe(c);
  });
});

describe("Dynamic dependencies", () => {
  function run(live: boolean) {
    const states = Array.from("abcdefgh").map((s) => new Signal.State(s));
    const sources = new Signal.State(states);
    const computed = new Signal.Computed(() => {
      let str = "";
      for (const state of sources.get()) str += state.get();
      return str;
    });
    if (live) {
      const w = new Signal.subtle.Watcher(() => {});
      w.watch(computed);
    }
    expect(computed.get()).toBe("abcdefgh");
    expect(Signal.subtle.introspectSources(computed).slice(1)).toEqual(
      states,
    );

    sources.set(states.slice(0, 5));
    expect(computed.get()).toBe("abcde");
    expect(Signal.subtle.introspectSources(computed).slice(1)).toEqual(
      states.slice(0, 5),
    );

    sources.set(states.slice(3));
    expect(computed.get()).toBe("defgh");
    expect(Signal.subtle.introspectSources(computed).slice(1)).toEqual(
      states.slice(3),
    );
  }
  it("works live", () => run(true));
  it("works not live", () => run(false));
});

describe("watch and unwatch", () => {
  it("handles multiple watchers well", () => {
    const s = new Signal.State(1);
    const s2 = new Signal.State(2);
    let n = 0;
    const w = new Signal.subtle.Watcher(() => n++);
    w.watch(s, s2);

    s.set(4);
    expect(n).toBe(1);
    expect(w.getPending()).toEqual([]);

    w.watch();
    s2.set(8);
    expect(n).toBe(2);

    w.unwatch(s);
    s.set(3);
    expect(n).toBe(2);

    w.watch();
    s2.set(3);
    expect(n).toBe(3);

    w.watch();
    s.set(2);
    expect(n).toBe(3);
  });
  it("understands dynamic dependency sets", () => {
    let w1 = 0,
      u1 = 0,
      w2 = 0,
      u2 = 0,
      n = 0,
      d = 0;
    let s1 = new Signal.State(1, {
      [Signal.subtle.watched]() {
        w1++;
      },
      [Signal.subtle.unwatched]() {
        u1++;
      },
    });
    let s2 = new Signal.State(2, {
      [Signal.subtle.watched]() {
        w2++;
      },
      [Signal.subtle.unwatched]() {
        u2++;
      },
    });
    let which: { get(): number } = s1;
    let c = new Signal.Computed(() => (d++, which.get()));
    let w = new Signal.subtle.Watcher(() => n++);

    w.watch(c);
    expect(w1 + w2 + u1 + u2 + n + d).toBe(0);
    expect(Signal.subtle.isWatched(s1)).toBe(false);
    expect(Signal.subtle.isWatched(s2)).toBe(false);
    expect(w.getPending()).toEqual([c]);

    expect(c.get()).toBe(1);
    expect(w1).toBe(1);
    expect(u1).toBe(0);
    expect(w2).toBe(0);
    expect(u2).toBe(0);
    expect(n).toBe(0);
    expect(Signal.subtle.isWatched(s1)).toBe(true);
    expect(Signal.subtle.isWatched(s2)).toBe(false);
    expect(w.getPending()).toEqual([]);
    expect(d).toBe(1);

    s1.set(3);
    expect(w1).toBe(1);
    expect(u1).toBe(0);
    expect(w2).toBe(0);
    expect(u2).toBe(0);
    expect(n).toBe(1);
    expect(Signal.subtle.isWatched(s1)).toBe(true);
    expect(Signal.subtle.isWatched(s2)).toBe(false);
    expect(w.getPending()).toEqual([c]);
    expect(d).toBe(1);

    expect(c.get()).toBe(3);
    expect(w1).toBe(1);
    expect(u1).toBe(0);
    expect(w2).toBe(0);
    expect(u2).toBe(0);
    expect(n).toBe(1);
    expect(Signal.subtle.isWatched(s1)).toBe(true);
    expect(Signal.subtle.isWatched(s2)).toBe(false);
    expect(w.getPending()).toEqual([]);
    expect(d).toBe(2);

    which = s2;
    w.watch();
    s1.set(4);
    expect(w1).toBe(1);
    expect(u1).toBe(0);
    expect(w2).toBe(0);
    expect(u2).toBe(0);
    expect(n).toBe(2);
    expect(Signal.subtle.isWatched(s1)).toBe(true);
    expect(Signal.subtle.isWatched(s2)).toBe(false);
    expect(w.getPending()).toEqual([c]);
    expect(d).toBe(2);

    expect(c.get()).toBe(2);
    expect(w1).toBe(1);
    expect(u1).toBe(1);
    expect(w2).toBe(1);
    expect(u2).toBe(0);
    expect(n).toBe(2);
    expect(Signal.subtle.isWatched(s1)).toBe(false);
    expect(Signal.subtle.isWatched(s2)).toBe(true);
    expect(w.getPending()).toEqual([]);
    expect(d).toBe(3);

    w.watch();
    which = {
      get() {
        return 10;
      },
    };
    s1.set(5);
    expect(c.get()).toBe(2);
    expect(w1).toBe(1);
    expect(u1).toBe(1);
    expect(w2).toBe(1);
    expect(u2).toBe(0);
    expect(n).toBe(2);
    expect(Signal.subtle.isWatched(s1)).toBe(false);
    expect(Signal.subtle.isWatched(s2)).toBe(true);
    expect(w.getPending()).toEqual([]);
    expect(d).toBe(3);

    w.watch();
    s2.set(0);
    expect(w1).toBe(1);
    expect(u1).toBe(1);
    expect(w2).toBe(1);
    expect(u2).toBe(0);
    expect(n).toBe(3);
    expect(Signal.subtle.isWatched(s1)).toBe(false);
    expect(Signal.subtle.isWatched(s2)).toBe(true);
    expect(w.getPending()).toEqual([c]);
    expect(d).toBe(3);

    expect(c.get()).toBe(10);
    expect(w1).toBe(1);
    expect(u1).toBe(1);
    expect(w2).toBe(1);
    expect(u2).toBe(1);
    expect(n).toBe(3);
    expect(Signal.subtle.isWatched(s1)).toBe(false);
    expect(Signal.subtle.isWatched(s2)).toBe(false);
    expect(w.getPending()).toEqual([]);
    expect(d).toBe(4);
  });
});

describe("type checks", () => {
  it("runs explicit checks", () => {
    let x = {};
    let s = new Signal.State(1);
    let c = new Signal.Computed(() => {});
    let w = new Signal.subtle.Watcher(() => {});

    expect(Signal.State.isState(x)).toBe(false);
    expect(Signal.State.isState(s)).toBe(true);
    expect(Signal.State.isState(c)).toBe(false);
    expect(Signal.State.isState(w)).toBe(false);

    expect(Signal.Computed.isComputed(x)).toBe(false);
    expect(Signal.Computed.isComputed(s)).toBe(false);
    expect(Signal.Computed.isComputed(c)).toBe(true);
    expect(Signal.Computed.isComputed(w)).toBe(false);

    expect(Signal.subtle.Watcher.isWatcher(x)).toBe(false);
    expect(Signal.subtle.Watcher.isWatcher(s)).toBe(false);
    expect(Signal.subtle.Watcher.isWatcher(c)).toBe(false);
    expect(Signal.subtle.Watcher.isWatcher(w)).toBe(true);
  });

  it("checks types in methods", () => {
    let x = {};
    let s = new Signal.State(1);
    let c = new Signal.Computed(() => {});
    let w = new Signal.subtle.Watcher(() => {});

    expect(() => Signal.State.prototype.get.call(x)).toThrowError(TypeError);
    expect(Signal.State.prototype.get.call(s)).toBe(1);
    expect(() => Signal.State.prototype.get.call(c)).toThrowError(TypeError);
    expect(() => Signal.State.prototype.get.call(w)).toThrowError(TypeError);

    expect(() => Signal.State.prototype.set.call(x, 2)).toThrowError(TypeError);
    expect(Signal.State.prototype.set.call(s, 2)).toBe(undefined);
    expect(() => Signal.State.prototype.set.call(c, 2)).toThrowError(TypeError);
    expect(() => Signal.State.prototype.set.call(w, 2)).toThrowError(TypeError);

    expect(() => Signal.Computed.prototype.get.call(x)).toThrowError(TypeError);
    expect(() => Signal.Computed.prototype.get.call(s)).toThrowError(TypeError);
    expect(Signal.Computed.prototype.get.call(c)).toBe(undefined);
    expect(() => Signal.Computed.prototype.get.call(w)).toThrowError(TypeError);

    expect(() => Signal.subtle.Watcher.prototype.watch.call(x, s)).toThrowError(
      TypeError,
    );
    expect(() => Signal.subtle.Watcher.prototype.watch.call(s, s)).toThrowError(
      TypeError,
    );
    expect(() => Signal.subtle.Watcher.prototype.watch.call(c, s)).toThrowError(
      TypeError,
    );
    expect(Signal.subtle.Watcher.prototype.watch.call(w, s)).toBe(undefined);
    // @ts-expect-error
    expect(() => Signal.subtle.Watcher.prototype.watch.call(w, w)).toThrowError(
      TypeError,
    );

    expect(() =>
      Signal.subtle.Watcher.prototype.unwatch.call(x, s),
    ).toThrowError(TypeError);
    expect(() =>
      Signal.subtle.Watcher.prototype.unwatch.call(s, s),
    ).toThrowError(TypeError);
    expect(() =>
      Signal.subtle.Watcher.prototype.unwatch.call(c, s),
    ).toThrowError(TypeError);
    expect(Signal.subtle.Watcher.prototype.unwatch.call(w, s)).toBe(undefined);
    expect(() =>
      // @ts-expect-error
      Signal.subtle.Watcher.prototype.unwatch.call(w, w),
    ).toThrowError(TypeError);

    expect(() =>
      // @ts-expect-error
      Signal.subtle.Watcher.prototype.getPending.call(x, s),
    ).toThrowError(TypeError);
    expect(() =>
      // @ts-expect-error
      Signal.subtle.Watcher.prototype.getPending.call(s, s),
    ).toThrowError(TypeError);
    expect(() =>
      // @ts-expect-error
      Signal.subtle.Watcher.prototype.getPending.call(c, s),
    ).toThrowError(TypeError);
    // @ts-expect-error
    expect(Signal.subtle.Watcher.prototype.getPending.call(w, s)).toEqual(
      [],
    );

    // @ts-expect-error
    expect(() => Signal.subtle.introspectSources(x)).toThrowError(TypeError);
    // @ts-expect-error
    expect(() => Signal.subtle.introspectSources(s)).toThrowError(TypeError);
    expect(Signal.subtle.introspectSources(c)).toEqual([]);
    expect(Signal.subtle.introspectSources(w)).toEqual([]);

    // @ts-expect-error
    expect(() => Signal.subtle.isWatched(x)).toThrowError(TypeError);
    expect(Signal.subtle.isWatched(s)).toBe(false);
    expect(Signal.subtle.isWatched(c)).toBe(false);
    // @ts-expect-error
    expect(() => Signal.subtle.isWatched(w)).toThrowError(TypeError);

    // @ts-expect-error
    expect(() => Signal.subtle.introspectSinks(x)).toThrowError(TypeError);
    expect(Signal.subtle.introspectSinks(s)).toEqual([]);
    expect(Signal.subtle.introspectSinks(c)).toEqual([]);
    // @ts-expect-error
    expect(() => Signal.subtle.introspectSinks(w)).toThrowError(TypeError);
  });
});

describe("currentComputed", () => {
  it("works", () => {
    expect(Signal.subtle.currentComputed()).toBe(undefined);
    let context;
    let c = new Signal.Computed(
      () => (context = Signal.subtle.currentComputed()),
    );
    c.get();
    // @ts-expect-error
    expect(c).toBe(context);
  });
});

// Some things which we're comfortable with not hitting in code coverage:
// - The code for the callbacks (for reading signals and running watches)
// - Paths around writes being prohibited during computed/effect
// - Setters for various hooks
// - ngDevMode
// - Some predicates/getters for convenience, e.g., isReactive