# Stop when input arrives

Status: requalification pending. Visible runs and V02 are held; follow the current SKILL.md. Historical driving instructions below do not release either hold.

## Sub-features

Frontmost-app and one-minute idle preflight, local input receipt, session input
polling, and a marked posted-event control.

## How to get to it (user POV)

The separate app checks preflight before creating its window. It exits when
input resumes. The production apps stay untouched in the background.

## Driving it with the V01 helper

After AX resolves local.todo.verification and its owned PID, reads both seeded
Tasks and saves a capture, the helper creates interruption-control in that
run's private scratch root. The app posts a private-source F20 keyDown carrying
the V01 test marker into its own NSApplication queue. Its local event monitor
must identify the marker and exit 80. interruption.json records the API and
real exit. This proves in-process posted-event handling; it does not establish
WindowServer delivery or physical input.

An unmarked event in the verification window uses the same monitor and stops
the app. Input elsewhere in the session updates the idle clock, checked every
100 ms. The pure clock predicate has quiet/recent-input fixtures and an inverted
scratch-source red control. An offscreen NSApplication event loop also runs
with the local monitor removed; its expected-exit test must fail. No keyboard
content or pointer location is recorded.

## Gotchas

Never post globally or target either production app. A real-input abort is a
stopped run. Capture its receipt and tell the coordinator; do not retry
automatically. Every later visible run needs a fresh successful preflight.
