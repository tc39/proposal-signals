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
