import { expect, test } from "vitest";
import * as Signal from "./signals";

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

test("effect signal can be read from", () => {
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

test("effect signal can notify changes", () => {
  let is_dirty = false;

  const a = new Signal.State(0);
  const b = new Signal.Computed(() => a.get() * 0);
  const c = new Signal.Effect(() => b.get());

  c.start(() => (is_dirty = true));

  c.get();

  a.set(1);

  c.stop();

  expect(is_dirty).toBe(true);

  is_dirty = false;

  a.set(1);

  // State hasn't changed
  expect(is_dirty).toBe(false);

  a.set(2);

  // Computed hasn't changed
  expect(is_dirty).toBe(false);
});

test("effect signals can be nested", () => {
  let log: string[] = [];

  const a = new Signal.State(0);
  const b = new Signal.Effect(() => {
    log.push("b update " + a.get());
    const c = new Signal.Effect(() => {
      log.push("c create " + a.get());
    });
    c.oncleanup = () => {
      log.push("c cleanup " + a.get());
    };
    c.get();
  });
  b.oncleanup = () => {
    log.push("b cleanup " + a.get());
  };

  b.start(() => {});

  b.get();

  a.set(1);

  b.get();

  a.set(2);

  b.stop();

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

test("effect signal should trigger oncleanup and correctly disconnect from graph", () => {
  let cleanups: string[] = [];

  const a = new Signal.State(0);
  const b = new Signal.Computed(() => a.get() * 0);
  const c = new Signal.Effect(() => b.get());

  c.start(() => {});
  b.oncleanup = () => {
    cleanups.push("b");
  };
  c.oncleanup = () => {
    cleanups.push("c");
  };

  expect(cleanups).toEqual([]);

  c.get();

  expect(a.consumers?.size).toBe(1);
  expect(b.consumers?.size).toBe(1);
  expect(cleanups).toEqual([]);

  cleanups = [];

  c.stop();

  expect(a.consumers?.size).toBe(0);
  expect(b.consumers?.size).toBe(0);
  expect(cleanups).toEqual(["b", "c"]);
});

test("effect signal should propogate correctly with computed signals", () => {
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

  const a = new Signal.Effect(() => {
    log.push("four");
    log.push(
      `${count.get()}:${double.get()}:${triple.get()}:${quintuple.get()}`
    );
  });
  a.start(queueEffect);
  a.get();
  const b = new Signal.Effect(() => {
    log.push("three");
    log.push(`${double.get()}:${triple.get()}:${quintuple.get()}`);
  });
  b.start(queueEffect);
  b.get();
  const c = new Signal.Effect(() => {
    log.push("two");
    log.push(`${count.get()}:${double.get()}`);
  });
  c.start(queueEffect);
  c.get();
  const d = new Signal.Effect(() => {
    log.push("one");
    log.push(`${double.get()}`);
  });
  d.start(queueEffect);
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

  count.set(1)
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

  a.stop();
  b.stop();
  c.stop();
  d.stop();
});

test("effect signal should notify only once", () => {
  let log: string[] = [];

  const a = new Signal.State(0);
  const b = new Signal.Computed(() => a.get() * 2);
  const c = new Signal.Effect(() => {
    a.get();
    b.get();
    log.push("effect ran");
  });

  c.start(() => {
    log.push("notified");
  });

  expect(log).toEqual([]);

  c.get();

  expect(log).toEqual(["effect ran"]);

  a.set(1);
  c.get();

  expect(log).toEqual(["effect ran", "notified", "effect ran"]);

  c.stop();
});

test("https://perf.js.hyoo.ru/#!bench=9h2as6_u0mfnn", () => {
  let res: number[] = [];
  let effects: Signal.Effect<any>[] = [];

  const queueEffect = (signal) => {
    effects.push(signal);
  };

  const flush = () => {
    effects.forEach((e) => e.get());
    effects = [];
  };

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
  let H = new Signal.Effect(() => {
    res.push(hard(G.get(), "H"));
  });
  let I = new Signal.Effect(() => {
    res.push(G.get());
  });
  let J = new Signal.Effect(() => {
    res.push(hard(F.get(), "J"));
  });

  H.start(queueEffect);
  I.start(queueEffect);
  J.start(queueEffect);

  H.get();
  I.get();
  J.get();

  let i = 2;
  while (--i) {
    res.length = 0;
    B.set(1);
    A.set(1 + i * 2);
    flush();

    A.set(2 + i * 2);
    B.set(2);
    flush();

    expect(res.length).toBe(4);
    expect(res).toEqual([3198, 1601, 3195, 1598]);
  }

  H.stop();
  I.stop();
  J.stop();
});
