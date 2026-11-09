-------------------- MODULE TaskSearchCacheAdmission --------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANTS Capacity, OneProfile, BrokenAdmission, BrokenEviction,
          BrokenInterrupt, BrokenIncomplete, BrokenGeneration, BrokenOwnCleanup
Keys == {"K1", "K2"}
Preparations == {"A", "B"}
Reads == {"R1", "R2"}
Profiles == IF OneProfile THEN {"work"} ELSE {"work", "personal"}
Generations == {"g0", "g1", "g2", "g3"}
None == "none"
ProfileOf(key) == IF OneProfile \/ key = "K1" THEN "work" ELSE "personal"
VARIABLES phase, preparationKey, preparationRead, pending, admitted,
          cache, readActive, readProfile, readGen, purgeGen, activeProfiles,
          closed, insertionAllowed, insertionFresh, ownCleanupOK
vars == <<phase, preparationKey, preparationRead, pending, admitted,
          cache, readActive, readProfile, readGen, purgeGen, activeProfiles,
          closed, insertionAllowed, insertionFresh, ownCleanupOK>>
EmptyEntry == [present |-> FALSE, complete |-> TRUE, source |-> None]
Retained == {k \in Keys : cache[k].present}
PendingKeys == {k \in Keys : pending[k] # None}
Fresh(r) == readGen[r] = purgeGen[readProfile[r]]
Owned(s) == pending[preparationKey[s]] = s
ReferencedGenerations(p) == {readGen[r] : r \in {r \in Reads : readActive[r] /\ readProfile[r] = p}}
FreshGenerations(p) == Generations \ (ReferencedGenerations(p) \cup {purgeGen[p]})
Init ==
  /\ phase = [s \in Preparations |-> "idle"]
  /\ preparationKey = [s \in Preparations |-> "K1"]
  /\ preparationRead = [s \in Preparations |-> "R1"]
  /\ pending = [k \in Keys |-> None]
  /\ admitted = [s \in Preparations |-> FALSE]
  /\ cache = [k \in Keys |-> EmptyEntry]
  /\ readActive = [r \in Reads |-> FALSE]
  /\ readProfile = [r \in Reads |-> "work"]
  /\ readGen = [r \in Reads |-> "g0"]
  /\ purgeGen = [p \in Profiles |-> "g0"]
  /\ activeProfiles = Profiles
  /\ closed = FALSE
  /\ insertionAllowed = TRUE
  /\ insertionFresh = TRUE
  /\ ownCleanupOK = TRUE
ReadStart(r, p) ==
  /\ ~readActive[r] /\ p \in activeProfiles /\ ~closed
  /\ readActive' = [readActive EXCEPT ![r] = TRUE]
  /\ readProfile' = [readProfile EXCEPT ![r] = p]
  /\ readGen' = [readGen EXCEPT ![r] = purgeGen[p]]
  /\ UNCHANGED <<phase, preparationKey, preparationRead, pending, admitted,
                 cache, purgeGen, activeProfiles, closed, insertionAllowed,
                 insertionFresh, ownCleanupOK>>
ReadEnd(r) ==
  /\ readActive[r]
  /\ \A s \in Preparations : phase[s] = "idle" \/ preparationRead[s] # r
  /\ readActive' = [readActive EXCEPT ![r] = FALSE]
  /\ UNCHANGED <<phase, preparationKey, preparationRead, pending, admitted,
                 cache, readProfile, readGen, purgeGen, activeProfiles, closed,
                 insertionAllowed, insertionFresh, ownCleanupOK>>
Miss(s, r, k) ==
  /\ phase[s] = "idle" /\ readActive[r] /\ readProfile[r] = ProfileOf(k)
  /\ ~cache[k].present
  /\ LET register == ~closed /\ (Fresh(r) \/ BrokenGeneration) /\
                     (pending[k] # None \/ Cardinality(Retained) + Cardinality(PendingKeys) < Capacity)
     IN /\ phase' = [phase EXCEPT ![s] = "preparing"]
        /\ preparationKey' = [preparationKey EXCEPT ![s] = k]
        /\ preparationRead' = [preparationRead EXCEPT ![s] = r]
        /\ pending' = IF register THEN [pending EXCEPT ![k] = s] ELSE pending
        /\ admitted' = [t \in Preparations |-> IF t = s THEN register
                           ELSE IF register /\ pending[k] = t THEN FALSE ELSE admitted[t]]
        /\ cache' = IF register /\ BrokenIncomplete
                    THEN [cache EXCEPT ![k] = [present |-> TRUE, complete |-> FALSE, source |-> s]]
                    ELSE cache
  /\ UNCHANGED <<readActive, readProfile, readGen, purgeGen, activeProfiles,
                 closed, insertionAllowed, insertionFresh, ownCleanupOK>>
PrepareStep(s) ==
  /\ phase[s] = "preparing"
  /\ phase' = [phase EXCEPT ![s] = "ready"]
  /\ UNCHANGED <<preparationKey, preparationRead, pending, admitted, cache,
                 readActive, readProfile, readGen, purgeGen, activeProfiles,
                 closed, insertionAllowed, insertionFresh, ownCleanupOK>>
Admit(s) ==
  /\ phase[s] = "ready"
  /\ LET k == preparationKey[s]
         r == preparationRead[s]
         insert == ~closed /\ (Owned(s) \/ BrokenAdmission) /\
                   (Fresh(r) \/ BrokenGeneration)
         nextPending == IF Owned(s) \/ BrokenOwnCleanup
                        THEN [pending EXCEPT ![k] = None] ELSE pending
     IN /\ cache' = IF insert THEN [cache EXCEPT ![k] = [present |-> TRUE, complete |-> TRUE, source |-> s]] ELSE cache
        /\ insertionAllowed' = IF insert THEN admitted[s] /\ Owned(s) ELSE insertionAllowed
        /\ insertionFresh' = IF insert THEN Fresh(r) ELSE insertionFresh
        /\ ownCleanupOK' = (Owned(s) \/ pending[k] = None \/ nextPending[k] = pending[k])
        /\ pending' = nextPending
  /\ phase' = [phase EXCEPT ![s] = "idle"]
  /\ admitted' = [admitted EXCEPT ![s] = FALSE]
  /\ UNCHANGED <<preparationKey, preparationRead, readActive, readProfile,
                 readGen, purgeGen, activeProfiles, closed>>
Complete(s) == Admit(s)
Interrupt(s) ==
  /\ phase[s] # "idle"
  /\ LET k == preparationKey[s]
         nextPending == IF ~BrokenInterrupt /\ (Owned(s) \/ BrokenOwnCleanup)
                        THEN [pending EXCEPT ![k] = None] ELSE pending
     IN /\ pending' = nextPending
        /\ ownCleanupOK' = (Owned(s) \/ pending[k] = None \/ nextPending[k] = pending[k])
  /\ phase' = [phase EXCEPT ![s] = "idle"]
  /\ admitted' = [admitted EXCEPT ![s] = FALSE]
  /\ UNCHANGED <<preparationKey, preparationRead, cache, readActive,
                 readProfile, readGen, purgeGen, activeProfiles, closed,
                 insertionAllowed, insertionFresh>>
Evict(k) ==
  /\ cache[k].present \/ pending[k] # None
  /\ cache' = [cache EXCEPT ![k] = EmptyEntry]
  /\ pending' = IF BrokenEviction THEN pending ELSE [pending EXCEPT ![k] = None]
  /\ admitted' = [s \in Preparations |-> IF phase[s] # "idle" /\ preparationKey[s] = k THEN FALSE ELSE admitted[s]]
  /\ UNCHANGED <<phase, preparationKey, preparationRead, readActive,
                 readProfile, readGen, purgeGen, activeProfiles, closed,
                 insertionAllowed, insertionFresh, ownCleanupOK>>
Purge(k, generation) ==
  /\ generation \in FreshGenerations(ProfileOf(k))
  /\ purgeGen' = [purgeGen EXCEPT ![ProfileOf(k)] = generation]
  /\ cache' = [cache EXCEPT ![k] = EmptyEntry]
  /\ pending' = IF BrokenEviction THEN pending ELSE [pending EXCEPT ![k] = None]
  /\ admitted' = [s \in Preparations |-> IF phase[s] # "idle" /\ preparationKey[s] = k THEN FALSE ELSE admitted[s]]
  /\ UNCHANGED <<phase, preparationKey, preparationRead, readActive,
                 readProfile, readGen, activeProfiles, closed,
                 insertionAllowed, insertionFresh, ownCleanupOK>>
DeleteProfile(p, generation) ==
  /\ p \in activeProfiles /\ generation \in FreshGenerations(p)
  /\ activeProfiles' = activeProfiles \ {p}
  /\ purgeGen' = [purgeGen EXCEPT ![p] = generation]
  /\ cache' = [k \in Keys |-> IF ProfileOf(k) = p THEN EmptyEntry ELSE cache[k]]
  /\ pending' = [k \in Keys |-> IF ProfileOf(k) = p /\ ~BrokenEviction THEN None ELSE pending[k]]
  /\ admitted' = [s \in Preparations |-> IF phase[s] # "idle" /\ ProfileOf(preparationKey[s]) = p THEN FALSE ELSE admitted[s]]
  /\ UNCHANGED <<phase, preparationKey, preparationRead, readActive,
                 readProfile, readGen, closed, insertionAllowed,
                 insertionFresh, ownCleanupOK>>
LruEvict(k) ==
  /\ cache[k].present
  /\ cache' = [cache EXCEPT ![k] = EmptyEntry]
  /\ UNCHANGED <<phase, preparationKey, preparationRead, pending, admitted,
                 readActive, readProfile, readGen, purgeGen, activeProfiles,
                 closed, insertionAllowed, insertionFresh, ownCleanupOK>>
Hit(k) == cache[k].present /\ UNCHANGED vars
Close ==
  /\ ~closed
  /\ closed' = TRUE
  /\ cache' = [k \in Keys |-> EmptyEntry]
  /\ pending' = [k \in Keys |-> None]
  /\ admitted' = [s \in Preparations |-> FALSE]
  /\ UNCHANGED <<phase, preparationKey, preparationRead, readActive,
                 readProfile, readGen, purgeGen, activeProfiles,
                 insertionAllowed, insertionFresh, ownCleanupOK>>
HasReady == \E s \in Preparations : phase[s] = "ready"
Next == IF HasReady
        THEN (\E s \in Preparations : Complete(s))
        ELSE (\E r \in Reads, p \in Profiles : ReadStart(r,p))
          \/ (\E r \in Reads : ReadEnd(r))
          \/ (\E s \in Preparations, r \in Reads, k \in Keys : Miss(s,r,k))
          \/ (\E s \in Preparations : PrepareStep(s) \/ Interrupt(s))
          \/ (\E k \in Keys : Evict(k) \/ LruEvict(k) \/ Hit(k))
          \/ (\E k \in Keys, g \in Generations : Purge(k,g))
          \/ (\E p \in Profiles, g \in Generations : DeleteProfile(p,g))
          \/ Close
Spec == Init /\ [][Next]_vars
NoInsertAfterEvict == insertionAllowed
NoStaleReadRetention == insertionFresh
NoPendingLeak == \A k \in Keys : pending[k] = None \/
  (phase[pending[k]] \in {"preparing", "ready"} /\ admitted[pending[k]])
CacheBound == Cardinality(Retained) + Cardinality(PendingKeys) <= Capacity
HitIsComplete == \A k \in Retained : cache[k].complete
OwnSlotCleanup == ownCleanupOK
=============================================================================
