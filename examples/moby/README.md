
# MobY

MobX inspired mobx Signal implementation

## Differences with MobX

* Nested effects are supported, including cleanup example, based on Dominic's work in exasmple-a
* Unlike MobX, effects are scheduled async

## Differences with spec?

* Effects do not return a value
    * Could be, chose not to, to not conflate semantic clarity with Computeds. E.g. effect.get() is not a tracked value
    * A run can be forced by calling `.run()`
* Effect lifecycle
    * `notify()` is called sync
    * `notify()` should at some point result in `.run()` call.
    * However, effect execution and dirty checking can be separated, by calling `isDirty()` earlier than `run()`.
    * This allows to establish different moments in which deps are checked and the tracking is run.
        * For example, for a normal `effect` we want to run `run` asap, when deps have changed, and no further schedulig is required
        * For react integration, if deps have changed (for sure), we want to notify React, but only track as part of the next as part of Reacts component lifecycle, rather than as part of the effect lifecycle. In React, we want to trigger a `isDirty()` check on the next tick from `notify`. However, if `dirty`, we don't want to run the effect immediately, but rather schedule a React render, which then in turn invokes `run
        * `isDirty` (deps have surely changed) as a distinction between `notify` (maybe deps have changed), to not force computed values to be evaluated too early
