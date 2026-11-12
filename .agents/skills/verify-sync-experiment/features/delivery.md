# Delivery and decoding

## Sub-features

Wake arms, SSE, WebSocket, Codable and JSON/Effect Schema costs.

## How to get to it (user POV)

Run the compiled wake, codec and transport executables.

## Driving it with the loopback server

Every transport frame must decode and advance its Replica. The TypeScript
Replica must equal the final Baseline. Foundation must check cursor and counts.
Retain load, all samples and failure counts; compare alternating arms.

## Gotchas

The prototype route uses existing SSE framing, not the production HttpApi
adapter. Foundation is headless. No native app or Keychain is involved.
