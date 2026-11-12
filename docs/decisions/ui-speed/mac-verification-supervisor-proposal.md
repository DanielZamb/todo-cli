# Proposed ownership outside the app sandbox

Status: proposed, not implemented. The coordinator asked for this proposal if
no compliant startup allowance exists. Visible execution and V02 remain held.
The application profile has not been relaxed.

## Proven startup conflict

The committed profile denies general file reads and allows scratch, the test
bundle and named system runtime resources. Starting the compiled server inside
that profile aborts before readiness. Its own-PID kernel report identifies
`deny(1) file-read-data /`. Adding only ancestor metadata does not help.
Adding only `(allow file-read-data (literal "/"))` makes health return 200.
The server's minimal environment, binary, database and loopback port are otherwise
identical. It has a valid linker signature. A C control that applies the same
profile in-process gets EPERM opening the root directory; the literal-root
mutation permits that open. It reads no directory entries.

This permission is directory data access, not merely metadata or an allowance
confined to scratch. It permits opening the filesystem root for enumeration,
although it does not grant descendant file contents. The coordinator explicitly
excluded out-of-root file allowances, so it is a diagnostic control only.
No allowance contained entirely in scratch can authorize this operation against
`/`. The current native-exec-inside-strict-profile design therefore cannot
start this compiled runtime under that constraint.

## Proposed supervisor

Have the skill launch a small, compiled verification supervisor outside the
application's Seatbelt profile. Keep it separate from every production target.
The supervisor would validate/open/pin the manifest, HOME, temp, CLI/server,
database/sidecars and lock descriptors, then start the compiled scratch server
itself. It retains the child handle and uses the exact seven-key environment
already specified by the correction. It never attaches to an existing server,
parses ps or accepts a PID supplied by arbitrary manifest text.

The supervisor would start the verification app as its second owned child.
The app would retain its strict current profile and require both:

- A checked parent executable whose opened descriptor matches a supervisor hash
  pinned into this qualification build, plus kernel UID/parent/start identity.
- A private inherited control channel from that supervisor, bound to this launch
  with a random challenge. The channel carries the supervisor's retained server
  identity; the app independently checks the server's kernel parent/start,
  accepted database inode and literal-loopback listening socket. No HTTP nonce
  endpoint is invented. The existing health response stays supplemental.

Direct app launches and unrelated supervisors would refuse before any window.
The supervisor holds the checked root/machine locks, owns both child lifetimes,
and ends the run on child exit, control-channel EOF or owner input. Descriptor
handoff must preserve the lock identity rather than reacquiring a different
pathname. Only designated control/lock descriptors may survive exec. Both the
application's HTTP policy and its credential/broker denials remain unchanged.

This preserves the construction guarantee about the actual HOME/database and
the independent open-file/socket check. It avoids granting the application
permission to read `/` or execute a server.

## Confinement that still must be proved

Moving the server outside the app's sandbox alone does not preserve kernel file
and network confinement. An unrestricted scratch HOME is not a sandbox. I do
not propose claiming otherwise or silently giving the server the rejected root
permission in a second profile.

Before accepting this supervisor design, prove a test-only compiled server
bootstrap can install the strict profile after runtime initialization and before
loading any production server code, opening its database or listening. Its
bootstrap must validate and close every pre-opened descriptor outside the
accepted runtime resources/scratch, including any retained root-directory
handle. The server binary and bootstrap resource hashes must be build-pinned,
not self-declared by a manifest. A private pipe can acknowledge that phase; the
supervisor still independently verifies the actual database/listener identity.

This is a feasibility gate, not a proven implementation. If the compiled runtime
needs a retained root-directory data capability after initialization, or closing
that capability prevents normal scratch I/O, the strict constraint remains
unsatisfied. That would require an approved runtime/bootstrap change or a
stronger isolation boundary, rather than broader file or network rules.
No new dependency, production injection seam or HTTP contract change is proposed.

The supervisor design needs a coordinator decision before implementation, as
requested. After that decision the gate must include the unchanged spoof probe,
forged parent/control channel, four marker placements, foreign/replaced server,
hard-link/symlink/swap classes, retained outside descriptors, and every existing
credential/input/lock/receipt control. Final compiled and visible qualification
remains pending.
