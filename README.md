# Signals

## Status

* **Champion(s):** TBD
* **Author(s):** Rob Eisenberg
* **Stage**: 0

## Motivation

Web Developers and UI Engineers continue to push the limits of browser-based experiences. Over the last decade in particular, the size and complexity of stateful web clients has grown considerably, surfacing new challenges for even the most experienced engineering teams. Among these challenges is the need to store, compute, invalidate, sync, and push state to the application's view layer in an efficient way. To further complicate matters, the typical UI involves more than just managing simple values, but often involves rendering computed state which is dependent on a complex tree of other values or state that is also computed itself.

To address these challenges, innovative members of our web community have explored various primitives and state management approaches over the years. One particular primitive seems to have persisted over the long haul: *signal*.

The *signal* primitive has gone by many names, but seems to have made its first popular appearance on the Web with [Knockout](https://knockoutjs.com/) [in 2010](https://blog.stevensanderson.com/2010/07/05/introducing-knockout-a-ui-library-for-javascript/). In the years since, many variations and implementations have been created. Within the last 3-4 years, the signal primitive and related approaches has gained further traction, with nearly every modern JavaScript library or framework having something similar, under one name or another.

Through this decade plus exploration of signals in web development, our community has learned much. But we have reached a point where our userland libraries cannot go much further. To enable us to deliver the solutions we need, we propose adding a new *signal* primitive to JavaScript.

### Current Challenges and Opportunities

With a platform primitive, several long-standing issues could be solved:

#### Interoperability

Models, components, and libraries built with one signal implementation don't work well with those built with another, nor do they work with view engines or component systems which typically only recognize their own primitives. This makes it impossible to build shareable reactive models and libraries within the community or even within companies. Furthermore, due to the typical strong coupling between a view engine and its reactivity implementation, developers cannot easily migrate to new rendering technologies without also completely re-writing their non-UI code to a new reactivity system.

#### Memory Efficiency

UI scenarios present a number of memory-related challenges for reactivity implementations: 

  * Memory pressure during application startup can be greatly increased, typically the result of creating many signals during creation of the iniutial UI. Library authors try to offset this by using various techniques including, pre-allocating arrays, sharing objects, and using custom data structures that avoid `Array#push` operations. But a native implementation could handle this much more efficiently.
  * The possibility of memory leaks caused by reference and lifetime complexities within the dependency graph is a real challenge. While the memory leak issues can be solved through explicit teardown or internal use of weak refs/maps, these solutions tend to have a negative impact on performance. However, a native implementation that integrates with the GC may be able to address this.

#### Performance

Signals affect many aspects of performance:

  * The amount of code required to implement a fully-featured signal library that handles all edge cases is non-trivial. Having a built-in would reduce both bundle size and JS parse time, critical to the initial render performance of a page.
  * At startup, an application typically needs to create many signals at once in order to render the initial view. Native implementations could dramitcally improve the efficiency of creation over JS implementations.
  * Signals need to efficiently traverse their dependency graph to invalidate portions of the graph when dependencies change. A native implementation of the algorithm could improve paint/update performance in real world scenarios.

#### Asynchrony

Modern applications are highly asynchronous. Current implementations of signals in userland aren't always able to account for this at all or in a performant way in their computed state tracking. By integrating a native signal implementation with the upcoming `AsyncContext` infrastructure, it may be possible to enable a more efficient and ergonomic solution.

#### HTML/DOM Integration

Current work in W3C and by browser implementors is seeking to bring native templating to HTML. Additionally, the W3C Web Components CG is exploring the possibility of extending Web Components to offer a fully declarative HTML API. To accomplish both of these goals, eventually a reactive primitive will be needed by HTML. Additionally, many ergonomic improvements to the DOM through integration of signals can be imagined and have been asked for by the community.

While W3C could invent its own primitive for all of this, it would be better to build on a general JavaScript platform primitive. This would enable use outside of the DOM and by non-Web Component libraries and frameworks, avoiding the undesirable reality of two divergent, non-interoperable APIs for the same thing.

#### Tooling

While beyond the scope of TC39 work, the opportunity for consistent tooling is still important to consider. As Web applications have grown, the libraries and frameworks that enabled this growth have often had the need to build custom tools to help their developers understand what is happening in their applications at runtime. Today, custom tools need to be built for every framework or reactivity library. With a platform primitive, particularly one designed for debug support, the community or browser vendors could build universal tooling for such common tasks as debugging and performance analysis. The existing tools such as the element inspector, performance snapshot, and memory profilers could also be updated to specifically highlight signals in their data presentation.

## Use cases

*Some realistic scenarios using the feature, with both code and description of the problem; more than one can be helpful.*

## Description

*Developer-friendly documentation for how to use the feature.*

## Comparison

*A comparison across various related programming languages and/or libraries. If this is the first sort of language or library to do this thing, explain why that is the case. If this is a standard library feature, a comparison across the JavaScript ecosystem would be good; if it's a syntax feature, that might not be practical, and comparisons may be limited to other programming languages.*

## Implementations

### Polyfill/transpiler implementations

*A JavaScript implementation of the proposal, ideally packaged in a way that enables easy, realistic experimentation. See [implement.md](https://github.com/tc39/how-we-work/blob/master/implement.md) for details on creating useful prototype implementations.*

### Native implementations

*For Stage 3+ proposals, and occasionally earlier, it is helpful to link to the implementation status of full, end-to-end JavaScript engines. Filing these issues before Stage 3 is somewhat unnecessary, though, as it's not very actionable.*

## FAQ

*Frequently asked questions, or questions you think might be asked. Issues on the issue tracker or questions from past reviews can be a good source for these.*
