# Signals

## Status

* **Champion(s):** TBD
* **Author(s):** Rob Eisenberg
* **Stage**: 0

## Motivation

Web Developers and UI Engineers continue to push the limits of browser-based experiences. Over the last decade in particular, the size and complexity of stateful web clients has grown considerably, surfacing new challenges for even the most experienced engineering teams. Among these challenges is the need to store, compute, invalidate, sync, and push state to the application's view layer in an efficient way. To further complicate matters, the typical UI involves more than just managing simple values, but often involves rendering computed state which is dependent on a complex dependency tree of other values or computed state.

To address these challenges, innovative members of our web community have explored various primitives and state management approaches over the years. One particular primitive seems to have persisted over the longhaul: *signal*.

The *signal* primitive has gone by many names, but seems to have made its first popular appearance on the Web with Knockout, ca. 2010. In the years since, many variations and implementations have been created. Within the last three years, the signal primitive and related approaches has gained further traction, with nearly every modern JavaScript library or framework having something similar, under one name or another.

Through this decade plus exploration of signals in web development, our community has learned much. But we have reached a point where userland libraries cannot enable us to deliver the high-performance, memory-efficient, and interoperable solutions we need. As a result, we propose adding a new *signal* primitive to the JavaScript language.

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
