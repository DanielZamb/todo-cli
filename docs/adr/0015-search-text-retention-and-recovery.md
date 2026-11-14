# Search text survives navigation and recovers through live updates

Accepted, 2026-11-09. Amends the client reset and recovery policy in ADR-0014.

Toolbar search text stays visible and survives Profile and view switches in
both desktop clients. Those switches invalidate outstanding requests, clear the
previous selection's result snapshot and reset dialog filters. Esc clears the
text. Existing editor draft protection continues to apply during navigation.

Pending and failed search retains the last applied rows and highlights from one
response snapshot. A disconnect keeps that snapshot visible in read-only mode.
A first read failure with no snapshot displays an error and Retry, rather than
an empty Profile. Search remains available in Compact detail and Quick add.

Retry explicitly issues the current requested identity. A current-Profile SSE
reconnection or committed operation also issues it, including while search is
in Error. Search has no timer-based automatic retry. A healthy stream stays open
when a search read fails. Dialog filter failures keep their existing rollback;
typed search text stays as entered.

Convergence is conditional: after input and ordinary refresh traffic settle,
debounce and successful responses must be weakly fair. While in Error, at least
one of Retry, current-Profile SSE reconnection or an SSE operation must be weakly
fair. No recovery event means Error can persist. The formal skill retains that
failing no-recovery trace separately from its safety checks.

We rejected clearing search on navigation, clearing retained results on a
disconnect, reverting typed text after failure, and timer-based search retries.
They interrupt the search or hide the information needed to recover it.

## Amendment, 2026-11-11: quiet stream recovery

An idle event stream is healthy. A clean end first attempts to resume with the
saved cursor while retaining availability and open UI state. Offline begins
only after that reconnect fails. An open discovery dialog retries its retained
submission when connectivity returns.

A successfully applied result at the current identity, cursor and restore
generation needs no catalog reads on a quiet reconnect. Failed, too-broad,
missing or superseded results still retry the requested identity. Snapshot
reload and generation change retain their reset and refresh behavior. This
clarifies the recovery rule above; it does not add a timer-based search retry.
