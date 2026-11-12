# Credential and lifecycle isolation

Status: requalification pending. Visible runs and V02 are held; follow the current SKILL.md. Historical driving instructions below do not release either hold.

## Sub-features

Memory-only Session storage, fatal credential traps, separate bundle identity,
and exclusion of production startup and managed-server implementation.

## How to get to it (user POV)

Use the verification scheme. The Server Settings page states that managed
controls are unavailable. Production schemes keep their existing behavior.

## Driving it with the V01 helper

Audit the verification target's source membership, linked symbols and resources.
Its executable must import the credential trap library, use the memory adapter
and contain no production SessionVault implementation or ServerLifecycle.
TrapProbe must verify interception before attempting a credential symbol and
then exit 79. Production linked symbols must contain its normal SessionVault
and contain no VerificationManifest or MemorySessionVault.

## Gotchas

Security framework linkage for a fatal interposer is intentional and must be
distinguished from an application credential call. A newly imported credential
symbol outside the trap list fails the audit. No trap test may call an original
Security function if interception is absent.
