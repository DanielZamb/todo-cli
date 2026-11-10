----------------------------- MODULE TaskSearch -----------------------------
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS Profiles, Views, Texts, Filters, Slots, MaxRequests, EmptyText, EmptyFilter,
          InitialProfile, InitialView, NoIdentity, BrokenSnapshot, BrokenLatest,
          BrokenStale, BrokenProgress, BrokenFallback, BrokenCatalogOwed, BrokenCatalogPromotion

VARIABLES requestedIdentity, appliedSnapshot, phase, stale, pending,
          issuedGeneration, dialogDraft, selection, stable, publicationOK, catalogReady, issuedFull,
          catalogOwed, catalogOwedOK, catalogPublicationOK

vars == <<requestedIdentity, appliedSnapshot, phase, stale, pending,
          issuedGeneration, dialogDraft, selection, stable, publicationOK, catalogReady, issuedFull,
          catalogOwed, catalogOwedOK, catalogPublicationOK>>
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
  /\ catalogReady = FALSE
  /\ issuedFull = FALSE
  /\ catalogOwed = TRUE
  /\ catalogOwedOK = TRUE
  /\ catalogPublicationOK = TRUE

Input(t) ==
  /\ ~stable /\ t # requestedIdentity.text
  /\ requestedIdentity' = [requestedIdentity EXCEPT !.text = t]
  /\ phase' = "Debouncing"
  /\ issuedGeneration' = 0
  /\ issuedFull' = FALSE
  /\ stale' = IF BrokenStale THEN stale
              ELSE (requestedIdentity' # appliedSnapshot.appliedIdentity)
  /\ UNCHANGED <<appliedSnapshot, pending, dialogDraft, selection, stable, publicationOK,
                 catalogReady, catalogOwed, catalogOwedOK, catalogPublicationOK>>

Esc == Input(EmptyText)
CmdF == UNCHANGED vars

Launch(n, identity, full) ==
  /\ n \in Free
  /\ Cardinality({i \in Slots : pending[i] # NoIdentity}) < MaxRequests
  /\ requestedIdentity' = identity
  /\ pending' = [pending EXCEPT ![n] = identity]
  /\ issuedFull' = (full \/ (~BrokenFallback /\
                         (~catalogReady \/ (catalogOwed /\ ~BrokenCatalogPromotion))))
  /\ catalogOwed' = IF BrokenCatalogOwed THEN FALSE ELSE (catalogOwed \/ full)
  /\ catalogOwedOK' = ((catalogOwed \/ full) => catalogOwed')
  /\ UNCHANGED <<catalogReady, catalogPublicationOK>>
  /\ issuedGeneration' = n
  /\ phase' = "Requesting"
  /\ stale' = (identity # appliedSnapshot.appliedIdentity)
  /\ UNCHANGED <<appliedSnapshot, selection, stable, publicationOK>>

InitialRequest ==
  /\ phase = "Idle"
  /\ \E n \in Slots : Launch(n, requestedIdentity, TRUE)
  /\ UNCHANGED dialogDraft

DebounceFired ==
  /\ phase = "Debouncing"
  /\ ~BrokenProgress
  /\ \E n \in Slots : Launch(n, requestedIdentity, FALSE)
  /\ UNCHANGED dialogDraft

Retry ==
  /\ phase = "Error"
  /\ \E n \in Slots : Launch(n, requestedIdentity, FALSE)
  /\ UNCHANGED dialogDraft

SSEOp ==
  /\ ~stable \/ phase = "Error"
  /\ \E n \in Slots : Launch(n, requestedIdentity, TRUE)
  /\ UNCHANGED dialogDraft

SSEReconnect == SSEOp
Recovery == phase = "Error" /\ (Retry \/ SSEReconnect \/ SSEOp)

ResponseOK(n) ==
  /\ pending[n] # NoIdentity
  /\ pending' = [pending EXCEPT ![n] = NoIdentity]
  /\ issuedFull' = IF n = issuedGeneration THEN FALSE ELSE issuedFull
  /\ IF Current(n) \/ BrokenLatest
     THEN /\ appliedSnapshot' =
                IF BrokenSnapshot
                THEN [Snapshot(pending[n], n) EXCEPT
                        !.search_matches = appliedSnapshot.search_matches]
                ELSE Snapshot(pending[n], n)
          /\ catalogReady' = (catalogReady \/ issuedFull)
          /\ catalogOwed' = IF issuedFull THEN FALSE ELSE catalogOwed
          /\ catalogOwedOK' = (catalogOwed => (catalogOwed' \/ issuedFull))
          /\ catalogPublicationOK' = (~catalogOwed \/ issuedFull)
          /\ phase' = "Showing"
          /\ stale' = (requestedIdentity # appliedSnapshot'.appliedIdentity)
          /\ publicationOK' = Current(n)
     ELSE UNCHANGED <<appliedSnapshot, phase, stale, publicationOK, catalogReady,
                      catalogOwed, catalogOwedOK, catalogPublicationOK>>
  /\ UNCHANGED <<requestedIdentity, issuedGeneration, dialogDraft, selection, stable>>

ResponseError(n) ==
  /\ pending[n] # NoIdentity
  /\ ~stable
  /\ pending' = [pending EXCEPT ![n] = NoIdentity]
  /\ issuedFull' = IF n = issuedGeneration THEN FALSE ELSE issuedFull
  /\ IF Current(n) \/ BrokenLatest
     THEN /\ requestedIdentity' = [requestedIdentity EXCEPT !.filters = AppliedFilters]
          /\ phase' = "Error"
          /\ stale' = (requestedIdentity' # appliedSnapshot.appliedIdentity)
          /\ publicationOK' = Current(n)
     ELSE UNCHANGED <<requestedIdentity, phase, stale, publicationOK>>
  /\ UNCHANGED <<appliedSnapshot, issuedGeneration, dialogDraft, selection, stable,
                 catalogReady, catalogOwed, catalogOwedOK, catalogPublicationOK>>

DialogOpen ==
  /\ ~stable /\ dialogDraft = Closed
  /\ dialogDraft' = requestedIdentity.filters
  /\ UNCHANGED <<requestedIdentity, appliedSnapshot, phase, stale, pending,
                 issuedGeneration, selection, stable, publicationOK, catalogReady, issuedFull, catalogOwed, catalogOwedOK, catalogPublicationOK>>

DialogEdit(f) ==
  /\ ~stable /\ dialogDraft # Closed
  /\ dialogDraft' = f
  /\ UNCHANGED <<requestedIdentity, appliedSnapshot, phase, stale, pending,
                 issuedGeneration, selection, stable, publicationOK, catalogReady, issuedFull, catalogOwed, catalogOwedOK, catalogPublicationOK>>

DialogCancel ==
  /\ dialogDraft # Closed
  /\ dialogDraft' = Closed
  /\ UNCHANGED <<requestedIdentity, appliedSnapshot, phase, stale, pending,
                 issuedGeneration, selection, stable, publicationOK, catalogReady, issuedFull, catalogOwed, catalogOwedOK, catalogPublicationOK>>

DialogApply ==
  /\ ~stable /\ dialogDraft # Closed
  /\ \E n \in Slots : Launch(n, [requestedIdentity EXCEPT !.filters = dialogDraft], FALSE)
  /\ dialogDraft' = Closed

Reset(p, v) ==
  /\ ~stable
  /\ p # requestedIdentity.profile \/ v # requestedIdentity.view
  /\ requestedIdentity' = [profile |-> p, view |-> v, text |-> requestedIdentity.text, filters |-> EmptyFilter]
  /\ catalogReady' = FALSE
  /\ catalogOwed' = TRUE
  /\ appliedSnapshot' = EmptySnapshot
  /\ phase' = "Idle"
  /\ stale' = TRUE
  /\ issuedGeneration' = 0
  /\ issuedFull' = FALSE
  /\ dialogDraft' = Closed
  /\ selection' = FALSE
  /\ UNCHANGED <<pending, stable, publicationOK, catalogOwedOK, catalogPublicationOK>>

ProfileSwitch ==
  \E p \in Profiles : Reset(p, requestedIdentity.view)
ViewSwitch ==
  \E v \in Views : Reset(requestedIdentity.profile, v)

SelectTask ==
  /\ appliedSnapshot.appliedIdentity # NoIdentity
  /\ selection' = ~selection
  /\ UNCHANGED <<requestedIdentity, appliedSnapshot, phase, stale, pending,
                 issuedGeneration, dialogDraft, stable, publicationOK, catalogReady, issuedFull, catalogOwed, catalogOwedOK, catalogPublicationOK>>

Settle ==
  /\ ~stable
  /\ stable' = TRUE
  /\ UNCHANGED <<requestedIdentity, appliedSnapshot, phase, stale, pending,
                 issuedGeneration, dialogDraft, selection, publicationOK, catalogReady, issuedFull, catalogOwed, catalogOwedOK, catalogPublicationOK>>

Next ==
  \/ \E t \in Texts : Input(t)
  \/ Esc \/ CmdF \/ InitialRequest \/ DebounceFired \/ Retry \/ SSEOp \/ SSEReconnect
  \/ \E n \in Slots : ResponseOK(n) \/ ResponseError(n)
  \/ DialogOpen \/ \E f \in Filters : DialogEdit(f)
  \/ DialogCancel \/ DialogApply \/ ProfileSwitch \/ ViewSwitch \/ SelectTask \/ Settle

Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ WF_vars(InitialRequest) /\ WF_vars(DebounceFired)
                /\ WF_vars(Recovery) /\ \A n \in Slots : WF_vars(ResponseOK(n))
FairSpecWithoutRetry == Spec /\ WF_vars(InitialRequest) /\ WF_vars(DebounceFired)
                            /\ \A n \in Slots : WF_vars(ResponseOK(n))

TypeOK ==
  /\ requestedIdentity \in Identities
  /\ appliedSnapshot.appliedIdentity \in Identities \cup {NoIdentity}
  /\ appliedSnapshot.rows \in [identity : Identities \cup {NoIdentity}, generation : Slots \cup {0}]
  /\ appliedSnapshot.search_matches \in [identity : Identities \cup {NoIdentity}, generation : Slots \cup {0}]
  /\ catalogReady \in BOOLEAN /\ issuedFull \in BOOLEAN
  /\ catalogOwed \in BOOLEAN /\ catalogOwedOK \in BOOLEAN /\ catalogPublicationOK \in BOOLEAN
  /\ phase \in Phases /\ stale \in BOOLEAN
  /\ pending \in [Slots -> Identities \cup {NoIdentity}]
  /\ issuedGeneration \in Slots \cup {0}
  /\ dialogDraft \in Filters \cup {Closed}
  /\ selection \in BOOLEAN /\ stable \in BOOLEAN /\ publicationOK \in BOOLEAN

OneSnapshot ==
  /\ appliedSnapshot.rows.identity = appliedSnapshot.appliedIdentity
  /\ appliedSnapshot.search_matches.identity = appliedSnapshot.appliedIdentity
  /\ appliedSnapshot.rows.generation = appliedSnapshot.search_matches.generation
QueryHasCatalog == (phase = "Requesting" /\ issuedGeneration # 0 /\ ~issuedFull) => catalogReady
CatalogOwedUntilPublish == catalogOwedOK
NoOwedQueryPublication == catalogPublicationOK
LatestPublication == publicationOK
ShowingIsCurrent == phase = "Showing" => appliedSnapshot.appliedIdentity = requestedIdentity
ExactStale == stale = (requestedIdentity # appliedSnapshot.appliedIdentity)
Convergence == stable ~> (appliedSnapshot.appliedIdentity = requestedIdentity /\ ~stale)
=============================================================================
