----------------------------- MODULE TaskSearch -----------------------------
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS Profiles, Views, Texts, Filters, Slots, MaxRequests, EmptyText, EmptyFilter,
          InitialProfile, InitialView, NoIdentity, BrokenSnapshot, BrokenLatest,
          BrokenStale, BrokenProgress

VARIABLES requestedIdentity, appliedSnapshot, phase, stale, pending,
          issuedGeneration, dialogDraft, selection, stable, publicationOK

vars == <<requestedIdentity, appliedSnapshot, phase, stale, pending,
          issuedGeneration, dialogDraft, selection, stable, publicationOK>>
Identities == [profile : Profiles, view : Views, text : Texts, filters : Filters]
Closed == 0
Phases == {"Idle", "Showing", "Debouncing", "Requesting", "Error"}
Snapshot(identity, generation) ==
  [appliedIdentity |-> identity,
   rows |-> [identity |-> identity, generation |-> generation],
   search_matches |-> [identity |-> identity, generation |-> generation]]
EmptySnapshot == Snapshot(NoIdentity, 0)
AppliedFilters == IF appliedSnapshot.appliedIdentity = NoIdentity
                  THEN EmptyFilter ELSE appliedSnapshot.appliedIdentity.filters
Current(n) == n = issuedGeneration /\ pending[n] = requestedIdentity
Free == {n \in Slots : pending[n] = NoIdentity /\ n # appliedSnapshot.rows.generation}

Init ==
  /\ requestedIdentity = [profile |-> InitialProfile, view |-> InitialView,
                           text |-> EmptyText, filters |-> EmptyFilter]
  /\ appliedSnapshot = EmptySnapshot
  /\ phase = "Idle"
  /\ stale = TRUE
  /\ pending = [n \in Slots |-> NoIdentity]
  /\ issuedGeneration = 0
  /\ dialogDraft = Closed
  /\ selection = FALSE
  /\ stable = FALSE
  /\ publicationOK = TRUE

Input(t) ==
  /\ ~stable /\ t # requestedIdentity.text
  /\ requestedIdentity' = [requestedIdentity EXCEPT !.text = t]
  /\ phase' = "Debouncing"
  /\ issuedGeneration' = 0
  /\ stale' = IF BrokenStale THEN stale
              ELSE (requestedIdentity' # appliedSnapshot.appliedIdentity)
  /\ UNCHANGED <<appliedSnapshot, pending, dialogDraft, selection, stable, publicationOK>>

Esc == Input(EmptyText)
CmdF == UNCHANGED vars

Launch(n, identity) ==
  /\ n \in Free
  /\ Cardinality({i \in Slots : pending[i] # NoIdentity}) < MaxRequests
  /\ requestedIdentity' = identity
  /\ pending' = [pending EXCEPT ![n] = identity]
  /\ issuedGeneration' = n
  /\ phase' = "Requesting"
  /\ stale' = (identity # appliedSnapshot.appliedIdentity)
  /\ UNCHANGED <<appliedSnapshot, selection, stable, publicationOK>>

InitialRequest ==
  /\ phase = "Idle"
  /\ \E n \in Slots : Launch(n, requestedIdentity)
  /\ UNCHANGED dialogDraft

DebounceFired ==
  /\ phase = "Debouncing"
  /\ ~BrokenProgress
  /\ \E n \in Slots : Launch(n, requestedIdentity)
  /\ UNCHANGED dialogDraft

Retry ==
  /\ phase = "Error"
  /\ \E n \in Slots : Launch(n, requestedIdentity)
  /\ UNCHANGED dialogDraft

SSEOp ==
  /\ ~stable
  /\ \E n \in Slots : Launch(n, requestedIdentity)
  /\ UNCHANGED dialogDraft

ResponseOK(n) ==
  /\ pending[n] # NoIdentity
  /\ pending' = [pending EXCEPT ![n] = NoIdentity]
  /\ IF Current(n) \/ BrokenLatest
     THEN /\ appliedSnapshot' =
                IF BrokenSnapshot
                THEN [Snapshot(pending[n], n) EXCEPT
                        !.search_matches = appliedSnapshot.search_matches]
                ELSE Snapshot(pending[n], n)
          /\ phase' = "Showing"
          /\ stale' = (requestedIdentity # appliedSnapshot'.appliedIdentity)
          /\ publicationOK' = Current(n)
     ELSE UNCHANGED <<appliedSnapshot, phase, stale, publicationOK>>
  /\ UNCHANGED <<requestedIdentity, issuedGeneration, dialogDraft, selection, stable>>

ResponseError(n) ==
  /\ pending[n] # NoIdentity
  /\ ~stable
  /\ pending' = [pending EXCEPT ![n] = NoIdentity]
  /\ IF Current(n) \/ BrokenLatest
     THEN /\ requestedIdentity' = [requestedIdentity EXCEPT !.filters = AppliedFilters]
          /\ phase' = "Error"
          /\ stale' = (requestedIdentity' # appliedSnapshot.appliedIdentity)
          /\ publicationOK' = Current(n)
     ELSE UNCHANGED <<requestedIdentity, phase, stale, publicationOK>>
  /\ UNCHANGED <<appliedSnapshot, issuedGeneration, dialogDraft, selection, stable>>

DialogOpen ==
  /\ ~stable /\ dialogDraft = Closed
  /\ dialogDraft' = requestedIdentity.filters
  /\ UNCHANGED <<requestedIdentity, appliedSnapshot, phase, stale, pending,
                 issuedGeneration, selection, stable, publicationOK>>

DialogEdit(f) ==
  /\ ~stable /\ dialogDraft # Closed
  /\ dialogDraft' = f
  /\ UNCHANGED <<requestedIdentity, appliedSnapshot, phase, stale, pending,
                 issuedGeneration, selection, stable, publicationOK>>

DialogCancel ==
  /\ dialogDraft # Closed
  /\ dialogDraft' = Closed
  /\ UNCHANGED <<requestedIdentity, appliedSnapshot, phase, stale, pending,
                 issuedGeneration, selection, stable, publicationOK>>

DialogApply ==
  /\ ~stable /\ dialogDraft # Closed
  /\ \E n \in Slots : Launch(n, [requestedIdentity EXCEPT !.filters = dialogDraft])
  /\ dialogDraft' = Closed

Reset(p, v, t) ==
  /\ ~stable
  /\ p # requestedIdentity.profile \/ v # requestedIdentity.view
  /\ requestedIdentity' = [profile |-> p, view |-> v, text |-> t, filters |-> EmptyFilter]
  /\ appliedSnapshot' = EmptySnapshot
  /\ phase' = "Idle"
  /\ stale' = TRUE
  /\ issuedGeneration' = 0
  /\ dialogDraft' = Closed
  /\ selection' = FALSE
  /\ UNCHANGED <<pending, stable, publicationOK>>

ProfileSwitch ==
  \E p \in Profiles, t \in {EmptyText, requestedIdentity.text} :
     Reset(p, requestedIdentity.view, t)
ViewSwitch ==
  \E v \in Views, t \in {EmptyText, requestedIdentity.text} :
     Reset(requestedIdentity.profile, v, t)

SelectTask ==
  /\ appliedSnapshot.appliedIdentity # NoIdentity
  /\ selection' = ~selection
  /\ UNCHANGED <<requestedIdentity, appliedSnapshot, phase, stale, pending,
                 issuedGeneration, dialogDraft, stable, publicationOK>>

Settle ==
  /\ ~stable
  /\ stable' = TRUE
  /\ UNCHANGED <<requestedIdentity, appliedSnapshot, phase, stale, pending,
                 issuedGeneration, dialogDraft, selection, publicationOK>>

Next ==
  \/ \E t \in Texts : Input(t)
  \/ Esc \/ CmdF \/ InitialRequest \/ DebounceFired \/ Retry \/ SSEOp
  \/ \E n \in Slots : ResponseOK(n) \/ ResponseError(n)
  \/ DialogOpen \/ \E f \in Filters : DialogEdit(f)
  \/ DialogCancel \/ DialogApply \/ ProfileSwitch \/ ViewSwitch \/ SelectTask \/ Settle

Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ WF_vars(InitialRequest) /\ WF_vars(DebounceFired)
                /\ WF_vars(Retry) /\ \A n \in Slots : WF_vars(ResponseOK(n))
FairSpecWithoutRetry == Spec /\ WF_vars(InitialRequest) /\ WF_vars(DebounceFired)
                            /\ \A n \in Slots : WF_vars(ResponseOK(n))

TypeOK ==
  /\ requestedIdentity \in Identities
  /\ appliedSnapshot.appliedIdentity \in Identities \cup {NoIdentity}
  /\ appliedSnapshot.rows \in [identity : Identities \cup {NoIdentity}, generation : Slots \cup {0}]
  /\ appliedSnapshot.search_matches \in [identity : Identities \cup {NoIdentity}, generation : Slots \cup {0}]
  /\ phase \in Phases /\ stale \in BOOLEAN
  /\ pending \in [Slots -> Identities \cup {NoIdentity}]
  /\ issuedGeneration \in Slots \cup {0}
  /\ dialogDraft \in Filters \cup {Closed}
  /\ selection \in BOOLEAN /\ stable \in BOOLEAN /\ publicationOK \in BOOLEAN

OneSnapshot ==
  /\ appliedSnapshot.rows.identity = appliedSnapshot.appliedIdentity
  /\ appliedSnapshot.search_matches.identity = appliedSnapshot.appliedIdentity
  /\ appliedSnapshot.rows.generation = appliedSnapshot.search_matches.generation
LatestPublication == publicationOK
ExactStale == stale = (requestedIdentity # appliedSnapshot.appliedIdentity)
Convergence == stable ~> (appliedSnapshot.appliedIdentity = requestedIdentity /\ ~stale)
=============================================================================
