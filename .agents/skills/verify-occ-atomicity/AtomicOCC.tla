----------------------------- MODULE AtomicOCC -----------------------------
EXTENDS Naturals, Sequences, FiniteSets, TLC

CONSTANTS Writers, MaxVersion, CheckBefore, AtomicCommit
VARIABLES task, version, history, lock, pc, before, after,
          pendingTask, pendingVersion, pendingHistory

vars == <<task, version, history, lock, pc, before, after,
          pendingTask, pendingVersion, pendingHistory>>
InitialTask == [version |-> 1, content |-> 0]
Tasks == [version : 1..MaxVersion, content : 0..Cardinality(Writers)]
Entry(w, outcome) == [writer |-> w, outcome |-> outcome,
                      before |-> before[w], after |-> after[w]]
Committed(log) == SelectSeq(log, LAMBDA entry: entry.outcome = "committed")

Init == /\ task = InitialTask
        /\ version = 1
        /\ history = <<>>
        /\ lock = 0
        /\ pc = [w \in Writers |-> "resolve"]
        /\ before = [w \in Writers |-> InitialTask]
        /\ after = [w \in Writers |-> InitialTask]
        /\ pendingTask = InitialTask
        /\ pendingVersion = 1
        /\ pendingHistory = <<>>

Resolve(w) == /\ pc[w] = "resolve"
              /\ \E proposedBefore \in Tasks, proposedVersion \in 1..MaxVersion:
                   /\ before' = [before EXCEPT ![w] = proposedBefore]
                   /\ after' = [after EXCEPT ![w] =
                        [version |-> proposedVersion, content |-> w]]
              /\ pc' = [pc EXCEPT ![w] = "begin"]
              /\ UNCHANGED <<task, version, history, lock,
                              pendingTask, pendingVersion, pendingHistory>>

Begin(w) == /\ pc[w] = "begin" /\ lock = 0
            /\ lock' = w
            /\ pendingTask' = task /\ pendingHistory' = history
            /\ pendingVersion' = version
            /\ pc' = [pc EXCEPT ![w] = "validate"]
            /\ UNCHANGED <<task, version, history, before, after>>

Validate(w) == /\ pc[w] = "validate" /\ lock = w
               /\ IF (~CheckBefore \/ before[w] = pendingTask)
                      /\ after[w].version = pendingVersion + 1
                  THEN /\ pc' = [pc EXCEPT ![w] = "record"]
                       /\ UNCHANGED lock
                  ELSE /\ pc' = [pc EXCEPT ![w] = "rejectWait"]
                       /\ lock' = 0
               /\ UNCHANGED <<task, version, history, before, after,
                               pendingTask, pendingVersion, pendingHistory>>

Record(w) == /\ pc[w] = "record" /\ lock = w
             /\ pendingHistory' = Append(pendingHistory, Entry(w, "committed"))
             /\ history' = IF AtomicCommit THEN history ELSE pendingHistory'
             /\ pc' = [pc EXCEPT ![w] = "apply"]
             /\ UNCHANGED <<task, version, lock, before, after,
                             pendingTask, pendingVersion>>

Apply(w) == /\ pc[w] = "apply" /\ lock = w
            /\ pendingTask' = after[w]
            /\ pc' = [pc EXCEPT ![w] = "writeVersion"]
            /\ UNCHANGED <<task, version, history, lock, before, after,
                            pendingVersion, pendingHistory>>

WriteVersion(w) == /\ pc[w] = "writeVersion" /\ lock = w
                   /\ pendingVersion' = after[w].version
                   /\ pc' = [pc EXCEPT ![w] = "commit"]
                   /\ UNCHANGED <<task, version, history, lock, before, after,
                                   pendingTask, pendingHistory>>

Commit(w) == /\ pc[w] = "commit" /\ lock = w
             /\ task' = pendingTask /\ history' = pendingHistory
             /\ version' = pendingVersion
             /\ lock' = 0 /\ pc' = [pc EXCEPT ![w] = "done"]
             /\ UNCHANGED <<before, after, pendingTask, pendingVersion, pendingHistory>>

RejectBegin(w) == /\ pc[w] = "rejectWait" /\ lock = 0
                  /\ lock' = w
                  /\ pendingTask' = task /\ pendingHistory' = history
                  /\ pendingVersion' = version
                  /\ pc' = [pc EXCEPT ![w] = "rejectRecord"]
                  /\ UNCHANGED <<task, version, history, before, after>>

RejectRecord(w) == /\ pc[w] = "rejectRecord" /\ lock = w
                   /\ pendingHistory' = Append(pendingHistory, Entry(w, "rejected"))
                   /\ pc' = [pc EXCEPT ![w] = "rejectCommit"]
                   /\ UNCHANGED <<task, version, history, lock, before, after,
                                   pendingTask, pendingVersion>>

RejectCommit(w) == /\ pc[w] = "rejectCommit" /\ lock = w
                   /\ history' = pendingHistory
                   /\ lock' = 0 /\ pc' = [pc EXCEPT ![w] = "done"]
                   /\ UNCHANGED <<task, version, before, after,
                                   pendingTask, pendingVersion, pendingHistory>>

Crash(w) == /\ pc[w] # "done"
            /\ pc' = [pc EXCEPT ![w] = "done"]
            /\ lock' = IF lock = w THEN 0 ELSE lock
            /\ UNCHANGED <<task, version, history, before, after,
                            pendingTask, pendingVersion, pendingHistory>>

Next == \E w \in Writers:
          Resolve(w) \/ Begin(w) \/ Validate(w) \/ Record(w) \/ Apply(w)
          \/ WriteVersion(w) \/ Commit(w)
          \/ RejectBegin(w) \/ RejectRecord(w) \/ RejectCommit(w) \/ Crash(w)

AtomicCAS == LET committed == Committed(history) IN
              /\ version = task.version
              /\ task = IF Len(committed) = 0 THEN InitialTask
                        ELSE committed[Len(committed)].after
              /\ \A i \in 1..Len(committed):
                   /\ committed[i].before =
                        IF i = 1 THEN InitialTask ELSE committed[i-1].after
                   /\ committed[i].after.version = committed[i].before.version + 1

TypeOK == /\ task \in Tasks /\ pendingTask \in Tasks
          /\ version \in 1..MaxVersion /\ pendingVersion \in 1..MaxVersion
          /\ lock \in Writers \cup {0}
          /\ before \in [Writers -> Tasks] /\ after \in [Writers -> Tasks]
          /\ pc \in [Writers -> {"resolve", "begin", "validate", "record", "apply",
                     "writeVersion", "commit", "rejectWait", "rejectRecord", "rejectCommit", "done"}]
=============================================================================
