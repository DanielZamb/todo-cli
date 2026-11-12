# Patch protocol experiment, parked

Work in progress, parked when the owner selected strict read restructuring.
This branch merges the profiler at e0226565 into projection reads at a7e0ed0e.
Nothing is installed or wired into ordinary product routes by this prototype.

The current prototype includes a Replica model, whole-list and indexed-edit
Patch reducers, a consistent projection reader, a stored-outbox observer,
in-memory observer, synthetic fixture seeder, transaction instrumentation builder
and an unfinished measurement driver. The first build failed because filterTasks
was imported from presentation.ts instead of its actual module. No experiment
measurements or recommendations have been produced. The initial Swift-slot probe
was contended; no Swift build was started.

Resume only after the checked-read restructuring. Review transaction instrumentation,
Purge/restore erasure and driver correctness before measuring. In particular, the
current driver still needs the CLI burst, correctness coverage, codec/reconnect
measurements and profiler Diagnostics endpoint. Experiment code has not been
qualified by a successful build or test run.
