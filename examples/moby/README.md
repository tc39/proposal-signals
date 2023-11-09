
# MobY

MobX inspired mobx Signal implementation

## Differences with MobX

* Nested effects are supported, including cleanup example, based on Dominic's work in exasmple-a
* Unlike MobX, effects are scheduled async

## Differences with spec?

* Effects do not return a value
    * Could be, chose not to, to not conflate semantic clarity with Computeds. E.g. effect.get() is not a tracked value
* Effect lifecycle
    * Dirty notification is sync, but not interceptable (could be)
    * Then scheduled is on onInvalidate, which should call `hasDepsChanged`, and at some point in time `track`
    * This allows to establish different moments in which deps are checked and the tracking is run.
        * For example, for `effect` we want to run `track` asap, when deps have changed, and no further schedulig is required
        * For react integration, if deps have changed (for sure), we want to notify React, but only track as part of the next as part of Reacts component lifecycle, rather than as part of the effect lifecycle.
        * `hasDepsChanged` (deps have surely changed) as a distinction between `notify` (maybe deps have changed), to not force computed values to be evaluated too early
