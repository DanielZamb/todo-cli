---------------------------- MODULE DagAcyclic ----------------------------
EXTENDS Naturals, Integers, Sequences, FiniteSets, TLC
CONSTANTS N, Limit, Scenario, Mutation, AllowRevert
VARIABLE initialTasks
Tasks == 1..N
Writers == {"CLI", "server"}
Statuses == {"open", "snoozed", "done", "cancelled"}
Unresolved(s) == s \in {"open", "snoozed"}
Edge(b,d) == <<b,d>>
Profile(t) == IF Scenario = "profiles" /\ t = 3 THEN 2 ELSE 1
Incident(g,t) == {e \in g: e[1] = t \/ e[2] = t}
Dependents(g) == {e[2]: e \in g}
In(g,t) == {e \in g: e[2] = t}
RECURSIVE Reach(_,_,_)
Reach(g,t,k) == IF k = 0 THEN {e[2]: e \in {x \in g: x[1] = t}}
               ELSE LET prev == Reach(g,t,k-1) IN
                    prev \cup {e[2]: e \in {x \in g: x[1] \in prev}}
DAG(g) == \A t \in Tasks: t \notin Reach(g,t,N)
Distance(g,a,b) == CHOOSE k \in 1..N:
 b \in Reach(g,a,k-1) /\ \A j \in 1..(k-1): b \notin Reach(g,a,j-1)
RECURSIVE Path(_,_,_,_)
Path(g,a,b,k) == IF k = 0 THEN <<b>> ELSE
 LET next == CHOOSE t \in Tasks: Edge(a,t) \in g /\
  (IF k = 1 THEN t = b ELSE b \in Reach(g,t,k-2))
 IN <<a>> \o Path(g,next,b,k-1)
Loop(g) == IF DAG(g) THEN <<>> ELSE
 LET start == CHOOSE t \in Tasks: t \in Reach(g,t,N)
 IN Path(g,start,start,Distance(g,start,start))
ValidLoop(g,path) == /\ Len(path) >= 2 /\ path[1] = path[Len(path)]
 /\ \A i \in 1..(Len(path)-1): Edge(path[i],path[i+1]) \in g
SeedEdges == CASE Scenario = "transitive" -> {Edge(1,2), Edge(2,3)}
              [] Scenario \in {"reopen", "reopen-cancelled", "complete", "remove", "witness", "noop-add", "delete-blocker", "cancel-complete"} -> {Edge(1,2)}
              [] Scenario = "delete" -> {Edge(1,2), Edge(1,3), Edge(2,3)}
              [] Scenario = "delete-fanin" -> {Edge(1,3), Edge(2,3)}
              [] Scenario = "delete-dependent" -> {Edge(1,2)}
              [] Scenario = "degree" -> {Edge(1,3)}
              [] Scenario = "degree-two-race" -> {Edge(1,4)}
              [] Scenario = "boundary13" -> {Edge(b,N): b \in 1..12}
              [] Scenario = "boundary14" -> {Edge(b,N): b \in 1..13}
              [] OTHER -> {}
SeedStatus(t) == CASE Scenario = "pruned" -> "cancelled"
                 [] Scenario = "reopen" -> "done"
                 [] Scenario = "reopen-cancelled" /\ t = 1 -> "cancelled"
                 [] Scenario = "reopen-cancelled" /\ t = 2 -> "done"
                 [] Scenario = "complete" /\ t = 1 -> "cancelled"
                 [] Scenario = "transitive" /\ t = 2 -> "snoozed"
                 [] OTHER -> "open"
FixedSeedTasks == [t \in Tasks |-> [status |-> SeedStatus(t), alive |-> TRUE]]
SeedTasks == initialTasks
SeedVersions == [t \in Tasks |-> 1]
Op(k,t,b) == [kind |-> k, target |-> t, blocker |-> b, inverse |-> 0]
SeedOp(w) == CASE Scenario \in {"opposite", "pruned", "statuses"} -> IF w = "CLI" THEN Op("add",2,1) ELSE Op("add",1,2)
 [] Scenario = "transitive" -> IF w = "CLI" THEN Op("add",1,3) ELSE Op("remove",2,1)
 [] Scenario \in {"reopen", "reopen-cancelled"} -> IF w = "CLI" THEN Op("reopen",1,1) ELSE Op("cancel",2,2)
 [] Scenario = "complete" -> IF w = "CLI" THEN Op("reopen",1,1) ELSE Op("complete",2,2)
 [] Scenario = "remove" -> IF w = "CLI" THEN Op("remove",2,1) ELSE Op("add",2,3)
 [] Scenario = "witness" -> IF w = "CLI" THEN Op("add",1,2) ELSE Op("remove",2,1)
 [] Scenario = "delete" -> IF w = "CLI" THEN Op("delete",1,1) ELSE Op("add",2,3)
 [] Scenario = "delete-fanin" -> IF w = "CLI" THEN Op("delete",3,3) ELSE Op("cancel",1,1)
 [] Scenario = "delete-dependent" -> IF w = "CLI" THEN Op("delete",2,2) ELSE Op("add",2,3)
 [] Scenario = "degree" -> IF w = "CLI" THEN Op("add",3,2) ELSE Op("add",3,3)
 [] Scenario = "degree-two-race" -> IF w = "CLI" THEN Op("add",4,2) ELSE Op("add",4,3)
 [] Scenario = "count-race" -> IF w = "CLI" THEN Op("add",3,1) ELSE Op("add",3,2)
 [] Scenario = "profiles" -> IF w = "CLI" THEN Op("add",2,3) ELSE Op("add",2,1)
 [] Scenario = "noop-add" -> IF w = "CLI" THEN Op("add",2,1) ELSE Op("cancel",2,2)
 [] Scenario = "delete-blocker" -> IF w = "CLI" THEN Op("delete",1,1) ELSE Op("add",3,1)
 [] Scenario = "cancel-complete" -> IF w = "CLI" THEN Op("cancel",1,1) ELSE Op("complete",2,2)
 [] Scenario = "noop" -> IF w = "CLI" THEN Op("remove",2,1) ELSE Op("cancel",2,2)
 [] Scenario = "malformed" -> Op("malformed",2,1)
 [] Scenario = "unauthorized" -> Op("unauthorized",2,1)
 [] Scenario = "self" -> Op("add",1,1)
 [] Scenario = "boundary13" -> Op("add",N,13)
 [] Scenario = "boundary14" -> Op("add",N,14)
 [] OTHER -> Op("cancel",1,1)

VARIABLES edges, tasks, versions, history, rejected, lock, pc, tx, observed,
          operations, witness, reverted, audit
vars == <<initialTasks,edges,tasks,versions,history,rejected,lock,pc,tx,observed,
          operations,witness,reverted,audit>>
State(g,s,v) == [edges |-> g, tasks |-> s, versions |-> v]
Durable == State(edges,tasks,versions)
Seed == State(SeedEdges,SeedTasks,SeedVersions)
EmptyEvent == [writer |-> "CLI", epoch |-> FALSE, kind |-> "none", target |-> 1, added |-> {}, removed |-> {},
 touched |-> {}, edgeVersionIds |-> {}, taskIds |-> {}, beforeTasks |-> SeedTasks, afterTasks |-> SeedTasks,
 beforeVersions |-> SeedVersions, afterVersions |-> SeedVersions, pre |-> Seed]
EmptyTx == [base |-> Seed, event |-> EmptyEvent, pending |-> Seed, recorded |-> FALSE]
EmptyWitness == [path |-> <<>>, reason |-> "none", captured |-> Seed, graph |-> SeedEdges,
 candidate |-> SeedEdges]

Event(o,base,w) ==
 LET old == IF o.kind = "revert" THEN history[o.inverse] ELSE EmptyEvent
     add == CASE o.kind = "add" -> {Edge(o.blocker,o.target)} \ base.edges
             [] o.kind = "revert" -> old.removed \ base.edges [] OTHER -> {}
     rem == CASE o.kind = "remove" -> {Edge(o.blocker,o.target)} \cap base.edges
             [] o.kind = "delete" -> Incident(base.edges,o.target)
             [] o.kind = "revert" -> old.added \cap base.edges [] OTHER -> {}
     ids == IF o.kind \in {"complete","cancel","reopen","delete"} THEN {o.target}
            ELSE IF o.kind = "revert" THEN old.taskIds ELSE {}
     after == [t \in Tasks |-> IF t \notin ids THEN base.tasks[t]
          ELSE CASE o.kind = "complete" -> [base.tasks[t] EXCEPT !.status = "done"]
                [] o.kind = "cancel" -> [base.tasks[t] EXCEPT !.status = "cancelled"]
                [] o.kind = "reopen" -> [base.tasks[t] EXCEPT !.status = "open"]
                [] o.kind = "delete" -> [base.tasks[t] EXCEPT !.alive = FALSE]
                [] OTHER -> old.beforeTasks[t]]
     touched == Dependents(add \cup rem) \cup ids
 IN [writer |-> w, epoch |-> reverted, kind |-> o.kind, target |-> o.target, added |-> add, removed |-> rem,
     touched |-> touched, edgeVersionIds |-> touched \ ids, taskIds |-> ids, beforeTasks |-> base.tasks, afterTasks |-> after,
     beforeVersions |-> base.versions,
     afterVersions |-> [t \in Tasks |-> base.versions[t] + IF t \in touched THEN 1 ELSE 0], pre |-> base]
Apply(g,s,v,e) == State((g \ e.removed) \cup e.added,
 [t \in Tasks |-> IF t \in e.taskIds THEN e.afterTasks[t] ELSE s[t]],
 [t \in Tasks |-> IF t \in e.touched THEN e.afterVersions[t] ELSE v[t]])
RECURSIVE Replay(_)
Replay(i) == IF i = 0 THEN Seed ELSE LET prev == Replay(i-1) IN
             Apply(prev.edges,prev.tasks,prev.versions,history[i])
Visible(g,s) == \A e \in g: s[e[1]].alive /\ s[e[2]].alive
ProfilesOK(g) == \A e \in g: Profile(e[1]) = Profile(e[2])
Resolved(g,s) == \A e \in g: s[e[2]].status = "done" => ~Unresolved(s[e[1]].status)
ReopenOK(e) == \A t \in e.taskIds:
 (~Unresolved(e.beforeTasks[t].status) /\ Unresolved(e.afterTasks[t].status)) =>
  ~\E x \in e.pre.edges: x[1] = t /\ e.beforeTasks[x[2]].status = "done"
CycleGraph(w) == LET base == IF Mutation = "outside" THEN observed[w] ELSE tx[w].base IN
 IF Mutation = "pruned" THEN {e \in base.edges: Unresolved(base.tasks[e[1]].status) /\ Unresolved(base.tasks[e[2]].status)}
 ELSE base.edges
Reason(w) == LET e == tx[w].event
                proposed == Apply(tx[w].base.edges,tx[w].base.tasks,tx[w].base.versions,e)
 IN CASE ~Visible(proposed.edges,proposed.tasks) -> "not_found"
 [] ~ProfilesOK(proposed.edges) -> "profile"
 [] ~DAG((CycleGraph(w) \ e.removed) \cup e.added) -> "cycle"
 [] \E t \in Tasks: Cardinality(In(proposed.edges,t)) > Limit -> "degree"
 [] Mutation # "reopen" /\ ~ReopenOK(e) -> "reopen"
 [] (e.added # {} \/ \E t \in e.taskIds: e.afterTasks[t].status = "done") /\ ~Resolved(proposed.edges,proposed.tasks) -> "blocked"
 [] OTHER -> "none"
Hold(w) == Mutation = "no-lock" \/ lock = w
Release(w) == IF lock = w THEN "none" ELSE lock

Init == /\ IF Scenario = "statuses" THEN initialTasks \in [Tasks -> [status: Statuses, alive: {TRUE}]] ELSE initialTasks = FixedSeedTasks
 /\ edges = SeedEdges /\ tasks = SeedTasks /\ versions = SeedVersions
 /\ history = <<>> /\ rejected = <<>> /\ lock = "none" /\ reverted = FALSE
 /\ pc = [w \in Writers |-> IF N = 15 /\ w = "server" THEN "done" ELSE "resolve"]
 /\ tx = [w \in Writers |-> EmptyTx] /\ observed = [w \in Writers |-> Seed]
 /\ operations = [w \in Writers |-> SeedOp(w)] /\ witness = [w \in Writers |-> EmptyWitness]
 /\ audit = [crash |-> TRUE, rejection |-> TRUE, noop |-> TRUE, boundary |-> TRUE]
Resolve(w) == /\ pc[w] = "resolve"
 /\ observed' = [observed EXCEPT ![w] = Durable]
 /\ pc' = [pc EXCEPT ![w] = "begin"]
 /\ UNCHANGED <<edges,tasks,versions,history,rejected,lock,tx,operations,witness,reverted,audit>>
Begin(w) == /\ pc[w] = "begin" /\ (lock = "none" \/ Mutation = "no-lock")
 /\ lock' = (IF Mutation = "no-lock" THEN lock ELSE w)
 /\ tx' = [tx EXCEPT ![w] = [base |-> Durable, event |-> Event(operations[w],Durable,w), pending |-> Durable, recorded |-> FALSE]]
 /\ pc' = [pc EXCEPT ![w] = "versions"]
 /\ UNCHANGED <<edges,tasks,versions,history,rejected,observed,operations,witness,reverted,audit>>
ValidateVersions(w) == /\ pc[w] = "versions" /\ Hold(w)
 /\ LET o == operations[w] e == tx[w].event base == tx[w].base
        boundary == o.kind \in {"malformed","unauthorized"}
        endpoint == (o.kind # "revert" /\ ~base.tasks[o.target].alive) \/ (o.kind \in {"add","remove"} /\ (~base.tasks[o.blocker].alive \/ Profile(o.target) # Profile(o.blocker)))
        noop == e.touched = {}
        valid == \A t \in e.touched: observed[w].versions[t] = base.versions[t]
    IN /\ pc' = [pc EXCEPT ![w] = IF boundary THEN "boundary" ELSE IF endpoint THEN "rejectWait" ELSE IF noop THEN "noop" ELSE IF valid THEN "graph" ELSE "rejectWait"]
       /\ lock' = IF boundary \/ endpoint \/ noop \/ ~valid THEN Release(w) ELSE lock
       /\ witness' = [witness EXCEPT ![w] = [path |-> <<>>, reason |-> IF endpoint THEN "not_found" ELSE "version", captured |-> base, graph |-> base.edges, candidate |-> base.edges]]
 /\ UNCHANGED <<edges,tasks,versions,history,rejected,tx,observed,operations,reverted,audit>>
ValidateGraphAndStatus(w) == /\ pc[w] = "graph" /\ Hold(w)
 /\ LET r == Reason(w) base == tx[w].base e == tx[w].event IN
    /\ pc' = [pc EXCEPT ![w] = IF r = "none" THEN "record" ELSE "rejectWait"]
    /\ lock' = IF r = "none" THEN lock ELSE Release(w)
    /\ witness' = [witness EXCEPT ![w] = [path |-> IF r = "cycle" THEN Loop((base.edges \ e.removed) \cup e.added) ELSE <<>>, reason |-> r, captured |-> base, graph |-> base.edges, candidate |-> (base.edges \ e.removed) \cup e.added]]
 /\ UNCHANGED <<edges,tasks,versions,history,rejected,tx,observed,operations,reverted,audit>>
Record(w) == /\ pc[w] = "record" /\ Hold(w)
 /\ tx' = [tx EXCEPT ![w].recorded = TRUE]
 /\ pc' = [pc EXCEPT ![w] = "edges"]
 /\ UNCHANGED <<edges,tasks,versions,history,rejected,lock,observed,operations,witness,reverted,audit>>
ApplyEdges(w) == /\ pc[w] = "edges" /\ Hold(w)
 /\ tx' = [tx EXCEPT ![w].pending.edges = (@ \ tx[w].event.removed) \cup tx[w].event.added]
 /\ edges' = (IF Mutation = "split-delete" /\ tx[w].event.kind = "delete" THEN tx'[w].pending.edges ELSE edges)
 /\ pc' = [pc EXCEPT ![w] = "tasks"]
 /\ UNCHANGED <<tasks,versions,history,rejected,lock,observed,operations,witness,reverted,audit>>
ApplyTasks(w) == /\ pc[w] = "tasks" /\ Hold(w)
 /\ tx' = [tx EXCEPT ![w].pending.tasks = tx[w].event.afterTasks]
 /\ pc' = [pc EXCEPT ![w] = "writeVersions"]
 /\ UNCHANGED <<edges,tasks,versions,history,rejected,lock,observed,operations,witness,reverted,audit>>
WriteVersions(w) == /\ pc[w] = "writeVersions" /\ Hold(w)
 /\ tx' = [tx EXCEPT ![w].pending.versions = tx[w].event.afterVersions]
 /\ pc' = [pc EXCEPT ![w] = "commit"]
 /\ UNCHANGED <<edges,tasks,versions,history,rejected,lock,observed,operations,witness,reverted,audit>>
Commit(w) == /\ pc[w] = "commit" /\ Hold(w) /\ tx[w].recorded
 /\ LET next == IF Mutation = "no-lock" THEN Apply(edges,tasks,versions,tx[w].event) ELSE tx[w].pending IN
    /\ edges' = next.edges /\ tasks' = next.tasks /\ versions' = next.versions
 /\ history' = Append(history,tx[w].event)
 /\ lock' = Release(w) /\ pc' = [pc EXCEPT ![w] = "done"]
 /\ UNCHANGED <<rejected,tx,observed,operations,witness,reverted,audit>>
RejectBegin(w) == /\ pc[w] = "rejectWait" /\ (lock = "none" \/ Mutation = "no-lock")
 /\ lock' = (IF Mutation = "no-lock" THEN lock ELSE w)
 /\ pc' = [pc EXCEPT ![w] = "rejectRecord"]
 /\ UNCHANGED <<edges,tasks,versions,history,rejected,tx,observed,operations,witness,reverted,audit>>
RejectRecord(w) == /\ pc[w] = "rejectRecord" /\ Hold(w)
 /\ pc' = [pc EXCEPT ![w] = "rejectCommit"]
 /\ UNCHANGED <<edges,tasks,versions,history,rejected,lock,tx,observed,operations,witness,reverted,audit>>
RejectCommit(w) == /\ pc[w] = "rejectCommit" /\ Hold(w)
 /\ rejected' = Append(rejected,witness[w])
 /\ lock' = Release(w) /\ pc' = [pc EXCEPT ![w] = "done"]
 /\ UNCHANGED <<edges,tasks,versions,history,tx,observed,operations,witness,reverted>>
 /\ audit' = [audit EXCEPT !.rejection = (Durable' = Durable)]
Crash(w) == /\ pc[w] # "done"
 /\ pc' = [pc EXCEPT ![w] = "done"] /\ lock' = Release(w)
 /\ tx' = [tx EXCEPT ![w] = EmptyTx]
 /\ UNCHANGED <<edges,tasks,versions,history,rejected,observed,operations,witness,reverted>>
 /\ audit' = [audit EXCEPT !.crash = (Durable' = Durable)]
Finish(w) == /\ pc[w] \in {"noop","boundary"}
 /\ pc' = [pc EXCEPT ![w] = "done"]
 /\ UNCHANGED <<edges,tasks,versions,history,rejected,lock,tx,observed,operations,witness,reverted>>
 /\ audit' = [audit EXCEPT !.noop = (Durable' = Durable /\ history' = history /\ rejected' = rejected), !.boundary = (Durable' = Durable)]
StartRevert == /\ AllowRevert /\ ~reverted /\ \A w \in Writers: pc[w] = "done"
 /\ Len(history) > 0
 /\ \E i \in 1..Len(history): operations' = [operations EXCEPT !["CLI"] = [kind |-> "revert", target |-> history[i].target, blocker |-> history[i].target, inverse |-> i]]
 /\ reverted' = TRUE /\ pc' = [pc EXCEPT !["CLI"] = "resolve"]
 /\ UNCHANGED <<edges,tasks,versions,history,rejected,lock,tx,observed,witness,audit>>
Next == /\ UNCHANGED initialTasks
 /\ (StartRevert \/ \E w \in Writers: Resolve(w) \/ Begin(w) \/ ValidateVersions(w)
 \/ ValidateGraphAndStatus(w) \/ Record(w) \/ ApplyEdges(w) \/ ApplyTasks(w)
 \/ WriteVersions(w) \/ Commit(w) \/ RejectBegin(w) \/ RejectRecord(w) \/ RejectCommit(w)
 \/ Crash(w) \/ Finish(w))
Spec == Init /\ [][Next]_vars

TypeOK == /\ edges \subseteq Tasks \X Tasks
 /\ tasks \in [Tasks -> [status: Statuses, alive: BOOLEAN]]
 /\ initialTasks \in [Tasks -> [status: Statuses, alive: BOOLEAN]]
 /\ versions \in [Tasks -> 1..4] /\ lock \in Writers \cup {"none"}
 /\ Len(history) <= 3 /\ Len(rejected) <= 3
 /\ \A w \in Writers:
   /\ tx[w].pending.edges \subseteq Tasks \X Tasks
   /\ tx[w].pending.tasks \in [Tasks -> [status: Statuses, alive: BOOLEAN]]
   /\ tx[w].pending.versions \in [Tasks -> 1..4]
   /\ pc[w] \in {"resolve","begin","versions","graph","record","edges","tasks","writeVersions","commit","rejectWait","rejectRecord","rejectCommit","noop","boundary","done"}
Acyclic == DAG(edges)
SameProfileEdges == ProfilesOK(edges) /\ Visible(edges,tasks)
InDegreeAtMost13 == \A t \in Tasks: Cardinality(In(edges,t)) <= Limit
DoneHadResolvedDependencies == Resolved(edges,tasks)
NoReopenUnderDone == \A i \in 1..Len(history): ReopenOK(history[i])
OneEventPerDelete == \A i \in 1..Len(history): LET e == history[i] IN
 e.kind = "delete" => /\ e.removed = Incident(e.pre.edges,e.target)
 /\ Cardinality({j \in 1..Len(history): history[j].writer = e.writer /\ history[j].epoch = e.epoch}) = 1
 /\ e.added = {} /\ e.taskIds = {e.target}
 /\ e.touched = {e.target} \cup Dependents(e.removed)
 /\ ~e.afterTasks[e.target].alive
 /\ \A t \in e.touched: e.afterVersions[t] = e.beforeVersions[t]+1
DependencyVersionOwnership == \A i \in 1..Len(history): LET e == history[i] IN
 /\ e.touched = Dependents(e.added \cup e.removed) \cup e.taskIds
 /\ e.edgeVersionIds = Dependents(e.added \cup e.removed) \ e.taskIds
 /\ e.edgeVersionIds \cap e.taskIds = {}
 /\ \A t \in e.touched: e.beforeVersions[t] = Replay(i-1).versions[t]
 /\ \A t \in Tasks: e.afterVersions[t] = e.beforeVersions[t] + IF t \in e.touched THEN 1 ELSE 0
 /\ (e.kind \in {"add","remove"} => e.touched = {e.target})
RejectedNoProjectionChange == audit.rejection /\ audit.noop /\ audit.boundary
AtomicGraphHistory == Durable = Replay(Len(history))
CrashAtomicity == audit.crash /\ AtomicGraphHistory
RejectionWitness == \A i \in 1..Len(rejected): LET r == rejected[i] IN
 /\ r.graph = r.captured.edges
 /\ r.reason = "cycle" => ValidLoop(r.candidate,r.path)
NeverStaleNoop == ~\E w \in Writers: pc[w] = "noop" /\ observed[w].versions[operations[w].target] # versions[operations[w].target]
NeverRevertCommit == ~\E i \in 1..Len(history): history[i].kind = "revert"
NeverWitnessGap == ~\E i \in 1..Len(rejected): rejected[i].reason = "cycle" /\ rejected[i].graph # edges
NeverGroupedDelete == ~\E i \in 1..Len(history): history[i].kind = "delete" /\ Cardinality(history[i].removed) = 2 /\ Cardinality(history[i].touched) = 3
NeverAccepted13 == Cardinality(In(edges,N)) # 13
NeverRefused14 == ~\E i \in 1..Len(rejected): rejected[i].reason = "degree" /\ Cardinality(In(rejected[i].candidate,N)) = 14
=============================================================================
