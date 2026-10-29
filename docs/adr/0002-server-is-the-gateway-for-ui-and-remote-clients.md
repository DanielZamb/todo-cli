# The server is the gateway for UI and remote clients

The SwiftUI and Electron apps, and later remote clients over Tailscale, never open the SQLite file. They go through the local server. Reading the file directly from Swift looked simpler, but writes would have forced a third copy of the domain rules into Swift. A phone client would also need a server anyway. The CLI is the only other process that opens the database, and it does so through the shared domain package (see ADR-0001).
