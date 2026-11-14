----------------------------- MODULE Discovery -----------------------------
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS Slots, MaxRequests, NoIdentity, Broken

VARIABLES credential, signedIn, dialog, prefix, requestedIdentity, generation,
          credentialGeneration, dialogGeneration, pending, appliedSnapshot,
          phase, showCandidate, showRequest, openedTask, publicationOK, showOK,
          signingOut

vars == <<credential, signedIn, dialog, prefix, requestedIdentity, generation,
          credentialGeneration, dialogGeneration, pending, appliedSnapshot,
          phase, showCandidate, showRequest, openedTask, publicationOK, showOK,
          signingOut>>

Credentials == {"Owner", "Scoped"}
Dialogs == {"Directory", "Lookup"}
Prefixes == {"a", "b"}
Phases == {"Closed", "Editing", "Requesting", "Showing", "Empty", "Error"}
Identities == [credential : Credentials, dialog : Dialogs, prefix : Prefixes]
Identity(c, d, p) == [credential |-> c, dialog |-> d, prefix |-> p]
Authorized(c) == IF c = "Owner" THEN {"work", "personal"} ELSE {"work"}
Snapshot(i, n, rows) == [appliedIdentity |-> i, generation |-> n, rows |-> rows]
EmptySnapshot == Snapshot(NoIdentity, 0, {})
Snapshots == [appliedIdentity : Identities, generation : Slots,
              rows : SUBSET {"work", "personal"}] \cup {EmptySnapshot}
Requests == {n \in Slots : pending[n] # NoIdentity}
Outstanding == Cardinality(Requests) + IF showRequest = EmptySnapshot THEN 0 ELSE 1
Free == Slots \ (Requests \cup {appliedSnapshot.generation,
                               showCandidate.generation, showRequest.generation})
CurrentCredential(n) == signedIn /\ n \in credentialGeneration
CurrentDialog(n) == phase # "Closed" /\ n \in dialogGeneration
Latest(n) == n = generation /\ pending[n] = requestedIdentity
Current(n) == CurrentCredential(n) /\ CurrentDialog(n) /\ Latest(n)
Publish(n) ==
  /\ (CurrentCredential(n) \/ Broken = "credential")
  /\ (CurrentDialog(n) \/ Broken = "dialog")
  /\ pending[n] = requestedIdentity
  /\ (n = generation \/ Broken = "latest")
AppliedCurrent(s) ==
  /\ s # EmptySnapshot
  /\ signedIn /\ phase # "Closed"
  /\ s.generation \in credentialGeneration \cap dialogGeneration
  /\ s.generation = generation
  /\ s.appliedIdentity = requestedIdentity
ShowAllowed ==
  /\ phase = "Showing" /\ dialog = "Lookup"
  /\ AppliedCurrent(appliedSnapshot)
  /\ showCandidate = appliedSnapshot

Init ==
  /\ credential = "Owner" /\ signedIn = TRUE
  /\ dialog = "Lookup" /\ prefix = "a"
  /\ requestedIdentity = Identity("Owner", "Lookup", "a")
  /\ generation = 0 /\ credentialGeneration = {} /\ dialogGeneration = {}
  /\ pending = [n \in Slots |-> NoIdentity]
  /\ appliedSnapshot = EmptySnapshot /\ phase = "Closed"
  /\ showCandidate = EmptySnapshot /\ showRequest = EmptySnapshot
  /\ openedTask = {} /\ publicationOK = TRUE /\ showOK = TRUE
  /\ signingOut = FALSE

Issue(n) ==
  /\ n \in Free /\ Outstanding < MaxRequests
  /\ pending' = [pending EXCEPT ![n] = requestedIdentity]
  /\ generation' = n
  /\ credentialGeneration' = credentialGeneration \cup {n}
  /\ dialogGeneration' = dialogGeneration \cup {n}
  /\ appliedSnapshot' = EmptySnapshot /\ phase' = "Requesting"
  /\ UNCHANGED <<credential, signedIn, dialog, prefix, requestedIdentity,
                 showCandidate, showRequest, openedTask, publicationOK, showOK, signingOut>>

Open(d) ==
  /\ signedIn /\ phase = "Closed"
  /\ dialog' = d
  /\ requestedIdentity' = Identity(credential, d, prefix)
  /\ dialogGeneration' = {} /\ appliedSnapshot' = EmptySnapshot
  /\ phase' = "Editing"
  /\ UNCHANGED <<credential, signedIn, prefix, generation, credentialGeneration,
                 pending, showCandidate, showRequest, openedTask, publicationOK, showOK, signingOut>>

Submit ==
  /\ signedIn /\ phase = "Editing"
  /\ \E n \in Slots : Issue(n)

Retry ==
  /\ signedIn /\ phase = "Error"
  /\ \E n \in Slots : Issue(n)

ResponseOK(n, rows) ==
  /\ n \in Requests /\ rows \subseteq Authorized(pending[n].credential)
  /\ pending' = [pending EXCEPT ![n] = NoIdentity]
  /\ IF Publish(n)
     THEN /\ appliedSnapshot' = Snapshot(pending[n], n, rows)
          /\ showCandidate' = IF pending[n].dialog = "Lookup" /\ rows # {}
                               THEN appliedSnapshot' ELSE showCandidate
          /\ phase' = IF rows = {} THEN "Empty" ELSE "Showing"
          /\ publicationOK' = Current(n)
     ELSE UNCHANGED <<appliedSnapshot, showCandidate, phase, publicationOK, signingOut>>
  /\ UNCHANGED <<credential, signedIn, dialog, prefix, requestedIdentity,
                 generation, credentialGeneration, dialogGeneration,
                 showRequest, openedTask, showOK, signingOut>>

ResponseError(n) ==
  /\ n \in Requests
  /\ pending' = [pending EXCEPT ![n] = NoIdentity]
  /\ IF Publish(n) \/ Broken = "error"
     THEN /\ phase' = "Error" /\ appliedSnapshot' = EmptySnapshot
          /\ publicationOK' = Current(n)
     ELSE UNCHANGED <<phase, appliedSnapshot, publicationOK, signingOut>>
  /\ UNCHANGED <<credential, signedIn, dialog, prefix, requestedIdentity,
                 generation, credentialGeneration, dialogGeneration,
                 showCandidate, showRequest, openedTask, showOK, signingOut>>

EditPrefix(p) ==
  /\ phase # "Closed" /\ dialog = "Lookup" /\ p # prefix
  /\ prefix' = p /\ requestedIdentity' = Identity(credential, dialog, p)
  /\ generation' = 0 /\ phase' = "Editing"
  /\ appliedSnapshot' = IF Broken = "edit-clear" THEN appliedSnapshot ELSE EmptySnapshot
  /\ UNCHANGED <<credential, signedIn, dialog, credentialGeneration,
                 dialogGeneration, pending, showCandidate, showRequest,
                 openedTask, publicationOK, showOK, signingOut>>

Close ==
  /\ phase # "Closed"
  /\ phase' = "Closed" /\ dialogGeneration' = {}
  /\ appliedSnapshot' = IF Broken = "close-clear" THEN appliedSnapshot ELSE EmptySnapshot
  /\ UNCHANGED <<credential, signedIn, dialog, prefix, requestedIdentity,
                 generation, credentialGeneration, pending, showCandidate,
                 showRequest, openedTask, publicationOK, showOK, signingOut>>

\* Sign-out start closes discovery but retains the credential epoch until
\* the server has revoked the credential. Pending replies keep their
\* credential provenance; the cleared dialog generation rejects them.
SignOutStart ==
  /\ signedIn /\ ~signingOut
  /\ signingOut' = TRUE /\ phase' = "Closed" /\ dialogGeneration' = {}
  /\ appliedSnapshot' = IF Broken = "signout-start-clear" THEN appliedSnapshot ELSE EmptySnapshot
  /\ UNCHANGED <<credential, signedIn, dialog, prefix, requestedIdentity,
                 generation, credentialGeneration, pending, showCandidate,
                 showRequest, openedTask, publicationOK, showOK>>

\* A failed or cancelled sign-out leaves the same credential installed and
\* current. Nothing is invalidated or restored.
SignOutFail ==
  /\ signingOut /\ signingOut' = FALSE
  /\ UNCHANGED <<credential, signedIn, dialog, prefix, requestedIdentity,
                 generation, credentialGeneration, dialogGeneration, pending,
                 appliedSnapshot, phase, showCandidate, showRequest, openedTask,
                 publicationOK, showOK>>

\* Committed sign-out after revocation, or Session expiry. Only this step
\* (or CredentialChanged) ends credential provenance.
SignOut ==
  /\ signedIn
  /\ signedIn' = FALSE /\ phase' = "Closed" /\ credentialGeneration' = {}
  /\ appliedSnapshot' = IF Broken = "signout-clear" THEN appliedSnapshot ELSE EmptySnapshot
  /\ openedTask' = {} /\ signingOut' = FALSE
  /\ UNCHANGED <<credential, dialog, prefix, requestedIdentity, generation,
                 dialogGeneration, pending, showCandidate, showRequest, publicationOK, showOK>>

CredentialChanged(c) ==
  /\ ~signingOut
  /\ credential' = c /\ signedIn' = TRUE
  /\ credentialGeneration' = {} /\ appliedSnapshot' = EmptySnapshot /\ openedTask' = {}
  /\ requestedIdentity' = Identity(c, dialog, prefix)
  /\ phase' = IF phase = "Closed" THEN "Closed" ELSE "Editing"
  /\ UNCHANGED <<dialog, prefix, generation, dialogGeneration, pending,
                 showCandidate, showRequest, publicationOK, showOK, signingOut>>

Show ==
  /\ showCandidate # EmptySnapshot /\ showCandidate.rows # {}
  /\ showCandidate.appliedIdentity.dialog = "Lookup"
  /\ ShowAllowed \/ Broken = "show-guard"
  /\ showRequest' = IF Broken = "show-source" THEN EmptySnapshot ELSE showCandidate
  /\ showOK' = (ShowAllowed /\ showRequest' = showCandidate)
  /\ phase' = "Closed" /\ appliedSnapshot' = EmptySnapshot /\ dialogGeneration' = {}
  /\ UNCHANGED <<credential, signedIn, dialog, prefix, requestedIdentity,
                 generation, credentialGeneration, pending, showCandidate,
                 openedTask, publicationOK, signingOut>>

ShowResponseOK(p) ==
  /\ showRequest # EmptySnapshot /\ p \in showRequest.rows
  /\ IF CurrentCredential(showRequest.generation) \/ Broken = "show-credential"
     THEN /\ openedTask' = {p}
          /\ showOK' = (CurrentCredential(showRequest.generation)
                       /\ p \in Authorized(credential))
     ELSE UNCHANGED <<openedTask, showOK, signingOut>>
  /\ showRequest' = EmptySnapshot
  /\ UNCHANGED <<credential, signedIn, dialog, prefix, requestedIdentity,
                 generation, credentialGeneration, dialogGeneration, pending,
                 appliedSnapshot, phase, showCandidate, publicationOK, signingOut>>

ShowResponseError ==
  /\ showRequest # EmptySnapshot /\ showRequest' = EmptySnapshot
  /\ UNCHANGED <<credential, signedIn, dialog, prefix, requestedIdentity,
                 generation, credentialGeneration, dialogGeneration, pending,
                 appliedSnapshot, phase, showCandidate, openedTask, publicationOK, showOK, signingOut>>

Next ==
  \/ \E d \in Dialogs : Open(d)
  \/ Submit \/ Retry
  \/ \E n \in Slots : (\E rows \in SUBSET {"work", "personal"} : ResponseOK(n, rows))
                         \/ ResponseError(n)
  \/ \E p \in Prefixes : EditPrefix(p)
  \/ Close \/ SignOutStart \/ SignOutFail \/ SignOut \/ \E c \in Credentials : CredentialChanged(c)
  \/ Show \/ \E p \in {"work", "personal"} : ShowResponseOK(p)
  \/ ShowResponseError

Spec == Init /\ [][Next]_vars
GenerationSymmetry == Permutations(Slots)

TypeOK ==
  /\ credential \in Credentials /\ signedIn \in BOOLEAN
  /\ dialog \in Dialogs /\ prefix \in Prefixes
  /\ requestedIdentity \in Identities /\ generation \in Slots \cup {0}
  /\ credentialGeneration \subseteq Slots /\ dialogGeneration \subseteq Slots
  /\ pending \in [Slots -> Identities \cup {NoIdentity}]
  /\ Outstanding <= MaxRequests
  /\ appliedSnapshot \in Snapshots /\ showCandidate \in Snapshots /\ showRequest \in Snapshots
  /\ openedTask \subseteq {"work", "personal"}
  /\ phase \in Phases /\ publicationOK \in BOOLEAN /\ showOK \in BOOLEAN
  /\ signingOut \in BOOLEAN
CurrentCredentialProvenance ==
  appliedSnapshot.rows # {} =>
    /\ signedIn /\ appliedSnapshot.generation \in credentialGeneration
    /\ appliedSnapshot.appliedIdentity.credential = credential
    /\ appliedSnapshot.rows \subseteq Authorized(credential)
CurrentDialogProvenance ==
  appliedSnapshot.rows # {} =>
    /\ appliedSnapshot.generation \in dialogGeneration
    /\ appliedSnapshot.appliedIdentity.dialog = dialog
LatestPublication == publicationOK
AppliedIsCurrent == appliedSnapshot.rows # {} => AppliedCurrent(appliedSnapshot)
ClosedIsEmpty == phase = "Closed" => appliedSnapshot.rows = {}
SignedOutIsEmpty == ~signedIn => appliedSnapshot.rows = {} /\ openedTask = {}
ShowIsAuthorized == showOK
=============================================================================
