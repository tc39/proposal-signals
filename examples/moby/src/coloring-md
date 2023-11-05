# moby


## Batching strategies

### (1) Color & compute early, schedule (push / push)

Do a topological sort in which computed are updated in order and synchronously, and reactions are scheduled if any of their deps have truly changed.

1. propagate dirty state
2. propagate changed state, computeds inmediately run in this phase and recursively pass on (un)changed state
3. if a reaction received a changed state, it'll schedule and run

Considerations:

1. (+) reactions are only scheduled if some dep actually changed
1. (+) reactions can run sync
1. (-) After every signal mutation, the full computation graph is recomputed, without explicit batch API is perf kill

### (2) Color, compute in microtask, schedule (push / push async)

Do a topological sort, and in a microtask computeds are updated in order and synchronously, and reactions are scheduled if any of their deps have truly changed.

1. propagate dirty state, schedule microtask to process affected computeds
2. computeds are re-evaluated in the microtask, bringing the full dep graph up to date
3. if a reaction received a changed dep, it'll schedule and run

Considerations:

1. (+) reactions are only scheduled if some dep actually changed
1. (+) implicit batching avoid recomputation
1. (-) reactions cannot run sync
1. (-) in every microtask, the full computation graph is updated, which might be more often than some reactions require if they'll only run in a while

### (3) Color & schedule, compute late (push / pull)

Propagate dirty state inmediately, schedule all affected reactions, than lazily pull all values through the system.

1. propagate dirty state
2. schedule any affected reaction
3. during run pull values through the graph

Considerations:

1. (+) no computations are eager
1. (+) implicit batching for free
1. (+) reactions can run sync
1. (-) all _potentially_ affected reactions are scheduled and run. E.g. every React component _will_ render

### (4) Color & partially compute early, batch, schedule (push / (push / pull)) (MobX)

Using an explict batch API, propagate dirty state fully, than check all candidate reactions at the end of the batch for at least one changed dep (pulled) before scheduling.

1. mark transactions explicitly
2. propagate dirty state
2. mark all potentially affected reactions as potential candidates at end of batch
3. once batch end, for each reaction, pull dependencies of the reaction one by one, on the first change detected, abort the process and schedule the reaction. The other deps are pulled lazily.

Considerations

1. (-) Part of the computation graph runs early, but only at the end of the batch
2. (+) only truly affected reactions are scheduled

### (5) Color & partially compute on microtask, schedule (push / (push / pull)) (MobY)

Like (4), but instead of explicit batch api, do the end-of-batch work in a next microtask (or later depending on the Reactions scheduler)
Reaction -> schedule staleness check -> schedule run&track

1. schedule microtask
2. propagate dirty state
2. mark all affected reactions as potential candidates for the microtask
3. once batch end, pull dependencies of reactions one by one, on the first change, abort the process and schedule the reaction

Considerations

1. (-) Part of the computation graph runs early in the microtask, but only at the end of the implicit batch
1. (-) drops the possibility of ever running a reation truly synchronous
2. (+) only truly affected reactions are scheduled

### (6) Always schedule all reactions, only compute on pull (pull / pull) (starbeam?)

Always assume all reactions have changed, in a microtask pull all deps, schedule effect (or schedule immediately)

1. No change propagate, but increase logical clock for mutated signals
1. schedule microtask
1. for all reactions, pull their deps, schedule reaction if affected

Considerations

1. (+) signals need no notion of their observers
2. (-) full graph is always re-evaluated

## Setup

```bash
# install dependencies
bun install

# test the app
bun test

# build the app, available under dist
bun run build
```

## License

MIT
