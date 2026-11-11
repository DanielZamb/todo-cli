# Complete and its echo

## Sub-features

Complete commits the intended Version and displays the done Task. Its stream
echo must not cause redundant catalog work.

## How to get to it (user POV)

Complete an open Task while connected to its Profile.

## Driving it with the scratch command

The session completes the fixture's open Task 020, waits for the committed
cursor and asserts done status and full canonical catalog equality. Compare
busy/read-only intervals and request/full-read counts including the echo.
State and contract tests still govern conflicts and rejected writes.

## Gotchas

Do not suppress an event solely because a write is busy. An external operation
can arrive before, during or after the reply. Version, Profile, credential and
restore-generation boundaries must remain authoritative.
