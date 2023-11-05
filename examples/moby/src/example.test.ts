import { expect, test } from "vitest";
import {Signal, effect} from "./signals";

const nextTick = () => Promise.resolve();

test("state signal can be written and read from", () => {
  const a = new Signal.State(0);

  expect(a.get()).toBe(0);

  a.set(1);

  expect(a.get()).toBe(1);
});

test("computed signal can be read from", () => {
  const a = new Signal.State(0);
  const b = new Signal.Computed(() => a.get() * 2);

  expect(a.get()).toBe(0);
  expect(b.get()).toBe(0);

  a.set(1);

  expect(a.get()).toBe(1);
  expect(b.get()).toBe(2);
});

test.skip("effect signal can be read from", () => {
  const a = new Signal.State(0);
  const b = new Signal.Computed(() => a.get() * 2);
  const c = new Signal.Effect(() => b.get());

  expect(a.get()).toBe(0);
  expect(b.get()).toBe(0);
  expect(c.get()).toBe(0);

  a.set(1);

  expect(a.get()).toBe(1);
  expect(b.get()).toBe(2);
  expect(c.get()).toBe(2);
});

test("effect signal can notify changes", async () => {
  let is_dirty = false;

  const a = new Signal.State(0);
  const b = new Signal.Computed(() => a.get() * 0);

  // TODO: different from example-a!
  let value;
  let started = false;
  const c =  new Signal.Effect(function () {
    if (!started) {
      started = true;
      this.track(() => {
        value = b.get()
      })
    } else {
      is_dirty = true;
    }
  });

  expect(value).toBe(0);

  a.set(1);

  c[Symbol.dispose]();

  await nextTick();

  expect(is_dirty).toBe(true);

  is_dirty = false;

  a.set(1);

  await nextTick();

  // State hasn't changed
  expect(is_dirty).toBe(false);

  a.set(2);

  // Computed hasn't changed
  expect(is_dirty).toBe(false);
});

test.skip("example framework effect signals can be nested", async () => {
  let log: string[] = [];

  const a = new Signal.State(0);
  const b = effect(
    () => {
      log.push("b update " + a.get());
      const c = effect(
        () => {
          log.push("c create " + a.get());

          return () => {
            log.push("c cleanup " + a.get());
          };
        },
      );
      // c.get();

      return () => {
        log.push("b cleanup " + a.get());
      };
    },
  );

  // b.get();

  a.set(1);
  await nextTick();
  // b.get();

  a.set(2);

  await nextTick();

  b[Symbol.dispose]();

  expect(log).toEqual([
    "b update 0",
    "c create 0",
    "c cleanup 1",
    "b cleanup 1",
    "b update 1",
    "c create 1",
    "c cleanup 2",
    "b cleanup 2",
  ]);
});

test.skip("effect signal should trigger oncleanup and correctly disconnect from graph", () => {
  let cleanups: string[] = [];

  const a = new Signal.State(0);
  const b = new Signal.Computed(() => a.get() * 0);
  const c = new Signal.Effect(() => b.get(), {
    notify: () => {},
  });

  c.cleanup = () => {
    cleanups.push("c");
  };

  expect(cleanups).toEqual([]);

  c.get();

  expect(a.sinks?.length).toBe(1);
  expect(b.sinks?.length).toBe(1);
  expect(cleanups).toEqual([]);

  cleanups = [];

  c[Symbol.dispose]();

  expect(a.sinks).toBe(null);
  expect(b.sinks).toBe(null);
  expect(cleanups).toEqual(["c"]);
});

test.skip("effect signal should propogate correctly with computed signals", () => {
  let log: string[] = [];
  let effects: Signal.Effect<any>[] = [];

  const queueEffect = (signal) => {
    effects.push(signal);
  };

  const flush = () => {
    effects.forEach((e) => e.get());
    effects = [];
  };

  const count = new Signal.State(0);
  const double = new Signal.Computed(() => count.get() * 2);
  const triple = new Signal.Computed(() => count.get() * 3);
  const quintuple = new Signal.Computed(() => double.get() + triple.get());

  const a = new Signal.Effect(
    () => {
      log.push("four");
      log.push(
        `${count.get()}:${double.get()}:${triple.get()}:${quintuple.get()}`
      );
    },
    {
      notify: queueEffect,
    }
  );
  a.get();
  const b = new Signal.Effect(
    () => {
      log.push("three");
      log.push(`${double.get()}:${triple.get()}:${quintuple.get()}`);
    },
    {
      notify: queueEffect,
    }
  );
  b.get();
  const c = new Signal.Effect(
    () => {
      log.push("two");
      log.push(`${count.get()}:${double.get()}`);
    },
    {
      notify: queueEffect,
    }
  );
  c.get();
  const d = new Signal.Effect(
    () => {
      log.push("one");
      log.push(`${double.get()}`);
    },
    {
      notify: queueEffect,
    }
  );
  d.get();

  expect(log).toEqual([
    "four",
    "0:0:0:0",
    "three",
    "0:0:0",
    "two",
    "0:0",
    "one",
    "0",
  ]);

  log = [];

  count.set(1);
  flush();

  expect(log).toEqual([
    "four",
    "1:2:3:5",
    "three",
    "2:3:5",
    "two",
    "1:2",
    "one",
    "2",
  ]);

  a[Symbol.dispose]();
  b[Symbol.dispose]();
  c[Symbol.dispose]();
  d[Symbol.dispose]();
});

test.skip("effect signal should notify only once", () => {
  let log: string[] = [];

  const a = new Signal.State(0);
  const b = new Signal.Computed(() => a.get() * 2);
  const c = new Signal.Effect(
    () => {
      a.get();
      b.get();
      log.push("effect ran");
    },
    {
      notify: () => {
        log.push("notified");
      },
    }
  );

  expect(log).toEqual([]);

  c.get();

  expect(log).toEqual(["effect ran"]);

  a.set(1);
  c.get();

  expect(log).toEqual(["effect ran", "notified", "effect ran"]);

  c[Symbol.dispose]();
});

test("https://perf.js.hyoo.ru/#!bench=9h2as6_u0mfnn", async () => {
  let res: number[] = [];

  const numbers = Array.from({ length: 2 }, (_, i) => i);
  const fib = (n: number): number => (n < 2 ? 1 : fib(n - 1) + fib(n - 2));
  const hard = (n: number, l: string) => n + fib(16);

  const A = new Signal.State(0);
  const B = new Signal.State(0);
  const C = new Signal.Computed(() => (A.get() % 2) + (B.get() % 2));
  const D = new Signal.Computed(
    () => numbers.map((i) => i + (A.get() % 2) - (B.get() % 2)),
    { equals: (l, r) => l.length === r.length && l.every((v, i) => v === r[i]) }
  );
  const E = new Signal.Computed(() =>
    hard(C.get() + A.get() + D.get()[0]!, "E")
  );
  const F = new Signal.Computed(() => hard(D.get()[0]! && B.get(), "F"));
  const G = new Signal.Computed(
    () => C.get() + (C.get() || E.get() % 2) + D.get()[0]! + F.get()
  );
  let H = effect(
    () => {
      res.push(hard(G.get(), "H"));
    },
  );
  let I = effect(
    () => {
      res.push(G.get());
    },

  );
  let J = effect(
    () => {
      res.push(hard(F.get(), "J"));
    },

  );

  // H.get();
  // I.get();
  // J.get();

  let i = 2;
  while (--i) {
    res.length = 0;
    B.set(1);
    A.set(1 + i * 2);
    await nextTick();

    A.set(2 + i * 2);
    B.set(2);
    await nextTick();

    expect(res.length).toBe(4);
    expect(res).toEqual([3198, 1601, 3195, 1598]);
  }

  H[Symbol.dispose]();
  I[Symbol.dispose]();
  J[Symbol.dispose]();
});
