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
