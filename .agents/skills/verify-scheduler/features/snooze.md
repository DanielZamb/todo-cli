# Snooze wake-ups

## Sub-features

Wake at scheduled_at instant, atomic TaskReopened History and restart recovery.

## How to get to it (user POV)

A snoozed Task with an elapsed scheduled_at instant becomes open automatically.

## Driving it with compiled server and HTTP

The helper provisions a snoozed Task through the domain API. Stop the server
mid-wait and restart after the deadline. Observe open at Version 2 and one
TaskReopened operation, even with two schedulers sharing the scratch database.

## Gotchas

There is no HTTP snooze command in S01. Fixture provisioning uses the public
domain event API. Date-only scheduled_at values do not wake automatically.
A trigger-failure behavior test proves wake and reminder receipt roll back together.
