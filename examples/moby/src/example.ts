import {Signal, effect} from "./signals";

// Setup UI

const container = document.createElement("div");
const element = document.createElement("div");
const button = document.createElement("button");
button.innerText = "Increment number";
container.appendChild(element);
container.appendChild(button);
document.body.appendChild(container);

// Example taken from README.md

const counter = new Signal.State(0);
const isEven = new Signal.Computed(() => (counter.get() & 1) == 0);
const parity = new Signal.Computed(() => (isEven.get() ? "even" : "odd"));

effect(() => {
  element.innerText = `Counter: ${counter.get()}\nParity: ${parity.get()}`;
});

effect(() => {
  Signal.unsafe.untrack(() => {
    counter.set(counter.get() + 1);
  });
});

// Expanded example showing how effects work

effect(() => {
  console.log("update main effect", counter.get());

  // Nested effects
  effect(() => {
    console.log("create nested effect");

    return () => {
      console.log("cleanup nested effect");
    };
  });

  return () => {
    console.log("cleanup main effect");
  };
});

button.addEventListener("click", () => {
  counter.set(counter.get() + 1);
});
