
# MobY

MobX inspired mobx Signal implementation

## Differences with MobX

* Nested effects are supported, including cleanup example, based on Dominic's work in exasmple-a
* Unlike MobX, effects are scheduled async

## Differences with spec?

* Effects do not return a value (could be, although conflates conceptual clarity with computeds? Maybe not.)
* Effect lifecycle
    * Dirty notification is sync, but not interceptable (could be)
