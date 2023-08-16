# Signals

## Motivation

Web Developers and UI Engineers continue to push the limits of browser-based experiences. Over the last decade in particular, the size and complexity of stateful web clients has grown considerably, surfacing new challenges for even the most experienced engineering teams. Among these challenges is the need to store, compute, invalidate, sync, and push state to the application's view layer in an efficient way. To further complicate matters, the typical UI involves more than just managing simple values, but often involves rendering computed state which is dependent on a complex tree of other values or state that is also computed itself.

Let's take a look at a small-scale example that will help us see a few of the challenges.

#### Example - A VanillaJS Counter

Given a variable, `counter`, you want to render into the DOM whether the counter is even or odd. Whenever the `counter` changes, you want to update the DOM with the latest parity. In Vanilla JS, you might have something like this:

```js
let counter = 0;
const getCounter = () => counter;
const setCounter = (value) => {
  counter = value;
  render();
};

const isEven = () => (getCounter() & 1) == 0;
const parity = () => isEven() ? "even" : "odd";
const render = () => element.innerText = parity();

// Simulate external updates to counter...
setInterval(() => setCounter(getCounter() + 1), 1000);
```

This has a number of problems...

* The `counter` setup is noisy and boilerplate-heavy.
* The `counter` state is tightly coupled to the rendering system.
* There is a transitive circular reference between `setCounter()` and `render()`.
* If the `counter` changes but `parity` does not (e.g. counter goes from 2 to 4), then we do unnecessary computation of the parity and unnecessary rendering.
* What if another part of our UI just wants to render when the `counter` updates?
* What if another part of our UI is dependent on `isEven` or `parity` alone?

Even in this relatively simple scenario, a number of issues arise quickly. We could try to work around these by introducing pub/sub for the `counter`. This would make the following improvements:

* Rendering would now be decoupled from the `counter` and the circular reference would be gone.
* Additional consumers of the `counter` could subscribe to add their own reactions to state changes.

However, we're still stuck with the following problems:

* The render function, which is only dependent on `parity` must instead "know" that it actually needs to subscribe to `counter`.
* It isn't possible to update UI based on either `isEven` or `parity` alone, without directly interacting with `counter`.
* We've increased our boilerplate.

Now, we could solve a couple issues by adding pub/sub not just to `counter` but also to `isEven` and `parity`. We would then have to subscribe `isEven` to `counter`,  `parity` to `isEven`, and `render` to `parity`. Unfortunately, not only has our boilerplate code exploded, but we're stuck with a ton of bookeeping of subscriptions, and a potential memory leak disaster if we don't properly clean everything up in the right way. So, we've solved some issues but created a whole new category of problems and a lot of code. To make matters worse, we have to go through this entire process for every piece of state in our system.

### Introducing Signals

To address these challenges, innovative members of our web community have explored various primitives and state management approaches over the years. One particular primitive seems to have persisted over the long haul: *signal*.

The *signal* primitive has gone by many names, but seems to have made its first popular appearance on the Web with [Knockout](https://knockoutjs.com/) [in 2010](https://blog.stevensanderson.com/2010/07/05/introducing-knockout-a-ui-library-for-javascript/). In the years since, many variations and implementations have been created. Within the last 3-4 years, the signal primitive and related approaches have gained further traction, with nearly every modern JavaScript library or framework having something similar, under one name or another.

To understand signals, let's take a look at the above example, re-imagined with a _**ficticious**_ signal library.

#### Example - A Signals Counter

```js
const [counter, setCounter] = Signal.cell(0);
const isEven = Signal.computed(() => (counter.value & 1) == 0);
const parity = Signal.computed(() => isEven.value ? "even" : "odd");

Signal.effect(() => element.innerText = parity.value, { scheduler: rAFBatcher });

// Simulate external updates to counter...
setInterval(() => setCounter(counter.value + 1), 1000);
```

There are a few things we can see right away:
* We've eliminated the noisy boilerplate around the `counter` variable from our previous example.
* There is a unified API gateway to handle values, computations, and side effects.
* There's no circular reference problem or upside down dependencies between `counter` and `render`.
* There are no manual subscriptions, nor is there any need for bookkeeping.
* There is a means of controlling side-effect timing/scheduling.

Signals give us much more than what can be seen on the surface of the API though:

* **Automatic Dependency Tracking** - A computed signal automatically discovers any other signals that it is dependent on, whether those signals be simple values or other computations.
* **Lazy Evaluation** - Computations are not eagerly evaluated when they are declared, nor are they immediately evaluated when their dependencies change. They are only evaluated when their value is explicity requested.
* **Memoization** - Computed signals cache their last value so that computations that don't have changes in their dependencies do not need to be re-evalulated, no matter how many times they are called.

### Potential Opportunities

In the 13 years since Knockout, the Web community has explored signals in a variety of contexts, and has learned much. The pattern, while not ubiquitous, is more common than not in modern Web codebases. As a result of it prevalence and its benefits, we would like to explore adding a new *signal* primitive to JavaScript.

With a platform primitive, not only is there an out-of-the-box mechanism to help with the overwhelimingly common scnenarios describe above, but it may be possible to make a number of technical improvements as well.

Below are a few thoughts on the potential benefits of signals as a built-in.

#### Interoperability

Models, components, and libraries built with one signal implementation don't work well with those built with another, nor do they work with view engines or component systems which typically only recognize their own primitives. This makes it impossible to build shareable reactive models and libraries within the community or even within companies. Furthermore, due to the typical strong coupling between a view engine and its reactivity implementation, developers cannot easily migrate to new rendering technologies without also completely re-writing their non-UI code to a new reactivity system. With a platform built-in, a large amount of code could be made interoperable and significantly more portable.

#### Performance/Memory usage

We hope that some JS engines may implement the various operations of graph construction and traversal more efficiently, by eliminating certain overhead related to code loading and the generality of JS data structures. However, no algorithmic changes are anticipated vs. what would be present in a polyfill; engines are not expected to be magic here, and the reactivity algorithms will be well-defined and unambiguous.

#### Asynchrony

Modern applications are highly asynchronous. Current implementations of signals in userland aren't always able to account for this at all or in a performant way in their computed state tracking. We think there's an opportunity to explore integrating a native signal with the upcoming `AsyncContext` infrastructure. This could not only improve ergonomics, but empower the average developer to succeed at more complex problems without falling into the traps of asynchrony.

#### HTML/DOM Integration

Current work in W3C and by browser implementors is seeking to bring native templating to HTML. Additionally, the W3C Web Components CG is exploring the possibility of extending Web Components to offer a fully declarative HTML API. To accomplish both of these goals, eventually a reactive primitive will be needed by HTML. Additionally, many ergonomic improvements to the DOM through integration of signals can be imagined and have been asked for by the community.

While W3C could invent its own primitive for all of this, it would be better to build on a general JavaScript platform primitive. This would enable use outside of the DOM and by non-Web Component libraries and frameworks, avoiding the undesirable reality of two divergent, non-interoperable APIs for the same thing.

#### Tooling

While beyond the scope of TC39 work, the opportunity for consistent tooling is still important to consider. As Web applications have grown, the libraries and frameworks that enabled this growth have often had the need to build custom tools to help their developers understand what is happening in their applications at runtime. Today, custom tools need to be built for every framework or reactivity library. With a platform primitive, particularly one designed for debug support, the community or browser vendors could build universal tooling for such common tasks as debugging and performance analysis. The existing tools such as the element inspector, performance snapshot, and memory profilers could also be updated to specifically highlight signals in their data presentation.

## Use cases

*TODO: Some additional scenarios using signals, with both code and description. We need exmaples that are more comlex than the counter example above.*

## Comparison

*TODO: A comparison across various libraries. This should include both signal and non-signal approaches.*

## FAQ

*TODO: Frequently asked questions, or questions you think might be asked. Issues on the issue tracker or questions from past reviews can be a good source for these.*
